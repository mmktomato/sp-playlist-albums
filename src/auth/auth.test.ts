import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SPOTIFY_SCOPES } from '../config'
import { ApiError, AuthError, NetworkError } from '../errors'
import {
  getAccessToken,
  getGrantedScopes,
  handleCallback,
  hasGrantedScopes,
  isLoggedIn,
  login,
  logout,
} from './auth'
import { assignLocation, replaceLocation } from './navigation'
import { createCodeChallenge } from './pkce'
import {
  type StoredTokens,
  TOKENS_KEY,
  loadPkce,
  loadTokens,
  savePkce,
  saveTokens,
} from './tokenStore'

vi.mock('./navigation', () => ({
  assignLocation: vi.fn(),
  replaceLocation: vi.fn(),
}))

vi.mock('../config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config')>()),
  SPOTIFY_CLIENT_ID: 'test-client',
}))

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const HOUR_MS = 3_600_000

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function tokenResponse(
  accessToken: string,
  refreshToken?: string,
  scope: string | null = 'playlist-read-private',
): Response {
  return jsonResponse({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    ...(scope !== null ? { scope } : {}),
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  })
}

function storeTokens(overrides: Partial<StoredTokens> = {}): void {
  saveTokens({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + HOUR_MS,
    ...overrides,
  })
}

function storeExpiredTokens(): void {
  storeTokens({ expiresAt: Date.now() - 1000 })
}

function requestBody(callIndex = 0): URLSearchParams {
  const init = fetchMock.mock.calls[callIndex]?.[1]
  return new URLSearchParams(init?.body as URLSearchParams)
}

function installLocks(beforeCallback?: () => void) {
  let tail: Promise<unknown> = Promise.resolve()
  const request = vi.fn(
    (name: string, callback: (lock: Lock | null) => Promise<unknown>) => {
      const run = tail.then(() => {
        beforeCallback?.()
        return callback({ name, mode: 'exclusive' } as Lock)
      })
      tail = run.catch(() => undefined)
      return run
    },
  )
  Object.defineProperty(navigator, 'locks', {
    value: { request },
    configurable: true,
  })
  return request
}

function setUrl(path: string): URL {
  history.replaceState(null, '', path)
  return new URL(location.href)
}

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(assignLocation).mockReset()
  vi.mocked(replaceLocation).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'locks')
  history.replaceState(null, '', '/')
})

describe('login', () => {
  it('stores the verifier and state and navigates to the authorize URL', async () => {
    await login()

    const pkce = loadPkce()
    expect(pkce).not.toBeNull()
    expect(assignLocation).toHaveBeenCalledTimes(1)
    const url = new URL(vi.mocked(assignLocation).mock.calls[0]![0])
    expect(url.origin + url.pathname).toBe(
      'https://accounts.spotify.com/authorize',
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('test-client')
    expect(url.searchParams.get('scope')).toBe(
      'playlist-read-private playlist-read-collaborative user-follow-read user-library-read playlist-modify-public playlist-modify-private',
    )
    expect(url.searchParams.get('redirect_uri')).toBe(
      location.origin + import.meta.env.BASE_URL,
    )
    expect(url.searchParams.get('state')).toBe(pkce!.state)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(
      await createCodeChallenge(pkce!.verifier),
    )
  })
})

describe('handleCallback', () => {
  it('returns none without callback parameters', async () => {
    const url = setUrl('/?playlist=abc')
    await expect(handleCallback(url)).resolves.toBe('none')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(location.search).toBe('?playlist=abc')
  })

  it('exchanges the code for tokens and cleans the URL', async () => {
    savePkce({ verifier: 'verifier-1', state: 'state-1' })
    fetchMock.mockResolvedValueOnce(tokenResponse('access-new', 'refresh-new'))
    const url = setUrl('/?code=code-1&state=state-1&playlist=abc#x')

    await expect(handleCallback(url)).resolves.toBe('ok')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(TOKEN_URL)
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('POST')
    const body = requestBody()
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('code-1')
    expect(body.get('redirect_uri')).toBe(
      location.origin + import.meta.env.BASE_URL,
    )
    expect(body.get('client_id')).toBe('test-client')
    expect(body.get('code_verifier')).toBe('verifier-1')

    const tokens = loadTokens()
    expect(tokens?.accessToken).toBe('access-new')
    expect(tokens?.refreshToken).toBe('refresh-new')
    expect(tokens?.scope).toBe('playlist-read-private')
    expect(tokens!.expiresAt).toBeGreaterThan(Date.now() + HOUR_MS - 5000)
    expect(loadPkce()).toBeNull()
    expect(location.search).toBe('?playlist=abc')
    expect(location.hash).toBe('#x')
    expect(isLoggedIn()).toBe(true)
  })

  it('stores the requested scopes when the exchange omits the scope', async () => {
    savePkce({ verifier: 'verifier-1', state: 'state-1' })
    fetchMock.mockResolvedValueOnce(
      tokenResponse('access-new', 'refresh-new', null),
    )
    const url = setUrl('/?code=code-1&state=state-1')

    await expect(handleCallback(url)).resolves.toBe('ok')

    expect(loadTokens()?.scope).toBe(SPOTIFY_SCOPES.join(' '))
    expect(hasGrantedScopes(SPOTIFY_SCOPES)).toBe(true)
  })

  it('rejects a state mismatch without exchanging the code', async () => {
    savePkce({ verifier: 'verifier-1', state: 'state-1' })
    const url = setUrl('/?code=code-1&state=forged')

    await expect(handleCallback(url)).resolves.toBe('error')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(loadTokens()).toBeNull()
    expect(location.search).toBe('')
  })

  it('reports a missing verifier', async () => {
    const url = setUrl('/?code=code-1&state=state-1')

    await expect(handleCallback(url)).resolves.toBe('missing-verifier')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(location.search).toBe('')
  })

  it('reports access_denied as denied', async () => {
    savePkce({ verifier: 'verifier-1', state: 'state-1' })
    const url = setUrl('/?error=access_denied&state=state-1')

    await expect(handleCallback(url)).resolves.toBe('denied')

    expect(loadPkce()).toBeNull()
    expect(location.search).toBe('')
  })

  it('reports other authorization errors as error', async () => {
    const url = setUrl('/?error=server_error')
    await expect(handleCallback(url)).resolves.toBe('error')
    expect(location.search).toBe('')
  })

  it('reports a failed exchange as error', async () => {
    savePkce({ verifier: 'verifier-1', state: 'state-1' })
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'invalid_grant' }, 400),
    )
    const url = setUrl('/?code=code-1&state=state-1')

    await expect(handleCallback(url)).resolves.toBe('error')
    expect(loadTokens()).toBeNull()
  })

  it('reports a network failure during the exchange as error', async () => {
    savePkce({ verifier: 'verifier-1', state: 'state-1' })
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const url = setUrl('/?code=code-1&state=state-1')

    await expect(handleCallback(url)).resolves.toBe('error')
    expect(location.search).toBe('')
  })
})

