import {
  ApiError,
  AuthError,
  ForbiddenError,
  NetworkError,
  QuotaExceededError,
} from '../../errors'

export const OFFLINE_MESSAGE =
  "Can't connect to Spotify. The app is unavailable."

export type ErrorKind =
  | 'offline'
  | 'not-allowed-user'
  | 'forbidden'
  | 'quota'
  | 'auth'
  | 'api'
  | 'unknown'

export type ErrorDescription = {
  kind: ErrorKind
  title: string
  detail?: string
  retryable: boolean
}

export type ErrorSource = 'playlist-items' | 'other'

export function describeError(
  error: unknown,
  source: ErrorSource = 'other',
): ErrorDescription {
  if (error instanceof NetworkError) {
    return { kind: 'offline', title: OFFLINE_MESSAGE, retryable: true }
  }
  if (error instanceof ForbiddenError) {
    return error.scope === 'user'
      ? {
          kind: 'not-allowed-user',
          title: "This account isn't allowed to use the app",
          detail:
            'Ask the app admin to add your account under User Management in the Spotify Developer Dashboard.',
          retryable: false,
        }
      : {
          kind: 'forbidden',
          title: "Can't load due to Spotify restrictions",
          retryable: false,
        }
  }
  if (error instanceof QuotaExceededError) {
    return {
      kind: 'quota',
      title: 'Spotify API rate limit reached',
      detail: 'Please wait a while and try again.',
      retryable: true,
    }
  }
  if (error instanceof AuthError) {
    return {
      kind: 'auth',
      title: 'Session expired. Please log in again.',
      retryable: false,
    }
  }
  if (error instanceof ApiError) {
    const playlistNotFound = error.status === 404 && source === 'playlist-items'
    return {
      kind: 'api',
      title: playlistNotFound
        ? 'Playlist not found'
        : "Couldn't load data from Spotify",
      detail: `Error code: ${error.status}`,
      retryable: !playlistNotFound,
    }
  }
  return {
    kind: 'unknown',
    title: 'Something went wrong',
    retryable: true,
  }
}
