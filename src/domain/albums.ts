import type {
  SpotifyPlaylistItem,
  SpotifySimplifiedAlbum,
} from '../spotify/types'
import { pickImageUrl } from './images'
import type { Album, AlbumArtist } from './types'

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

    const existing = albums.get(id)
    if (existing) {
      existing.trackCount += 1
      continue
    }
    albums.set(id, {
      id,
      name: album.name,
      uri: album.uri ?? `spotify:album:${id}`,
      url: albumUrl(id),
      imageUrl: pickImageUrl(album.images),
      artists: toAlbumArtists(album),
      trackCount: 1,
      totalTracks: toTotalTracks(album.total_tracks),
    })
  }
  return [...albums.values()]
}
