export const E2E_CLIENT_ID = 'e2e-test-client-id'

export const MODIFY_SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
]

export const REQUIRED_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-follow-read',
  'user-library-read',
  ...MODIFY_SCOPES,
]

export const OFFLINE_TEXT = "Can't connect to Spotify. The app is unavailable."
export const LOGIN_BUTTON = 'Log in with Spotify'
export const SELECT_PROMPT = 'Choose a playlist from the menu'