describe('getAccessToken', () => {
  it('throws AuthError when not logged in', async () => {
    await expect(getAccessToken()).rejects.toBeInstanceOf(AuthError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns the stored token while it is valid', async () => {
    storeTokens()
    await expect(getAccessToken()).resolves.toBe('access-1')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes within 60 seconds of expiry', async () => {
    storeTokens({ expiresAt: Date.now() + 59_000 })
    fetchMock.mockResolvedValueOnce(tokenResponse('access-2'))

    await expect(getAccessToken()).resolves.toBe('access-2')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(TOKEN_URL)
    const body = requestBody()
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('refresh-1')
    expect(body.get('client_id')).toBe('test-client')
  })

  it('saves a new refresh token when returned', async () => {
    storeExpiredTokens()
    fetchMock.mockResolvedValueOnce(tokenResponse('access-2', 'refresh-2'))

    await getAccessToken()

    expect(loadTokens()).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    })
  })

  it('keeps the existing refresh token when none is returned', async () => {
    storeExpiredTokens()
    fetchMock.mockResolvedValueOnce(tokenResponse('access-2'))

    await getAccessToken()

    expect(loadTokens()).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-1',
    })
  })

  it('saves the scope returned by a refresh', async () => {
    storeTokens({ expiresAt: Date.now() - 1000, scope: 'old-scope' })
    fetchMock.mockResolvedValueOnce(
      tokenResponse('access-2', undefined, 'scope-a scope-b'),
    )

    await getAccessToken()

    expect(loadTokens()?.scope).toBe('scope-a scope-b')
  })

  it('keeps the previous scope when a refresh omits it', async () => {
    storeTokens({ expiresAt: Date.now() - 1000, scope: 'scope-a scope-b' })
    fetchMock.mockResolvedValueOnce(tokenResponse('access-2', undefined, null))

    await getAccessToken()

    expect(loadTokens()).toMatchObject({
      accessToken: 'access-2',
      scope: 'scope-a scope-b',
    })
  })

  it('refreshes the rejected token even if it has not expired', async () => {
    storeTokens()
    fetchMock.mockResolvedValueOnce(tokenResponse('access-2'))

    await expect(getAccessToken({ rejectedToken: 'access-1' })).resolves.toBe(
      'access-2',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns the stored token without refreshing when it differs from the rejected one', async () => {
    storeTokens({ accessToken: 'access-2' })

    await expect(getAccessToken({ rejectedToken: 'access-1' })).resolves.toBe(
      'access-2',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shares a single refresh between concurrent calls', async () => {
    storeExpiredTokens()
    let resolveFetch: (response: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )

    const results = Promise.all([
      getAccessToken(),
      getAccessToken(),
      getAccessToken({ rejectedToken: 'access-1' }),
    ])
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    resolveFetch(tokenResponse('access-2'))

    await expect(results).resolves.toEqual(['access-2', 'access-2', 'access-2'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes under the cross-tab lock', async () => {
    const request = installLocks()
    storeExpiredTokens()
    fetchMock.mockResolvedValueOnce(tokenResponse('access-2'))

    await expect(getAccessToken()).resolves.toBe('access-2')

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]![0]).toBe('sp-token-refresh')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when another tab refreshed while waiting for the lock', async () => {
    installLocks(() => {
      storeTokens({ accessToken: 'access-other-tab', refreshToken: 'r-2' })
    })
    storeExpiredTokens()

    await expect(getAccessToken()).resolves.toBe('access-other-tab')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes after the lock when the stored token is still the rejected one', async () => {
    installLocks()
    storeTokens()
    fetchMock.mockResolvedValueOnce(tokenResponse('access-2'))

    await expect(getAccessToken({ rejectedToken: 'access-1' })).resolves.toBe(
      'access-2',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses the token of another tab after invalid_grant without navigator.locks', async () => {
    storeExpiredTokens()
    fetchMock.mockImplementationOnce(async () => {
      storeTokens({ accessToken: 'access-other-tab', refreshToken: 'r-2' })
      return jsonResponse({ error: 'invalid_grant' }, 400)
    })

    await expect(getAccessToken()).resolves.toBe('access-other-tab')
    expect(loadTokens()?.refreshToken).toBe('r-2')
  })

  it('clears tokens and throws AuthError on invalid_grant', async () => {
    storeExpiredTokens()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: 'invalid_grant', error_description: 'Refresh token revoked' },
        400,
      ),
    )

    await expect(getAccessToken()).rejects.toBeInstanceOf(AuthError)
    expect(loadTokens()).toBeNull()
    expect(isLoggedIn()).toBe(false)
  })

  it('clears tokens and throws AuthError on invalid_grant under the lock', async () => {
    installLocks()
    storeExpiredTokens()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'invalid_grant' }, 400),
    )

    await expect(getAccessToken()).rejects.toBeInstanceOf(AuthError)
    expect(loadTokens()).toBeNull()
  })

  it('throws NetworkError and keeps tokens on a network failure', async () => {
    storeExpiredTokens()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(getAccessToken()).rejects.toBeInstanceOf(NetworkError)
    expect(loadTokens()?.refreshToken).toBe('refresh-1')
    expect(isLoggedIn()).toBe(true)
  })

  it('throws ApiError and keeps tokens on a 5xx response', async () => {
    storeExpiredTokens()
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 503 }))

    const error = await getAccessToken().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(503)
    expect(loadTokens()?.refreshToken).toBe('refresh-1')
  })

  it('throws ApiError and keeps tokens on a 400 other than invalid_grant', async () => {
    storeExpiredTokens()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'invalid_client' }, 400),
    )

    await expect(getAccessToken()).rejects.toBeInstanceOf(ApiError)
    expect(loadTokens()).not.toBeNull()
  })

  it('allows a new refresh after a failed one', async () => {
    storeExpiredTokens()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce(tokenResponse('access-2'))

    await expect(getAccessToken()).rejects.toBeInstanceOf(NetworkError)
    await expect(getAccessToken()).resolves.toBe('access-2')
  })
})

