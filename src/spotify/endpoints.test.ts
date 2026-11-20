import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessToken } from '../auth/auth'
import {
  ApiError,
  AuthError,
  ForbiddenError,
  PartialRemovalError,
} from '../errors'
import {
  PLAYLIST_ITEMS_FIELDS,
  REMOVE_ITEMS_CHUNK_SIZE,
  checkLibraryContains,
  entryTrack,
  getFollowedArtistIds,
  getMe,
  getMyPlaylists,
  getPlaylistItems,
  getPlaylistItemsFirstPageRaw,
  removePlaylistItems,
} from './endpoints'
import type { SpotifyPlaylistItem, SpotifyTrack } from './types'

vi.mock('../auth/auth', () => ({ getAccessToken: vi.fn() }))

const fetchMock = vi.fn<typeof fetch>()
const BASE = 'https://api.spotify.com/v1'

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

function requestedUrl(call: number): URL {
  return new URL(String(fetchMock.mock.calls[call][0]))
}

function playlist(id: string) {
  return { id, name: id, uri: `spotify:playlist:${id}`, collaborative: false }
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(getAccessToken).mockResolvedValue('token')
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('getMe', () => {
  it('fetches /me', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'me' }))
    await expect(getMe()).resolves.toEqual({ id: 'me' })
    expect(requestedUrl(0).pathname).toBe('/v1/me')
  })
})

describe('getMyPlaylists', () => {
  it('fetches all pages and drops null entries', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          items: [playlist('a'), null],
          next: `${BASE}/me/playlists?offset=50&limit=50`,
          total: 3,
        }),
      )
      .mockResolvedValueOnce(
        json({ items: [playlist('c')], next: null, total: 3 }),
      )
    const playlists = await getMyPlaylists()
    expect(playlists.map((p) => p.id)).toEqual(['a', 'c'])
    expect(requestedUrl(0).pathname).toBe('/v1/me/playlists')
    expect(requestedUrl(0).searchParams.get('limit')).toBe('50')
  })
})

describe('getPlaylistItems', () => {
  it('requests the fields filter without additional_types', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          items: [{ is_local: false, item: null }, null],
          next: `${BASE}/playlists/p%201/items?offset=50&limit=50`,
          total: 3,
        }),
      )
      .mockResolvedValueOnce(
        json({ items: [{ is_local: true, item: null }], next: null, total: 3 }),
      )
    const onProgress = vi.fn()
    const items = await getPlaylistItems('p 1', { onProgress })
    expect(items).toHaveLength(2)
    expect(onProgress.mock.calls).toEqual([
      [2, 3],
      [3, 3],
    ])
    for (const call of [0, 1]) {
      const url = requestedUrl(call)
      expect(url.pathname).toBe('/v1/playlists/p%201/items')
      expect(url.searchParams.get('fields')).toBe(PLAYLIST_ITEMS_FIELDS)
      expect(url.searchParams.has('additional_types')).toBe(false)
    }
    expect(requestedUrl(0).searchParams.get('limit')).toBe('50')
    expect(requestedUrl(1).searchParams.get('offset')).toBe('50')
  })

  it('uses the planned fields expression', () => {
    expect(PLAYLIST_ITEMS_FIELDS).toBe(
      'items(is_local,item(type,uri,album(id,name,uri,images,artists(id,name),total_tracks)),track(type,uri,album(id,name,uri,images,artists(id,name),total_tracks))),next,total',
    )
  })

  it('can disable the fields filter', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [], next: null, total: 0 }))
    await getPlaylistItems('p', { fields: false })
    expect(requestedUrl(0).searchParams.has('fields')).toBe(false)
  })
})

describe('getPlaylistItemsFirstPageRaw', () => {
  it('returns the raw first page with or without fields', async () => {
    const page = { items: [], next: `${BASE}/x`, total: 100, extra: 1 }
    fetchMock
      .mockResolvedValueOnce(json(page))
      .mockResolvedValueOnce(json(page))
    await expect(getPlaylistItemsFirstPageRaw('p')).resolves.toEqual(page)
    await getPlaylistItemsFirstPageRaw('p', { fields: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestedUrl(0).searchParams.get('fields')).toBe(
      PLAYLIST_ITEMS_FIELDS,
    )
    expect(requestedUrl(1).searchParams.has('fields')).toBe(false)
  })
})

describe('getFollowedArtistIds', () => {
  it('collects ids across cursor pages', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          artists: {
            items: [
              { id: 'a1', name: 'A1' },
              { id: 'a2', name: 'A2' },
            ],
            next: `${BASE}/me/following?type=artist&after=a2&limit=50`,
            cursors: { after: 'a2' },
          },
        }),
      )
      .mockResolvedValueOnce(
        json({
          artists: {
            items: [{ id: 'a3', name: 'A3' }],
            next: null,
            cursors: { after: null },
          },
        }),
      )
    const ids = await getFollowedArtistIds()
    expect([...ids]).toEqual(['a1', 'a2', 'a3'])
    const first = requestedUrl(0)
    expect(first.pathname).toBe('/v1/me/following')
    expect(first.searchParams.get('type')).toBe('artist')
    expect(first.searchParams.get('limit')).toBe('50')
    expect(requestedUrl(1).searchParams.get('after')).toBe('a2')
  })
})

