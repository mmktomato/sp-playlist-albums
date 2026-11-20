import type {
  SpotifyPlaylistItem,
  SpotifySimplifiedAlbum,
} from '../spotify/types'
import { pickImageUrl } from './images'
import type { Album, AlbumArtist } from './types'

const TRACK_URI_PATTERN = /^spotify:track:[A-Za-z0-9]+$/

function toTotalTracks(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function albumUrl(id: string): string {
  return `https://open.spotify.com/album/${id}`
}

function toAlbumArtists(album: SpotifySimplifiedAlbum): AlbumArtist[] {
  const artists: AlbumArtist[] = []
  for (const artist of album.artists ?? []) {
    if (artist.id) artists.push({ id: artist.id, name: artist.name })
  }
  return artists
}

export function aggregateAlbums(
  entries: readonly (SpotifyPlaylistItem | null | undefined)[],
): Album[] {
  const albums = new Map<string, Album>()
  for (const entry of entries) {
    if (!entry || entry.is_local) continue
    const content = entry.item ?? entry.track
    if (!content || content.type !== 'track' || content.is_local) continue
    const album = content.album
    const id = album?.id
    if (!album || !id) continue

    let target = albums.get(id)
    if (target) {
      target.trackCount += 1
    } else {
      target = {
        id,
        name: album.name,
        uri: album.uri ?? `spotify:album:${id}`,
        url: albumUrl(id),
        imageUrl: pickImageUrl(album.images),
        artists: toAlbumArtists(album),
        trackCount: 1,
        totalTracks: toTotalTracks(album.total_tracks),
        trackUris: [],
        removable: true,
      }
      albums.set(id, target)
    }
    const uri = content.uri
    if (typeof uri === 'string' && TRACK_URI_PATTERN.test(uri)) {
      if (!target.trackUris.includes(uri)) target.trackUris.push(uri)
    } else {
      target.removable = false
    }
  }
  return [...albums.values()]
}