describe('getGrantedScopes and hasGrantedScopes', () => {
  it('returns no scopes when logged out', () => {
    expect(getGrantedScopes()).toEqual([])
    expect(hasGrantedScopes(['playlist-modify-public'])).toBe(false)
  })

  it('returns no scopes for tokens saved without a scope', () => {
    storeTokens()
    expect(getGrantedScopes()).toEqual([])
    expect(hasGrantedScopes(['playlist-modify-public'])).toBe(false)
    expect(hasGrantedScopes([])).toBe(true)
  })

  it('ignores a stored scope that is not a string', () => {
    localStorage.setItem(
      TOKENS_KEY,
      JSON.stringify({ accessToken: 'a', expiresAt: Date.now(), scope: 1 }),
    )
    expect(loadTokens()?.scope).toBeUndefined()
    expect(getGrantedScopes()).toEqual([])
  })

  it('splits the stored scope and checks that all requested scopes are granted', () => {
    storeTokens({
      scope:
        'playlist-read-private  playlist-modify-public playlist-modify-private',
    })
    expect(getGrantedScopes()).toEqual([
      'playlist-read-private',
      'playlist-modify-public',
      'playlist-modify-private',
    ])
    expect(
      hasGrantedScopes(['playlist-modify-public', 'playlist-modify-private']),
    ).toBe(true)
  })

  it('reports missing scopes', () => {
    storeTokens({ scope: 'playlist-read-private playlist-modify-public' })
    expect(
      hasGrantedScopes(['playlist-modify-public', 'playlist-modify-private']),
    ).toBe(false)
  })
})

describe('logout and isLoggedIn', () => {
  it('reports logged out without tokens', () => {
    expect(isLoggedIn()).toBe(false)
  })

  it('clears tokens and reloads at the base URL', () => {
    storeTokens()
    expect(isLoggedIn()).toBe(true)

    logout()

    expect(loadTokens()).toBeNull()
    expect(isLoggedIn()).toBe(false)
    expect(replaceLocation).toHaveBeenCalledWith(import.meta.env.BASE_URL)
  })
})