describe('checkLibraryContains', () => {
  it('splits into chunks of 40 and keeps the input order', async () => {
    const uris = Array.from({ length: 95 }, (_, i) => `spotify:album:${i}`)
    fetchMock.mockImplementation(async (input) => {
      const requested = new URL(String(input)).searchParams
        .get('uris')!
        .split(',')
      return json(requested.map((uri) => Number(uri.split(':')[2]) % 3 === 0))
    })
    const result = await checkLibraryContains(uris)
    expect(result).toEqual(uris.map((_, i) => i % 3 === 0))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const chunkSizes = fetchMock.mock.calls.map(
      ([input]) =>
        new URL(String(input)).searchParams.get('uris')!.split(',').length,
    )
    expect(chunkSizes.sort((a, b) => a - b)).toEqual([15, 40, 40])
    expect(requestedUrl(0).pathname).toBe('/v1/me/library/contains')
  })

  it('restores the order even when chunks resolve out of order', async () => {
    const uris = Array.from({ length: 41 }, (_, i) => `spotify:album:${i}`)
    let calls = 0
    fetchMock.mockImplementation(async (input) => {
      const requested = new URL(String(input)).searchParams
        .get('uris')!
        .split(',')
      const delay = calls++ === 0 ? 20 : 0
      await new Promise((resolve) => setTimeout(resolve, delay))
      return json(requested.map((uri) => uri.endsWith(':40')))
    })
    const result = await checkLibraryContains(uris)
    expect(result).toHaveLength(41)
    expect(result.indexOf(true)).toBe(40)
    expect(result.filter(Boolean)).toHaveLength(1)
  })

  it('skips the request for an empty list', async () => {
    await expect(checkLibraryContains([])).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('removePlaylistItems', () => {
  function trackUris(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `spotify:track:t${i}`)
  }

  function sentUris(call: number): string[] {
    const body = JSON.parse(String(fetchMock.mock.calls[call][1]?.body)) as {
      items: { uri: string }[]
    }
    return body.items.map((item) => item.uri)
  }

  it('sends one DELETE with the items body to the encoded playlist path', async () => {
    fetchMock.mockResolvedValueOnce(json({ snapshot_id: 's1' }))
    const uris = ['spotify:track:a', 'spotify:track:b']

    await expect(removePlaylistItems('p 1', uris)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = requestedUrl(0)
    expect(url.pathname).toBe('/v1/playlists/p%201/items')
    expect(url.search).toBe('')
    const init = fetchMock.mock.calls[0][1]
    expect(init?.method).toBe('DELETE')
    expect(init?.signal).toBeUndefined()
    expect(JSON.parse(String(init?.body))).toEqual({
      items: [{ uri: 'spotify:track:a' }, { uri: 'spotify:track:b' }],
    })
  })

  it('splits into chunks of 100 and sends them one at a time', async () => {
    let inFlight = 0
    let maxInFlight = 0
    fetchMock.mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 0))
      inFlight--
      return json({ snapshot_id: 's' })
    })
    const uris = trackUris(250)

    await removePlaylistItems('p', uris)

    expect(REMOVE_ITEMS_CHUNK_SIZE).toBe(100)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(maxInFlight).toBe(1)
    expect(sentUris(0)).toEqual(uris.slice(0, 100))
    expect(sentUris(1)).toEqual(uris.slice(100, 200))
    expect(sentUris(2)).toEqual(uris.slice(200))
    for (const call of [0, 1, 2]) {
      expect(requestedUrl(call).pathname).toBe('/v1/playlists/p/items')
    }
  })

  it('throws without a request for empty input', async () => {
    await expect(removePlaylistItems('p', [])).rejects.toThrow()
    await expect(removePlaylistItems('', ['spotify:track:a'])).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rethrows a failure of the first chunk as-is', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { status: 403, message: 'no' } }), {
        status: 403,
      }),
    )

    const error = await removePlaylistItems('p', trackUris(150)).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(ForbiddenError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws PartialRemovalError when a later chunk fails', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ snapshot_id: 's1' }))
      .mockResolvedValueOnce(json({ snapshot_id: 's2' }))
      .mockResolvedValueOnce(new Response('oops', { status: 502 }))

    const error = await removePlaylistItems('p', trackUris(350)).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(PartialRemovalError)
    expect((error as PartialRemovalError).succeededChunks).toBe(2)
    const cause = (error as PartialRemovalError).cause
    expect(cause).toBeInstanceOf(ApiError)
    expect((cause as ApiError).status).toBe(502)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not wrap an AuthError from a later chunk', async () => {
    const authError = new AuthError('Refresh token is no longer valid')
    vi.mocked(getAccessToken)
      .mockResolvedValueOnce('token')
      .mockRejectedValueOnce(authError)
    fetchMock.mockResolvedValueOnce(json({ snapshot_id: 's1' }))

    const error = await removePlaylistItems('p', trackUris(150)).catch(
      (e: unknown) => e,
    )

    expect(error).toBe(authError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('entryTrack', () => {
  const track: SpotifyTrack = { type: 'track', album: null }

  it('prefers item and falls back to the deprecated track key', () => {
    const both: SpotifyPlaylistItem = {
      is_local: false,
      item: track,
      track: { type: 'episode' },
    }
    expect(entryTrack(both)).toBe(track)
    expect(entryTrack({ is_local: false, track })).toBe(track)
    expect(entryTrack({ is_local: false, item: null, track })).toBe(track)
  })

  it('returns null when neither key is set', () => {
    expect(entryTrack({ is_local: false, item: null })).toBeNull()
    expect(entryTrack(null)).toBeNull()
  })
})
