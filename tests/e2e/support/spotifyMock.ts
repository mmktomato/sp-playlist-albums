import type { Page, Request, Route } from '@playwright/test'
import type {
  SpotifyArtist,
  SpotifyFollowedArtistsResponse,
  SpotifyPaging,
} from '../../../src/spotify/types.ts'
import { REQUIRED_SCOPES } from './constants.ts'
import { createDataset, type Dataset } from './data.ts'

export const API_ORIGIN = 'https://api.spotify.com'
export const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'

export type MockResponse = {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

export type MockResult = MockResponse | 'abort'

export type ApiRequestRecord = {
  method: string
  url: URL
  authorization: string | null
}

export type InterceptHandler = (
  url: URL,
  record: ApiRequestRecord,
) => MockResult | Promise<MockResult>

type Interceptor = {
  match: (url: URL) => boolean
  handle: InterceptHandler
}

export type TokenResponder = (params: URLSearchParams) => MockResponse

export const CODE_ACCESS_TOKEN = 'access-from-code'
export const CODE_REFRESH_TOKEN = 'refresh-from-code'
export const REFRESHED_ACCESS_TOKEN = 'access-from-refresh'

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

const AUTHORIZE_STUB_HTML =
  '<!doctype html><html><head><title>Authorize stub</title></head><body><h1>Authorize stub</h1></body></html>'

export const defaultTokenResponder: TokenResponder = (params) => {
  const common = {
    token_type: 'Bearer',
    scope: REQUIRED_SCOPES.join(' '),
    expires_in: 3600,
  }
  switch (params.get('grant_type')) {
    case 'authorization_code':
      return {
        body: {
          ...common,
          access_token: CODE_ACCESS_TOKEN,
          refresh_token: CODE_REFRESH_TOKEN,
        },
      }
    case 'refresh_token':
      return { body: { ...common, access_token: REFRESHED_ACCESS_TOKEN } }
    default:
      return { status: 400, body: { error: 'unsupported_grant_type' } }
  }
}

export function spotifyError(
  status: number,
  message: string,
  reason?: string,
): MockResponse {
  return { status, body: { error: { status, message, reason } } }
}

function offsetPage<T>(items: readonly T[], url: URL): SpotifyPaging<T> {
  const offset = Number(url.searchParams.get('offset') ?? '0')
  const limit = Number(url.searchParams.get('limit') ?? '20')
  const end = offset + limit
  let next: string | null = null
  if (end < items.length) {
    const nextUrl = new URL(url.origin + url.pathname)
    nextUrl.searchParams.set('offset', String(end))
    nextUrl.searchParams.set('limit', String(limit))
    next = nextUrl.href
  }
  return {
    href: url.href,
    items: items.slice(offset, end),
    limit,
    offset,
    next,
    previous: null,
    total: items.length,
  }
}

function cursorPage(
  artists: readonly SpotifyArtist[],
  url: URL,
): SpotifyFollowedArtistsResponse {
  const limit = Number(url.searchParams.get('limit') ?? '20')
  const after = url.searchParams.get('after')
  const start = after ? artists.findIndex((a) => a.id === after) + 1 : 0
  const items = artists.slice(start, start + limit)
  const hasMore = start + limit < artists.length
  const last = items.at(-1)
  let next: string | null = null
  if (hasMore && last) {
    const nextUrl = new URL(url.origin + url.pathname)
    nextUrl.searchParams.set('type', 'artist')
    nextUrl.searchParams.set('after', last.id)
    nextUrl.searchParams.set('limit', String(limit))
    next = nextUrl.href
  }
  return {
    artists: {
      href: url.href,
      items,
      limit,
      next,
      cursors: { after: hasMore && last ? last.id : null },
      total: artists.length,
    },
  }
}

const PLAYLIST_ITEMS_PATH = /^\/v1\/playlists\/([^/]+)\/items$/

export class SpotifyMock {
  readonly data: Dataset
  readonly apiRequests: ApiRequestRecord[] = []
  readonly tokenRequests: URLSearchParams[] = []
  readonly authorizeRequests: URL[] = []
  readonly unhandled: string[] = []
  offline = false
  tokenResponder: TokenResponder = defaultTokenResponder
  private readonly interceptors: Interceptor[] = []

  constructor(data: Dataset = createDataset()) {
    this.data = data
  }

  async install(page: Page): Promise<void> {
    await page.route(`${API_ORIGIN}/**`, (route) => this.handleApi(route))
    await page.route('https://accounts.spotify.com/**', (route) =>
      this.handleAccounts(route),
    )
    await page.route('https://i.scdn.co/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: TRANSPARENT_PNG,
      }),
    )
  }

  intercept(match: (url: URL) => boolean, handle: InterceptHandler): void {
    this.interceptors.unshift({ match, handle })
  }

  respond(pathname: string, response: MockResponse): void {
    this.intercept(
      (url) => url.pathname === pathname,
      () => response,
    )
  }

  requestsTo(pathname: string): URL[] {
    return this.apiRequests
      .filter((record) => record.url.pathname === pathname)
      .map((record) => record.url)
  }

  playlistItemsRequests(playlistId: string): URL[] {
    return this.requestsTo(`/v1/playlists/${playlistId}/items`)
  }

  defaultResponse(url: URL): MockResponse {
    const { data } = this
    switch (url.pathname) {
      case '/v1/me':
        return { body: data.me }
      case '/v1/me/playlists':
        return { body: offsetPage(data.playlists, url) }
      case '/v1/me/following':
        if (url.searchParams.get('type') !== 'artist') break
        return { body: cursorPage(data.followedArtists, url) }
      case '/v1/me/library/contains': {
        const uris = (url.searchParams.get('uris') ?? '').split(',')
        return {
          body: uris.map((uri) =>
            data.savedAlbumIds.has(uri.replace(/^spotify:album:/, '')),
          ),
        }
      }
    }
    const itemsMatch = PLAYLIST_ITEMS_PATH.exec(url.pathname)
    if (itemsMatch) {
      const entries = data.playlistItems.get(decodeURIComponent(itemsMatch[1]))
      return entries
        ? { body: offsetPage(entries, url) }
        : spotifyError(403, 'Forbidden')
    }
    this.unhandled.push(`GET ${url.href}`)
    return spotifyError(500, 'Unhandled request in e2e mock')
  }

  private async handleApi(route: Route): Promise<void> {
    const request = route.request()
    const origin = await request.headerValue('origin')
    if (request.method() === 'OPTIONS') {
      await fulfillPreflight(route, origin)
      return
    }
    const url = new URL(request.url())
    const record: ApiRequestRecord = {
      method: request.method(),
      url,
      authorization: await request.headerValue('authorization'),
    }
    this.apiRequests.push(record)
    if (this.offline) {
      await abort(route)
      return
    }
    if (request.method() !== 'GET') {
      this.unhandled.push(`${request.method()} ${url.href}`)
      await fulfill(route, origin, spotifyError(405, 'Method not allowed'))
      return
    }
    const interceptor = this.interceptors.find((i) => i.match(url))
    const result = interceptor
      ? await interceptor.handle(url, record)
      : this.defaultResponse(url)
    if (result === 'abort') {
      await abort(route)
      return
    }
    await fulfill(route, origin, result)
  }

  private async handleAccounts(route: Route): Promise<void> {
    const request = route.request()
    const origin = await request.headerValue('origin')
    const url = new URL(request.url())
    if (request.method() === 'OPTIONS') {
      await fulfillPreflight(route, origin)
      return
    }
    if (url.pathname === '/authorize' && request.method() === 'GET') {
      this.authorizeRequests.push(url)
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: AUTHORIZE_STUB_HTML,
      })
      return
    }
    if (url.pathname === '/api/token' && request.method() === 'POST') {
      const params = readForm(request)
      this.tokenRequests.push(params)
      await fulfill(route, origin, this.tokenResponder(params))
      return
    }
    this.unhandled.push(`${request.method()} ${url.href}`)
    await fulfill(route, origin, { status: 500, body: { error: 'unhandled' } })
  }
}

function readForm(request: Request): URLSearchParams {
  return new URLSearchParams(request.postData() ?? '')
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'access-control-allow-origin': origin ?? '*',
    'access-control-expose-headers': 'Retry-After',
    vary: 'Origin',
  }
}

async function fulfill(
  route: Route,
  origin: string | null,
  response: MockResponse,
): Promise<void> {
  await route
    .fulfill({
      status: response.status ?? 200,
      headers: { ...corsHeaders(origin), ...response.headers },
      contentType: 'application/json',
      body: response.body === undefined ? '' : JSON.stringify(response.body),
    })
    .catch(() => undefined)
}

async function fulfillPreflight(
  route: Route,
  origin: string | null,
): Promise<void> {
  await route.fulfill({
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '600',
    },
  })
}

async function abort(route: Route): Promise<void> {
  await route.abort('internetdisconnected').catch(() => undefined)
}
