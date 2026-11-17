import { getAccessToken } from '../auth/auth'
import { SPOTIFY_API_BASE_URL } from '../config'
import {
  ApiError,
  ForbiddenError,
  NetworkError,
  QuotaExceededError,
} from '../errors'
import type { SpotifyErrorBody } from './types'

export const MAX_CONCURRENT_REQUESTS = 4
export const MAX_RETRY_AFTER_SECONDS = 10
export const MAX_RATE_LIMIT_RETRIES = 2
export const DEFAULT_RETRY_AFTER_SECONDS = 1

export type QueryValue = string | number | boolean | null | undefined

export type SpotifyFetchOptions = {
  signal?: AbortSignal
  query?: Record<string, QueryValue>
}

type RawResponse = {
  status: number
  ok: boolean
  headers: Headers
  text: string
}

let activeRequests = 0
const waiters = new Set<() => void>()

function acquireSlot(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason)
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      waiters.delete(grant)
      reject(signal?.reason)
    }
    const grant = () => {
      signal?.removeEventListener('abort', onAbort)
      activeRequests++
      resolve()
    }
    waiters.add(grant)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function releaseSlot(): void {
  activeRequests--
  const next = waiters.values().next()
  if (!next.done) {
    waiters.delete(next.value)
    next.value()
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === 'AbortError'
  )
}

export function buildUrl(
  path: string,
  query?: Record<string, QueryValue>,
): URL {
  const isAbsolute = /^https?:\/\//.test(path)
  if (isAbsolute && !path.startsWith(`${SPOTIFY_API_BASE_URL}/`)) {
    throw new Error(`Refusing to send a request outside the Spotify API`)
  }
  const url = new URL(isAbsolute ? path : `${SPOTIFY_API_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue
    if (url.searchParams.has(key)) continue
    url.searchParams.set(key, String(value))
  }
  return url
}

function isMeEndpoint(url: URL): boolean {
  return url.pathname === `${new URL(SPOTIFY_API_BASE_URL).pathname}/me`
}

async function send(
  url: URL,
  token: string,
  signal?: AbortSignal,
): Promise<RawResponse> {
  await acquireSlot(signal)
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    const text = await res.text()
    return { status: res.status, ok: res.ok, headers: res.headers, text }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error
    if (error instanceof TypeError) {
      throw new NetworkError(undefined, { cause: error })
    }
    throw error
  } finally {
    releaseSlot()
  }
}

function parseJson(text: string): unknown {
  if (text === '') return undefined
  return JSON.parse(text)
}

function parseErrorBody(text: string): SpotifyErrorBody['error'] | undefined {
  try {
    const body = parseJson(text) as Partial<SpotifyErrorBody> | undefined
    return typeof body?.error === 'object' ? body.error : undefined
  } catch {
    return undefined
  }
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds)
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, Math.ceil((date - Date.now()) / 1000))
}

export async function spotifyFetch<T>(
  path: string,
  options: SpotifyFetchOptions = {},
): Promise<T> {
  const { signal, query } = options
  const url = buildUrl(path, query)
  let token = await getAccessToken()
  let tokenRetried = false
  let rateLimitRetries = 0

  for (;;) {
    signal?.throwIfAborted()
    const res = await send(url, token, signal)

    if (res.ok) {
      try {
        return parseJson(res.text) as T
      } catch (error) {
        throw new ApiError(res.status, 'Invalid JSON response', {
          cause: error,
        })
      }
    }

    if (res.status === 401 && !tokenRetried) {
      tokenRetried = true
      token = await getAccessToken({ rejectedToken: token })
      continue
    }

    const errorBody = parseErrorBody(res.text)

    if (res.status === 429) {
      const retryAfter = parseRetryAfter(res.headers.get('Retry-After'))
      if (
        errorBody?.reason === 'QUOTA_EXCEEDED' ||
        (retryAfter ?? 0) > MAX_RETRY_AFTER_SECONDS ||
        rateLimitRetries >= MAX_RATE_LIMIT_RETRIES
      ) {
        throw new QuotaExceededError(retryAfter, errorBody?.message)
      }
      rateLimitRetries++
      await sleep((retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS) * 1000, signal)
      continue
    }

    if (res.status === 403) {
      throw new ForbiddenError(
        isMeEndpoint(url) ? 'user' : 'resource',
        errorBody?.message,
      )
    }

    throw new ApiError(res.status, errorBody?.message)
  }
}
