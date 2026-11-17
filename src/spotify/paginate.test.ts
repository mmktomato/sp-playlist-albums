import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessToken } from '../auth/auth'
import { NetworkError } from '../errors'
import { fetchAllCursorPages, fetchAllOffsetPages } from './paginate'
import type { SpotifyCursorPaging } from './types'

vi.mock('../auth/auth', () => ({ getAccessToken: vi.fn() }))

const fetchMock = vi.fn<typeof fetch>()
const BASE = 'https://api.spotify.com/v1'

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

function requestedUrl(call: number): URL {
  return new URL(String(fetchMock.mock.calls[call][0]))
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getAccessToken).mockResolvedValue('token')
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('fetchAllOffsetPages', () => {
  it('follows next and reports progress', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          items: [1, 2],
          next: `${BASE}/list?offset=2&limit=2`,
          total: 5,
        }),
      )
      .mockResolvedValueOnce(
        json({
          items: [3, 4],
          next: `${BASE}/list?offset=4&limit=2`,
          total: 5,
        }),
      )
      .mockResolvedValueOnce(json({ items: [5], next: null, total: 5 }))
    const onProgress = vi.fn()
    const items = await fetchAllOffsetPages<number>('/list', {
      query: { limit: 2, fields: 'items,next,total' },
      onProgress,
    })
    expect(items).toEqual([1, 2, 3, 4, 5])
    expect(onProgress.mock.calls).toEqual([
      [2, 5],
      [4, 5],
      [5, 5],
    ])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(requestedUrl(0).searchParams.get('limit')).toBe('2')
    expect(requestedUrl(2).searchParams.get('offset')).toBe('4')
    expect(requestedUrl(2).searchParams.get('fields')).toBe('items,next,total')
  })

  it('stops fetching further pages once aborted', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(
      json({ items: [1], next: `${BASE}/list?offset=1`, total: 3 }),
    )
    const error = await fetchAllOffsetPages<number>('/list', {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    }).catch((e: unknown) => e)
    expect((error as Error).name).toBe('AbortError')
    expect(error).not.toBeInstanceOf(NetworkError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not turn an abort during a request into NetworkError', async () => {
    const controller = new AbortController()
    fetchMock
      .mockResolvedValueOnce(
        json({ items: [1], next: `${BASE}/list?offset=1`, total: 3 }),
      )
      .mockImplementationOnce(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(init.signal?.reason),
            )
          }),
      )
    const promise = fetchAllOffsetPages<number>('/list', {
      signal: controller.signal,
    }).catch((e: unknown) => e)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    controller.abort()
    const error = await promise
    expect((error as Error).name).toBe('AbortError')
    expect(error).not.toBeInstanceOf(NetworkError)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('fetchAllCursorPages', () => {
  it('follows the cursor next URL', async () => {
    type Wrapped = { artists: SpotifyCursorPaging<string> }
    fetchMock
      .mockResolvedValueOnce(
        json({
          artists: {
            items: ['a', 'b'],
            next: `${BASE}/me/following?type=artist&after=b&limit=2`,
            cursors: { after: 'b' },
          },
        }),
      )
      .mockResolvedValueOnce(
        json({
          artists: { items: ['c'], next: null, cursors: { after: null } },
        }),
      )
    const items = await fetchAllCursorPages<Wrapped, string>('/me/following', {
      query: { type: 'artist', limit: 2 },
      select: (r) => r.artists,
    })
    expect(items).toEqual(['a', 'b', 'c'])
    expect(requestedUrl(0).searchParams.get('type')).toBe('artist')
    expect(requestedUrl(1).searchParams.get('after')).toBe('b')
  })
})
