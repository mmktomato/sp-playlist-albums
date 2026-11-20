import type {
  SpotifyArtist,
  SpotifyMe,
  SpotifyPlaylistItem,
  SpotifyPublicUser,
  SpotifySimplifiedAlbum,
  SpotifySimplifiedArtist,
  SpotifySimplifiedPlaylist,
} from '../../../src/spotify/types.ts'

export type Dataset = {
  me: SpotifyMe
  playlists: SpotifySimplifiedPlaylist[]
  playlistItems: Map<string, SpotifyPlaylistItem[]>
  followedArtists: SpotifyArtist[]
  savedAlbumIds: Set<string>
}

export const ME: SpotifyMe = {
  id: 'me-user',
  display_name: 'Me',
  uri: 'spotify:user:me-user',
}

export const FRIEND: SpotifyPublicUser = {
  id: 'friend-user',
  display_name: 'Friend',
}

export const SPOTIFY_USER: SpotifyPublicUser = {
  id: 'spotify',
  display_name: 'Spotify',
}

export function artist(id: string, name: string): SpotifySimplifiedArtist {
  return { id, name, uri: `spotify:artist:${id}` }
}

export function imageUrl(albumId: string): string {
  return `https://i.scdn.co/image/${albumId}`
}

export function album(
  id: string,
  name: string,
  artists: SpotifySimplifiedArtist[],
  {
    image = true,
    totalTracks = 10,
  }: { image?: boolean; totalTracks?: number } = {},
): SpotifySimplifiedAlbum {
  return {
    id,
    name,
    uri: `spotify:album:${id}`,
    images: image ? [{ url: imageUrl(id), width: 300, height: 300 }] : [],
    artists,
    total_tracks: totalTracks,
  }
}

export function trackEntry(
  trackId: string,
  trackAlbum: SpotifySimplifiedAlbum,
  trackArtists: SpotifySimplifiedArtist[] = trackAlbum.artists ?? [],
): SpotifyPlaylistItem {
  return {
    is_local: false,
    item: {
      type: 'track',
      id: trackId,
      name: `Track ${trackId}`,
      uri: `spotify:track:${trackId}`,
      is_local: false,
      album: trackAlbum,
      artists: trackArtists,
    },
  }
}

export function localEntry(): SpotifyPlaylistItem {
  return {
    is_local: true,
    item: {
      type: 'track',
      id: null,
      name: 'Local Track',
      uri: 'spotify:local:artist:album:track:180',
      is_local: true,
      album: { id: null, name: 'Local Album', uri: null, images: [] },
      artists: [],
    },
  }
}

export function episodeEntry(): SpotifyPlaylistItem {
  return {
    is_local: false,
    track: {
      type: 'episode',
      id: 'episode-1',
      name: 'Podcast Episode',
      uri: 'spotify:episode:episode-1',
      album: {
        id: 'show-1',
        name: 'Podcast Show',
        uri: 'spotify:show:show-1',
        images: [],
      },
    },
  }
}

export type PlaylistMeta = {
  id: string
  name: string
  owner: SpotifyPublicUser
  collaborative?: boolean
}

export function addPlaylist(
  data: Dataset,
  meta: PlaylistMeta,
  entries?: SpotifyPlaylistItem[],
): void {
  const playlist: SpotifySimplifiedPlaylist = {
    id: meta.id,
    name: meta.name,
    uri: `spotify:playlist:${meta.id}`,
    collaborative: meta.collaborative ?? false,
    owner: meta.owner,
    images: [],
  }
  if (entries) {
    playlist.items = {
      href: `https://api.spotify.com/v1/playlists/${meta.id}/items`,
      total: entries.length,
    }
    data.playlistItems.set(meta.id, entries)
  }
  data.playlists.push(playlist)
}

export const FOLLOWED_ARTIST = artist('artist-followed', 'Followed Artist')
export const OTHER_ARTIST = artist('artist-other', 'Other Artist')
export const THIRD_ARTIST = artist('artist-third', 'Third Artist')

export const ALPHA = album('alpha', 'Alpha Album', [FOLLOWED_ARTIST], {
  totalTracks: 12,
})
export const BRAVO = album('bravo', 'Bravo Album', [OTHER_ARTIST], {
  totalTracks: 1,
})
export const CHARLIE = album('charlie', 'Charlie Album', [THIRD_ARTIST], {
  image: false,
  totalTracks: 8,
})
export const DELTA = album('delta', 'Delta Album', [OTHER_ARTIST])
export const ECHO = album('echo', 'Echo Album', [THIRD_ARTIST])
export const FOXTROT = album('foxtrot', 'Foxtrot Album', [OTHER_ARTIST])

export const PLAYLISTS = {
  mine: { id: 'pl-mine', name: 'Morning Mix', owner: ME },
  second: { id: 'pl-second', name: 'Second Set', owner: ME },
  shared: {
    id: 'pl-shared',
    name: 'Shared Jam',
    owner: FRIEND,
    collaborative: true,
  },
  friend: { id: 'pl-friend', name: 'Friend Picks', owner: FRIEND },
  radar: { id: 'pl-radar', name: 'Release Radar', owner: SPOTIFY_USER },
} satisfies Record<string, PlaylistMeta>

export const FOLLOWED_FILLER_COUNT = 55

export function createDataset(): Dataset {
  const data: Dataset = {
    me: ME,
    playlists: [],
    playlistItems: new Map(),
    followedArtists: [],
    savedAlbumIds: new Set([ALPHA.id!, CHARLIE.id!]),
  }

  addPlaylist(data, PLAYLISTS.mine, [
    trackEntry('t1', ALPHA),
    trackEntry('t2', BRAVO, [OTHER_ARTIST, FOLLOWED_ARTIST]),
    trackEntry('t3', ALPHA),
    localEntry(),
    episodeEntry(),
    trackEntry('t4', CHARLIE),
  ])
  addPlaylist(data, PLAYLISTS.second, [
    trackEntry('t5', DELTA),
    trackEntry('t6', ECHO),
  ])
  addPlaylist(data, PLAYLISTS.shared, [trackEntry('t7', FOXTROT)])
  addPlaylist(data, PLAYLISTS.friend)
  addPlaylist(data, PLAYLISTS.radar)

  for (let i = 0; i < FOLLOWED_FILLER_COUNT; i++) {
    data.followedArtists.push({
      id: `artist-filler-${i}`,
      name: `Filler Artist ${i}`,
    })
  }
  data.followedArtists.push({
    id: FOLLOWED_ARTIST.id!,
    name: FOLLOWED_ARTIST.name,
  })

  return data
}
