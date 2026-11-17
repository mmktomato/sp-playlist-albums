import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react'
import { logout } from '../auth/auth'
import { aggregateAlbums } from '../domain/albums'
import { isAccessible, toPlaylistSummary } from '../domain/playlists'
import type { Album } from '../domain/types'
import { ApiError, ForbiddenError, QuotaExceededError } from '../errors'
import { isAbortError } from '../spotify/client'
import {
  checkLibraryContains,
  entryTrack,
  getFollowedArtistIds,
  getMe,
  getMyPlaylists,
  getPlaylistItems,
  getPlaylistItemsFirstPageRaw,
} from '../spotify/endpoints'
import type {
  SpotifyImage,
  SpotifyMe,
  SpotifySimplifiedPlaylist,
} from '../spotify/types'

type Result<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; value: T }
  | { status: 'error'; error: unknown }

const IDLE = { status: 'idle' } as const
const LOADING = { status: 'loading' } as const

const RAW_PREVIEW_ENTRIES = 3
const HEART_CHECK_LIMIT = 40
const FOLLOWED_PREVIEW_COUNT = 10

type Initial = { me: SpotifyMe; playlists: SpotifySimplifiedPlaylist[] }
type AlbumsResult = {
  entryCount: number
  albums: Album[]
  imageHosts: string[]
}
type Heart = { album: Album; saved: boolean }

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const details: string[] = []
  if (error instanceof ForbiddenError) details.push(`scope=${error.scope}`)
  if (error instanceof ApiError) details.push(`status=${error.status}`)
  if (error instanceof QuotaExceededError && error.retryAfterSeconds != null) {
    details.push(`retryAfter=${error.retryAfterSeconds}s`)
  }
  const suffix = details.length > 0 ? ` (${details.join(', ')})` : ''
  return `${error.name}${suffix}: ${error.message}`
}

function truncateRawPage(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || !('items' in raw)) return raw
  const { items } = raw as { items: unknown }
  if (!Array.isArray(items)) return raw
  return {
    ...raw,
    items: items.slice(0, RAW_PREVIEW_ENTRIES),
    _itemsShown: `${Math.min(items.length, RAW_PREVIEW_ENTRIES)} / ${items.length}`,
  }
}

function toJson(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value, null, 2)
}

function collectHosts(
  imageLists: readonly (readonly SpotifyImage[] | null | undefined)[],
): string[] {
  const hosts = new Set<string>()
  for (const images of imageLists) {
    for (const image of images ?? []) {
      try {
        hosts.add(new URL(image.url).hostname)
      } catch {
        hosts.add(`(invalid) ${image.url}`)
      }
    }
  }
  return [...hosts].sort()
}

function track<T>(
  promise: Promise<T>,
  set: (result: Result<T>) => void,
  signal: AbortSignal,
): Promise<T | undefined> {
  set(LOADING)
  return promise.then(
    (value) => {
      if (!signal.aborted) set({ status: 'ok', value })
      return value
    },
    (error: unknown) => {
      if (!signal.aborted && !isAbortError(error)) {
        set({ status: 'error', error })
      }
      return undefined
    },
  )
}

function ErrorText({ error }: { error: unknown }): JSX.Element {
  return (
    <p role="alert" className="font-mono text-sm break-all text-red-600">
      {describeError(error)}
    </p>
  )
}

function Pending<T>({
  result,
  children,
}: {
  result: Result<T>
  children: (value: T) => JSX.Element
}): JSX.Element | null {
  if (result.status === 'idle') return null
  if (result.status === 'loading') return <p className="text-sm">Loading…</p>
  if (result.status === 'error') return <ErrorText error={result.error} />
  return children(result.value)
}

