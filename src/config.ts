export const SPOTIFY_CLIENT_ID: string =
  import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? ''

export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-follow-read',
  'user-library-read',
] as const

export const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
export const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1'

export function getRedirectUri(): string {
  return location.origin + import.meta.env.BASE_URL
}
