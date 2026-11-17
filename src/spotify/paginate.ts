import { spotifyFetch, type QueryValue } from './client'
import type { SpotifyCursorPaging, SpotifyPaging } from './types'

export type ProgressCallback = (loaded: number, total: number) => void

export type OffsetPagingOptions = {
  signal?: AbortSignal
  query?: Record<string, QueryValue>
  onProgress?: ProgressCallback
}

export async function fetchAllOffsetPages<T>(
  path: string,
  options: OffsetPagingOptions = {},
): Promise<T[]> {
  const { signal, query, onProgress } = options
  const items: T[] = []
  let next: string | null = path
  while (next !== null) {
    signal?.throwIfAborted()
    const page: SpotifyPaging<T> = await spotifyFetch<SpotifyPaging<T>>(next, {
      signal,
      query,
    })
    items.push(...page.items)
    onProgress?.(items.length, page.total)
    next = page.next
  }
  return items
}

export type CursorPagingOptions<R, T> = {
  signal?: AbortSignal
  query?: Record<string, QueryValue>
  select: (response: R) => SpotifyCursorPaging<T>
}

export async function fetchAllCursorPages<R, T>(
  path: string,
  options: CursorPagingOptions<R, T>,
): Promise<T[]> {
  const { signal, query, select } = options
  const items: T[] = []
  let next: string | null = path
  while (next !== null) {
    signal?.throwIfAborted()
    const page: SpotifyCursorPaging<T> = select(
      await spotifyFetch<R>(next, { signal, query }),
    )
    items.push(...page.items)
    next = page.next
  }
  return items
}