function Json({ value }: { value: unknown }): JSX.Element {
  return (
    <pre className="max-h-96 overflow-auto rounded bg-gray-100 p-2 font-mono text-xs dark:bg-gray-800">
      {toJson(value)}
    </pre>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}): JSX.Element {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

function bool(value: boolean): string {
  return value ? 'true' : 'false'
}

export default function DebugPage(): JSX.Element {
  const [initial, setInitial] = useState<Result<Initial>>(LOADING)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rawWithFields, setRawWithFields] = useState<Result<unknown>>(IDLE)
  const [rawWithoutFields, setRawWithoutFields] =
    useState<Result<unknown>>(IDLE)
  const [albums, setAlbums] = useState<Result<AlbumsResult>>(IDLE)
  const [hearts, setHearts] = useState<Result<Heart[]>>(IDLE)
  const [followed, setFollowed] = useState<Result<Set<string>>>(IDLE)
  const selectionRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    Promise.all([getMe(signal), getMyPlaylists(signal)]).then(
      ([me, playlists]) =>
        setInitial({ status: 'ok', value: { me, playlists } }),
      (error: unknown) => {
        if (!signal.aborted && !isAbortError(error)) {
          setInitial({ status: 'error', error })
        }
      },
    )
    return () => {
      controller.abort()
      selectionRef.current?.abort()
    }
  }, [])

  const playlistHosts = useMemo(
    () =>
      initial.status === 'ok'
        ? collectHosts(initial.value.playlists.map((p) => p.images))
        : [],
    [initial],
  )

  async function selectPlaylist(id: string): Promise<void> {
    selectionRef.current?.abort()
    const controller = new AbortController()
    selectionRef.current = controller
    const { signal } = controller
    setSelectedId(id)
    setHearts(IDLE)

    void track(
      getPlaylistItemsFirstPageRaw(id, { signal, fields: true }),
      setRawWithFields,
      signal,
    )
    void track(
      getPlaylistItemsFirstPageRaw(id, { signal, fields: false }),
      setRawWithoutFields,
      signal,
    )
    const aggregated = await track(
      getPlaylistItems(id, { signal }).then((entries) => ({
        entryCount: entries.length,
        albums: aggregateAlbums(entries),
        imageHosts: collectHosts(
          entries.map((entry) => entryTrack(entry)?.album?.images),
        ),
      })),
      setAlbums,
      signal,
    )
    if (!aggregated || signal.aborted) return

    const targets = aggregated.albums.slice(0, HEART_CHECK_LIMIT)
    await track(
      checkLibraryContains(
        targets.map((album) => album.uri),
        signal,
      ).then((saved) =>
        targets.map((album, i) => ({ album, saved: saved[i] ?? false })),
      ),
      setHearts,
      signal,
    )
  }

  function fetchFollowed(): void {
    const controller = new AbortController()
    void track(
      getFollowedArtistIds(controller.signal),
      setFollowed,
      controller.signal,
    )
  }

  const imageHosts = [
    ...new Set([
      ...playlistHosts,
      ...(albums.status === 'ok' ? albums.value.imageHosts : []),
    ]),
  ].sort()

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 pb-16">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Debug</h1>
        <a className="text-blue-600 underline" href={import.meta.env.BASE_URL}>
          Back to app
        </a>
        <button
          type="button"
          className="ml-auto rounded border px-3 py-1"
          onClick={() => logout()}
        >
          Logout
        </button>
      </header>

      <Pending result={initial}>
        {({ me, playlists }) => (
          <>
            <Section title="Me">
              <p className="font-mono text-sm">
                id: <span data-testid="me-id">{me.id}</span>
              </p>
            </Section>

            <Section title={`Playlists (${playlists.length})`}>
              <p className="text-sm">
                Owner &quot;spotify&quot; rows are marked as Made for You
                candidates.
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="p-1">name</th>
                      <th className="p-1">section</th>
                      <th className="p-1">ownerId</th>
                      <th className="p-1">collaborative</th>
                      <th className="p-1">hasItemsField</th>
                      <th className="p-1">items (raw)</th>
                      <th className="p-1">total</th>
                      <th className="p-1">items-field</th>
                      <th className="p-1">owner-or-collaborative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playlists.map((playlist) => {
                      const summary = toPlaylistSummary(playlist)
                      const selected = playlist.id === selectedId
                      return (
                        <tr
                          key={playlist.id}
                          data-testid={`playlist-${playlist.id}`}
                          className={`border-b align-top ${selected ? 'bg-yellow-100 dark:bg-yellow-900' : ''}`}
                        >
                          <td className="p-1">
                            <button
                              type="button"
                              className="text-left text-blue-600 underline"
                              onClick={() => void selectPlaylist(playlist.id)}
                            >
                              {summary.name}
                            </button>
                          </td>
                          <td className="p-1">
                            {summary.ownerId === me.id ? 'owned' : 'saved'}
                          </td>
                          <td className="p-1 font-mono">
                            {summary.ownerId}
                            {summary.ownerId === 'spotify' && (
                              <strong className="ml-1 text-orange-600">
                                Made for You?
                              </strong>
                            )}
                          </td>
                          <td className="p-1 font-mono">
                            {bool(summary.collaborative)}
                          </td>
                          <td className="p-1 font-mono">
                            {bool(summary.hasItemsField)}
                          </td>
                          <td className="p-1 font-mono break-all">
                            {JSON.stringify(playlist.items) ?? 'undefined'}
                          </td>
                          <td className="p-1 font-mono">
                            {summary.total ?? '-'}
                          </td>
                          <td
                            className="p-1 font-mono"
                            data-testid="access-items-field"
                          >
                            {bool(isAccessible(summary, me.id, 'items-field'))}
                          </td>
                          <td
                            className="p-1 font-mono"
                            data-testid="access-owner-or-collaborative"
                          >
                            {bool(
                              isAccessible(
                                summary,
                                me.id,
                                'owner-or-collaborative',
                              ),
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        )}
      </Pending>

      {selectedId && (
        <Section title={`Selected playlist: ${selectedId}`}>
          <h3 className="font-bold">First page with fields</h3>
          <Pending result={rawWithFields}>
            {(raw) => <Json value={truncateRawPage(raw)} />}
          </Pending>

          <h3 className="font-bold">First page without fields</h3>
          <Pending result={rawWithoutFields}>
            {(raw) => <Json value={truncateRawPage(raw)} />}
          </Pending>

          <h3 className="font-bold">Aggregated albums (all pages)</h3>
          <Pending result={albums}>
            {({ entryCount, albums: list }) => (
              <div className="space-y-1 text-sm">
                <p>
                  entries: {entryCount}, albums:{' '}
                  <span data-testid="album-count">{list.length}</span>
                </p>
                {list[0] && (
                  <ul className="list-disc pl-5">
                    <li>
                      <a
                        className="text-blue-600 underline break-all"
                        href={`https://open.spotify.com/album/${list[0].id}`}
                      >
                        https://open.spotify.com/album/{list[0].id}
                      </a>
                    </li>
                    <li>
                      <a
                        className="text-blue-600 underline break-all"
                        href={`spotify:album:${list[0].id}`}
                      >
                        spotify:album:{list[0].id}
                      </a>
                    </li>
                  </ul>
                )}
              </div>
            )}
          </Pending>

          <h3 className="font-bold">
            Heart check (first {HEART_CHECK_LIMIT} albums)
          </h3>
          <Pending result={hearts}>
            {(list) => (
              <ul className="text-sm">
                {list.map(({ album, saved }) => (
                  <li key={album.id} className="font-mono">
                    {bool(saved)} — {album.name}
                  </li>
                ))}
              </ul>
            )}
          </Pending>
        </Section>
      )}

      <Section title="Followed artists">
        <button
          type="button"
          className="rounded border px-3 py-1"
          onClick={fetchFollowed}
        >
          Fetch followed artists
        </button>
        <Pending result={followed}>
          {(ids) => (
            <div className="space-y-1 text-sm">
              <p>
                count: <span data-testid="followed-count">{ids.size}</span>
              </p>
              <Json value={[...ids].slice(0, FOLLOWED_PREVIEW_COUNT)} />
            </div>
          )}
        </Pending>
      </Section>

      <Section title="Image hosts">
        <p className="text-sm">
          From playlist images and the selected playlist&apos;s album images.
        </p>
        <ul className="font-mono text-sm" data-testid="image-hosts">
          {imageHosts.map((host) => (
            <li key={host}>{host}</li>
          ))}
        </ul>
      </Section>
    </main>
  )
}
