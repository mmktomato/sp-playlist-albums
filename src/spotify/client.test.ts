import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessToken } from '../auth/auth'
import {
  ApiError,
  ForbiddenError,
  NetworkError,
  QuotaExceededError,
} from '../errors'
import { MAX_CONCURRENT_REQUESTS, spotifyFetch } from './client'

vi.mock('../auth/auth', () => ({ getAccessToken: vi.fn() }))

const fetchMock = vi.fn<typeof fetch>()
const getAccessTokenMock = vi.mocked(getAccessToken)

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

function errorBody(status: number, reason?: string) {
  return { error: { status, message: `error ${status}`, reason } }
}

function requestedUrl(call: number): URL {
  return new URL(String(fetchMock.mock.calls[call][0]))
}

function authHeader(call: number): string | undefined {
  const headers = fetchMock.mock.calls[call][1]?.headers as
    Record<string, string> | undefined
  return headers?.Authorization
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  getAccessTokenMock.mockResolvedValue('token-1')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  getAccessTokenMock.mockReset()
})

describe('spotifyFetch', () => {
  it('sends the bearer token to the API base URL with the query', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'me' }))
    const result = await spotifyFetch('/me/playlists', {
      query: { limit: 50, skip: undefined },
    })
    expect(result).toEqual({ id: 'me' })
    const url = requestedUrl(0)
    expect(url.origin + url.pathname).toBe(
      'https://api.spotify.com/v1/me/playlists',
    )
    expect(url.searchParams.get('limit')).toBe('50')
    expect(url.searchParams.has('skip')).toBe(false)
    expect(authHeader(0)).toBe('Bearer token-1')
  })

  it('accepts an absolute next URL and keeps its own params', async () => {
    fetchMock.mockResolvedValueOnce(json({}))
    await spotifyFetch(
      'https://api.spotify.com/v1/me/playlists?offset=50&limit=50',
      { query: { limit: 10, fields: 'next' } },
    )
    const url = requestedUrl(0)
    expect(url.searchParams.get('offset')).toBe('50')
    expect(url.searchParams.get('limit')).toBe('50')
    expect(url.searchParams.get('fields')).toBe('next')
  })

  it('sends GET without a body by default', async () => {
    fetchMock.mockResolvedValueOnce(json({}))
    await spotifyFetch('/me')
    const init = fetchMock.mock.calls[0][1]
    expect(init?.method).toBe('GET')
    expect(init?.body).toBeUndefined()
    expect(init?.headers).not.toHaveProperty('Content-Type')
  })

  it('sends DELETE with a JSON body', async () => {
    fetchMock.mockResolvedValueOnce(json({ snapshot_id: 's1' }))
    const body = { items: [{ uri: 'spotify:track:1' }] }
    await expect(
      spotifyFetch('/playlists/p/items', { method: 'DELETE', body }),
    ).resolves.toEqual({ snapshot_id: 's1' })
    const init = fetchMock.mock.calls[0][1]
    expect(init?.method).toBe('DELETE')
    expect(init?.body).toBe(JSON.stringify(body))
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'Content-Type': 'application/json',
    })
  })

  it('keeps the method and body when retrying a 401', async () => {
    getAccessTokenMock
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('new-token')
    fetchMock
      .mockResolvedValueOnce(json(errorBody(401), 401))
      .mockResolvedValueOnce(json({ snapshot_id: 's1' }))
    const body = { items: [{ uri: 'spotify:track:1' }] }
    await spotifyFetch('/playlists/p/items', { method: 'DELETE', body })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const call of [0, 1]) {
      const init = fetchMock.mock.calls[call][1]
      expect(init?.method).toBe('DELETE')
      expect(init?.body).toBe(JSON.stringify(body))
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
      })
    }
    expect(authHeader(1)).toBe('Bearer new-token')
  })

  it('keeps the method and body when retrying a 429', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(json(errorBody(429), 429, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(json({ snapshot_id: 's1' }))
    const body = { items: [{ uri: 'spotify:track:1' }] }
    const promise = spotifyFetch('/playlists/p/items', {
      method: 'DELETE',
      body,
    })
    await vi.advanceTimersByTimeAsync(1000)
    await promise
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const init = fetchMock.mock.calls[1][1]
    expect(init?.method).toBe('DELETE')
    expect(init?.body).toBe(JSON.stringify(body))
  })

  it('refuses absolute URLs outside the Spotify API', async () => {
    await expect(spotifyFetch('https://example.com/v1/me')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries once on 401 with the rejected token', async () => {
    getAccessTokenMock
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('new-token')
    fetchMock
      .mockResolvedValueOnce(json(errorBody(401), 401))
      .mockResolvedValueOnce(json({ ok: true }))
    await expect(spotifyFetch('/me')).resolves.toEqual({ ok: true })
    expect(getAccessTokenMock).toHaveBeenNthCalledWith(2, {
      rejectedToken: 'old-token',
    })
    expect(authHeader(1)).toBe('Bearer new-token')
  })

  it('does not retry a second 401', async () => {
    fetchMock.mockImplementation(async () => json(errorBody(401), 401))
    const error = await spotifyFetch('/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(getAccessTokenMock).toHaveBeenCalledTimes(2)
  })

  it('waits for Retry-After on 429 and retries', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(json(errorBody(429), 429, { 'Retry-After': '3' }))
      .mockResolvedValueOnce(json({ ok: true }))
    const promise = spotifyFetch('/me')
    await vi.advanceTimersByTimeAsync(2999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after two 429 retries', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () =>
      json(errorBody(429), 429, { 'Retry-After': '1' }),
    )
    const promise = spotifyFetch('/me').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(5000)
    expect(await promise).toBeInstanceOf(QuotaExceededError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('throws QuotaExceededError without retry when Retry-After is over the limit', async () => {
    fetchMock.mockResolvedValueOnce(
      json(errorBody(429), 429, { 'Retry-After': '11' }),
    )
    const error = await spotifyFetch('/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(QuotaExceededError)
    expect((error as QuotaExceededError).retryAfterSeconds).toBe(11)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws QuotaExceededError without retry on QUOTA_EXCEEDED', async () => {
    fetchMock.mockResolvedValueOnce(
      json(errorBody(429, 'QUOTA_EXCEEDED'), 429, { 'Retry-After': '1' }),
    )
    await expect(spotifyFetch('/me')).rejects.toBeInstanceOf(QuotaExceededError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts while waiting for Retry-After', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(
      json(errorBody(429), 429, { 'Retry-After': '5' }),
    )
    const controller = new AbortController()
    const promise = spotifyFetch('/me', { signal: controller.signal }).catch(
      (e: unknown) => e,
    )
    await vi.advanceTimersByTimeAsync(1000)
    controller.abort()
    const error = await promise
    expect((error as Error).name).toBe('AbortError')
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('distinguishes the 403 scope for GET /me', async () => {
    fetchMock
      .mockResolvedValueOnce(json(errorBody(403), 403))
      .mockResolvedValueOnce(json(errorBody(403), 403))
    const meError = await spotifyFetch('/me').catch((e: unknown) => e)
    const playlistError = await spotifyFetch('/playlists/x/items').catch(
      (e: unknown) => e,
    )
    expect(meError).toBeInstanceOf(ForbiddenError)
    expect((meError as ForbiddenError).scope).toBe('user')
    expect(playlistError).toBeInstanceOf(ForbiddenError)
    expect((playlistError as ForbiddenError).scope).toBe('resource')
  })

  it('treats /me sub-resources as resource scope', async () => {
    fetchMock.mockResolvedValueOnce(json(errorBody(403), 403))
    const error = await spotifyFetch('/me/playlists').catch((e: unknown) => e)
    expect((error as ForbiddenError).scope).toBe('resource')
  })

  it('wraps a fetch TypeError in NetworkError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(spotifyFetch('/me')).rejects.toBeInstanceOf(NetworkError)
  })

  it('rethrows AbortError as-is', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    fetchMock.mockRejectedValueOnce(abortError)
    const error = await spotifyFetch('/me').catch((e: unknown) => e)
    expect(error).toBe(abortError)
    expect(error).not.toBeInstanceOf(NetworkError)
  })

  it('throws ApiError with the status for other failures', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 502 }))
    const error = await spotifyFetch('/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(502)
  })

  it('never runs more than 4 requests at once', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const pending: Array<ReturnType<typeof deferred<Response>>> = []
    fetchMock.mockImplementation(() => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      const d = deferred<Response>()
      pending.push(d)
      return d.promise.finally(() => {
        inFlight--
      })
    })
    const requests = Array.from({ length: 10 }, (_, i) =>
      spotifyFetch(`/albums/${i}`),
    )
    let resolved = 0
    while (resolved < 10) {
      await vi.waitFor(() => expect(pending.length).toBeGreaterThan(resolved))
      pending[resolved].resolve(json({ n: resolved }))
      resolved++
    }
    await Promise.all(requests)
    expect(maxInFlight).toBe(MAX_CONCURRENT_REQUESTS)
    expect(fetchMock).toHaveBeenCalledTimes(10)
  })

  it('removes an aborted waiter from the queue', async () => {
    const pending: Array<ReturnType<typeof deferred<Response>>> = []
    fetchMock.mockImplementation(() => {
      const d = deferred<Response>()
      pending.push(d)
      return d.promise
    })
    const running = Array.from({ length: 4 }, (_, i) =>
      spotifyFetch(`/running/${i}`),
    )
    await vi.waitFor(() => expect(pending).toHaveLength(4))
    const controller = new AbortController()
    const aborted = spotifyFetch('/aborted', {
      signal: controller.signal,
    }).catch((e: unknown) => e)
    const queued = spotifyFetch('/queued')
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort()
    expect(((await aborted) as Error).name).toBe('AbortError')

    pending[0].resolve(json({}))
    await vi.waitFor(() => expect(pending).toHaveLength(5))
    expect(requestedUrl(4).pathname).toBe('/v1/queued')
    pending.slice(1).forEach((d) => d.resolve(json({})))
    await Promise.all([...running, queued])
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})
