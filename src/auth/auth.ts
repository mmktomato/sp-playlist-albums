import {
  SPOTIFY_AUTHORIZE_URL,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_SCOPES,
  SPOTIFY_TOKEN_URL,
  getRedirectUri,
} from '../config'
import { ApiError, AuthError, NetworkError } from '../errors'
import type {
  SpotifyTokenErrorBody,
  SpotifyTokenResponse,
} from '../spotify/types'
import { assignLocation, replaceLocation } from './navigation'
import {
  createCodeChallenge,
  generateCodeVerifier,
  generateState,
} from './pkce'
import {
  type StoredTokens,
  clearPkce,
  clearTokens,
  loadPkce,
  loadTokens,
  savePkce,
  saveTokens,
} from './tokenStore'

export type CallbackResult =
  'none' | 'ok' | 'denied' | 'missing-verifier' | 'error'

export type GetAccessTokenOptions = {
  rejectedToken?: string
}

export const REFRESH_LOCK_NAME = 'sp-token-refresh'
export const EXPIRY_MARGIN_MS = 60_000

const CALLBACK_PARAMS = ['code', 'state', 'error', 'error_description']

class InvalidGrantError extends Error {}

export async function login(): Promise<void> {
  if (!SPOTIFY_CLIENT_ID) {
    throw new Error('Spotify client ID is not configured')
  }
  const verifier = generateCodeVerifier()
  const state = generateState()
  const challenge = await createCodeChallenge(verifier)
  savePkce({ verifier, state })

  const url = new URL(SPOTIFY_AUTHORIZE_URL)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES.join(' '),
    redirect_uri: getRedirectUri(),
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  }).toString()
  assignLocation(url.toString())
}

export async function handleCallback(url: URL): Promise<CallbackResult> {
  if (!url.searchParams.has('code') && !url.searchParams.has('error')) {
    return 'none'
  }
  try {
    return await processCallback(url.searchParams)
  } finally {
    clearPkce()
    removeCallbackParams(url)
  }
}

async function processCallback(
  params: URLSearchParams,
): Promise<CallbackResult> {
  const error = params.get('error')
  if (error !== null) {
    return error === 'access_denied' ? 'denied' : 'error'
  }
  const code = params.get('code')
  if (!code) {
    return 'error'
  }
  const pkce = loadPkce()
  if (!pkce) {
    return 'missing-verifier'
  }
  if (params.get('state') !== pkce.state) {
    return 'error'
  }

  let response: Response
  try {
    response = await postToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: pkce.verifier,
    })
  } catch {
    return 'error'
  }
  if (!response.ok) {
    return 'error'
  }
  const body = await readTokenResponse(response)
  if (!body) {
    return 'error'
  }
  saveTokens(toStoredTokens(body))
  return 'ok'
}

function removeCallbackParams(url: URL): void {
  const cleaned = new URL(url)
  for (const name of CALLBACK_PARAMS) {
    cleaned.searchParams.delete(name)
  }
  history.replaceState(
    history.state,
    '',
    cleaned.pathname + cleaned.search + cleaned.hash,
  )
}

let inFlightRefresh: Promise<string> | null = null

export async function getAccessToken(
  opts: GetAccessTokenOptions = {},
): Promise<string> {
  const tokens = loadTokens()
  if (!tokens) {
    throw new AuthError('Not logged in')
  }
  if (isUsable(tokens, opts.rejectedToken)) {
    return tokens.accessToken
  }
  inFlightRefresh ??= refreshExclusively(
    tokens.accessToken,
    opts.rejectedToken,
  ).finally(() => {
    inFlightRefresh = null
  })
  return inFlightRefresh
}

function isUsable(tokens: StoredTokens, rejectedToken?: string): boolean {
  return (
    tokens.accessToken !== '' &&
    tokens.accessToken !== rejectedToken &&
    tokens.expiresAt - EXPIRY_MARGIN_MS > Date.now()
  )
}

function findUpdatedToken(
  staleToken: string,
  rejectedToken?: string,
): string | null {
  const tokens = loadTokens()
  if (
    tokens &&
    tokens.accessToken !== staleToken &&
    isUsable(tokens, rejectedToken)
  ) {
    return tokens.accessToken
  }
  return null
}

function getLockManager(): LockManager | undefined {
  return typeof navigator !== 'undefined' && 'locks' in navigator
    ? navigator.locks
    : undefined
}

async function refreshExclusively(
  staleToken: string,
  rejectedToken?: string,
): Promise<string> {
  const locks = getLockManager()
  if (locks) {
    return locks.request(REFRESH_LOCK_NAME, async () => {
      const updated = findUpdatedToken(staleToken, rejectedToken)
      if (updated) {
        return updated
      }
      try {
        return await refresh()
      } catch (error) {
        throw handleRefreshFailure(error)
      }
    })
  }
  try {
    return await refresh()
  } catch (error) {
    if (error instanceof InvalidGrantError) {
      const updated = findUpdatedToken(staleToken, rejectedToken)
      if (updated) {
        return updated
      }
    }
    throw handleRefreshFailure(error)
  }
}

function handleRefreshFailure(error: unknown): unknown {
  if (error instanceof InvalidGrantError || error instanceof AuthError) {
    clearTokens()
    return error instanceof AuthError
      ? error
      : new AuthError('Refresh token is no longer valid', { cause: error })
  }
  return error
}

async function refresh(): Promise<string> {
  const tokens = loadTokens()
  if (!tokens?.refreshToken) {
    throw new AuthError('No refresh token')
  }

  let response: Response
  try {
    response = await postToken({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    })
  } catch (error) {
    throw new NetworkError('Token refresh failed', { cause: error })
  }

  if (!response.ok) {
    if (response.status === 400) {
      const errorBody = await readJson<SpotifyTokenErrorBody>(response)
      if (errorBody?.error === 'invalid_grant') {
        throw new InvalidGrantError(errorBody.error_description)
      }
    }
    throw new ApiError(response.status)
  }

  const body = await readTokenResponse(response)
  if (!body) {
    throw new ApiError(response.status, 'Invalid token response')
  }
  const next = toStoredTokens(body, tokens.refreshToken)
  saveTokens(next)
  return next.accessToken
}

function postToken(params: Record<string, string>): Promise<Response> {
  return fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

async function readTokenResponse(
  response: Response,
): Promise<SpotifyTokenResponse | null> {
  const body = await readJson<SpotifyTokenResponse>(response)
  if (
    !body ||
    typeof body.access_token !== 'string' ||
    typeof body.expires_in !== 'number'
  ) {
    return null
  }
  return body
}

function toStoredTokens(
  body: SpotifyTokenResponse,
  previousRefreshToken?: string,
): StoredTokens {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + body.expires_in * 1000,
  }
}

export function logout(): void {
  clearTokens()
  clearPkce()
  replaceLocation(import.meta.env.BASE_URL)
}

export function isLoggedIn(): boolean {
  const tokens = loadTokens()
  return Boolean(tokens && (tokens.refreshToken || tokens.accessToken))
}
