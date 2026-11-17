import { useQuery, type QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { aggregateAlbums } from '../domain/albums'
import { classifyPlaylists } from '../domain/playlists'
import type { Album } from '../domain/types'
import {
  checkLibraryContains,
  getFollowedArtistIds,
  getMe,
  getMyPlaylists,
  getPlaylistItems,
} from '../spotify/endpoints'

export const queryKeys = {
  me: ['me'] as const,
  playlists: (meId: string | undefined) => ['playlists', meId] as const,
  playlistAlbums: (playlistId: string | null) =>
    ['playlistAlbums', playlistId] as const,
  savedAlbums: (playlistId: string | null, albumsUpdatedAt: number) =>
    ['savedAlbums', playlistId, albumsUpdatedAt] as const,
  followedArtists: ['followedArtists'] as const,
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => getMe(signal),
  })
}

export function usePlaylists(meId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.playlists(meId),
    queryFn: async ({ signal }) =>
      classifyPlaylists(await getMyPlaylists(signal), meId ?? ''),
    enabled: meId !== undefined,
  })
}

export type LoadProgress = { loaded: number; total: number }

export function usePlaylistAlbums(playlistId: string | null, enabled: boolean) {
  const [progress, setProgress] = useState<{
    playlistId: string
    value: LoadProgress | null
  } | null>(null)

  const query = useQuery({
    queryKey: queryKeys.playlistAlbums(playlistId),
    queryFn: async ({ signal }): Promise<Album[]> => {
      const id = playlistId ?? ''
      setProgress({ playlistId: id, value: null })
      const items = await getPlaylistItems(id, {
        signal,
        onProgress: (loaded, total) =>
          setProgress({ playlistId: id, value: { loaded, total } }),
      })
      return aggregateAlbums(items)
    },
    enabled: enabled && playlistId !== null,
  })

  return {
    query,
    progress: progress?.playlistId === playlistId ? progress.value : null,
  }
}

export function useSavedAlbums(
  playlistId: string | null,
  albums: readonly Album[] | undefined,
  albumsUpdatedAt: number,
) {
  return useQuery({
    queryKey: queryKeys.savedAlbums(playlistId, albumsUpdatedAt),
    queryFn: async ({ signal }) => {
      const list = albums ?? []
      const flags = await checkLibraryContains(
        list.map((album) => album.uri),
        signal,
      )
      return new Map(list.map((album, i) => [album.id, flags[i]]))
    },
    enabled: albums !== undefined && albums.length > 0,
  })
}

export function useFollowedArtists(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.followedArtists,
    queryFn: ({ signal }) => getFollowedArtistIds(signal),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function reloadSpotifyData(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] !== 'savedAlbums',
  })
}
