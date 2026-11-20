export type SpotifyImage = {
  url: string
  height: number | null
  width: number | null
}

export type SpotifyExternalUrls = {
  spotify?: string
}

export type SpotifyMe = {
  id: string
  display_name: string | null
  uri: string
  href?: string
  images?: SpotifyImage[]
  external_urls?: SpotifyExternalUrls
}

export type SpotifyPublicUser = {
  id: string
  display_name?: string | null
  uri?: string
  type?: 'user'
}

export type SpotifyPaging<T> = {
  items: T[]
  next: string | null
  total: number
  href?: string
  limit?: number
  offset?: number
  previous?: string | null
}

export type SpotifyCursorPaging<T> = {
  items: T[]
  next: string | null
  cursors: {
    after: string | null
    before?: string | null
  } | null
  total?: number
  href?: string
  limit?: number
}

export type SpotifyPlaylistItemsRef = {
  href: string
  total: number
}

export type SpotifySimplifiedPlaylist = {
  id: string
  name: string
  uri: string
  collaborative: boolean
  public?: boolean | null
  description?: string | null
  owner: SpotifyPublicUser
  images: SpotifyImage[] | null
  snapshot_id?: string
  external_urls?: SpotifyExternalUrls
  items?: SpotifyPlaylistItemsRef
  /** @deprecated Replaced by `items`. */
  tracks?: SpotifyPlaylistItemsRef
}

export type SpotifySimplifiedArtist = {
  id: string | null
  name: string
  uri?: string | null
}

export type SpotifySimplifiedAlbum = {
  id: string | null
  name: string
  uri: string | null
  images?: SpotifyImage[]
  artists?: SpotifySimplifiedArtist[]
  total_tracks?: number
}

export type SpotifyTrack = {
  type: 'track'
  id?: string | null
  name?: string
  uri?: string | null
  is_local?: boolean
  album?: SpotifySimplifiedAlbum | null
  artists?: SpotifySimplifiedArtist[]
}

export type SpotifyEpisode = {
  type: 'episode'
  id?: string | null
  name?: string
  uri?: string | null
  album?: SpotifySimplifiedAlbum | null
}

export type SpotifyPlaylistItemContent = SpotifyTrack | SpotifyEpisode

export type SpotifyPlaylistItem = {
  is_local: boolean
  added_at?: string | null
  item?: SpotifyPlaylistItemContent | null
  /** @deprecated Replaced by `item`. */
  track?: SpotifyPlaylistItemContent | null
}

export type SpotifyArtist = {
  id: string
  name: string
  uri?: string
  type?: 'artist'
}

export type SpotifyFollowedArtistsResponse = {
  artists: SpotifyCursorPaging<SpotifyArtist>
}

export type SpotifyLibraryContainsResponse = boolean[]

export type SpotifyRemoveItemsResponse = {
  snapshot_id: string
}

export type SpotifyErrorBody = {
  error: {
    status: number
    message: string
    reason?: string
  }
}

export type SpotifyTokenResponse = {
  access_token: string
  token_type: string
  scope?: string
  expires_in: number
  refresh_token?: string
}

export type SpotifyTokenErrorBody = {
  error: string
  error_description?: string
}
