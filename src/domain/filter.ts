import type { Album } from './types'

export function filterByFollowedAlbumArtists(
  albums: readonly Album[],
  followedIds: ReadonlySet<string>,
): Album[] {
  return albums.filter((album) =>
    album.artists.some((artist) => followedIds.has(artist.id)),
  )
}
