import { ApiError, AuthError, PartialRemovalError } from '../errors'
import { spotifyFetch, type QueryValue } from './client'
import {
  fetchAllCursorPages,
  fetchAllOffsetPages,
  type ProgressCallback,
} from './paginate'
import type {
  SpotifyArtist,
  SpotifyFollowedArtistsResponse,
  SpotifyLibraryContainsResponse,
  SpotifyMe,
  SpotifyPlaylistItem,
  SpotifyPlaylistItemContent,
  SpotifyRemoveItemsResponse,
  SpotifySimplifiedPlaylist,
} from './types'

export const PAGE_LIMIT = 50
export const LIBRARY_CONTAINS_CHUNK_SIZE = 40
export const REMOVE_ITEMS_CHUNK_SIZE = 100

const CONTENT_FIELDS =
  'type,uri,album(id,name,uri,images,artists(id,name),total_tracks)'
export const PLAYLIST_ITEMS_FIELDS = `items(is_local,item(${CONTENT_FIELDS}),track(${CONTENT_FIELDS})),next,total`

export function entryTrack(
  entry: SpotifyPlaylistItem | null | undefined,
): SpotifyPlaylistItemContent | null {
  return entry?.item ?? entry?.track ?? null
}

export function getMe(signal?: AbortSignal): Promise<SpotifyMe> {
  return spotifyFetch<SpotifyMe>('/me', { signal })
}

export async function getMyPlaylists(
  signal?: AbortSignal,
): Promise<SpotifySimplifiedPlaylist[]> {
  const playlists = await fetchAllOffsetPages<SpotifySimplifiedPlaylist | null>(
    '/me/playlists',
    { signal, query: { limit: PAGE_LIMIT } },
  )
  return playlists.filter((p): p is SpotifySimplifiedPlaylist => p !== null)
}

export type PlaylistItemsOptions = {
  signal?: AbortSignal
  onProgress?: ProgressCallback
  fields?: boolean
}

function playlistItemsPath(playlistId: string): string {
  return `/playlists/${encodeURIComponent(playlistId)}/items`
}

function playlistItemsQuery(fields: boolean): Record<string, QueryValue> {
  return {
    limit: PAGE_LIMIT,
    fields: fields ? PLAYLIST_ITEMS_FIELDS : undefined,
  }
}

export async function getPlaylistItems(
  playlistId: string,
  options: PlaylistItemsOptions = {},
): Promise<SpotifyPlaylistItem[]> {
  const { signal, onProgress, fields = true } = options
  const entries = await fetchAllOffsetPages<SpotifyPlaylistItem | null>(
    playlistItemsPath(playlistId),
    { signal, onProgress, query: playlistItemsQuery(fields) },
  )
  return entries.filter((e): e is SpotifyPlaylistItem => e !== null)
}

export function getPlaylistItemsFirstPageRaw(
  playlistId: string,
  options: Omit<PlaylistItemsOptions, 'onProgress'> = {},
): Promise<unknown> {
  const { signal, fields = true } = options
  return spotifyFetch<unknown>(playlistItemsPath(playlistId), {
    signal,
    query: playlistItemsQuery(fields),
  })
}

export async function removePlaylistItems(
  playlistId: string,
  uris: readonly string[],
): Promise<void> {
  if (!playlistId) throw new Error('playlistId is required')
  if (uris.length === 0) throw new Error('uris must not be empty')

  const chunks: string[][] = []
  for (let i = 0; i < uris.length; i += REMOVE_ITEMS_CHUNK_SIZE) {
    chunks.push(uris.slice(i, i + REMOVE_ITEMS_CHUNK_SIZE))
  }
  for (const [index, chunk] of chunks.entries()) {
    try {
      // No AbortSignal: a sent removal cannot be undone, so aborting gains nothing.
      await spotifyFetch<SpotifyRemoveItemsResponse>(
        playlistItemsPath(playlistId),
        { method: 'DELETE', body: { items: chunk.map((uri) => ({ uri })) } },
      )
    } catch (error) {
      if (index === 0 || error instanceof AuthError) throw error
      throw new PartialRemovalError(index, undefined, { cause: error })
    }
  }
}

export async function getFollowedArtistIds(
  signal?: AbortSignal,
): Promise<Set<string>> {
  const artists = await fetchAllCursorPages<
    SpotifyFollowedArtistsResponse,
    SpotifyArtist | null
  >('/me/following', {
    signal,
    query: { type: 'artist', limit: PAGE_LIMIT },
    select: (response) => response.artists,
  })
  return new Set(artists.flatMap((artist) => (artist?.id ? [artist.id] : [])))
}

export async function checkLibraryContains(
  uris: readonly string[],
  signal?: AbortSignal,
): Promise<boolean[]> {
  const chunks: string[][] = []
  for (let i = 0; i < uris.length; i += LIBRARY_CONTAINS_CHUNK_SIZE) {
    chunks.push(uris.slice(i, i + LIBRARY_CONTAINS_CHUNK_SIZE))
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const result = await spotifyFetch<SpotifyLibraryContainsResponse>(
        '/me/library/contains',
        { signal, query: { uris: chunk.join(',') } },
      )
      if (!Array.isArray(result) || result.length !== chunk.length) {
        throw new ApiError(200, 'Unexpected library/contains response')
      }
      return result
    }),
  )
  return results.flat()
}
