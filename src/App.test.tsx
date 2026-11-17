import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { isLoggedIn, logout } from './auth/auth'
import {
  ApiError,
  AuthError,
  ForbiddenError,
  NetworkError,
  QuotaExceededError,
} from './errors'
import {
  checkLibraryContains,
  getFollowedArtistIds,
  getMe,
  getMyPlaylists,
  getPlaylistItems,
} from './spotify/endpoints'
import type {
  SpotifyPlaylistItem,
  SpotifySimplifiedPlaylist,
} from './spotify/types'

vi.mock('./auth/auth', () => ({
  isLoggedIn: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('./spotify/endpoints', () => ({
  getMe: vi.fn(),
  getMyPlaylists: vi.fn(),
  getPlaylistItems: vi.fn(),
  getFollowedArtistIds: vi.fn(),
  checkLibraryContains: vi.fn(),
}))

const OFFLINE_TEXT = "Can't connect to Spotify. The app is unavailable."

function playlist(
  id: string,
  name: string,
  ownerId: string,
  collaborative = false,
): SpotifySimplifiedPlaylist {
  return {
    id,
    name,
    uri: `spotify:playlist:${id}`,
    collaborative,
    owner: { id: ownerId, display_name: ownerId },
    images: [],
    items: { href: '', total: 3 },
  }
}

function entry(
  albumId: string,
  albumName: string,
  artists: [string, string][],
): SpotifyPlaylistItem {
  return {
    is_local: false,
    item: {
      type: 'track',
      album: {
        id: albumId,
        name: albumName,
        uri: `spotify:album:${albumId}`,
        images: [
          { url: `https://i.scdn.co/${albumId}`, width: 300, height: 300 },
        ],
        artists: artists.map(([id, artistName]) => ({ id, name: artistName })),
      },
    },
  }
}

const PLAYLISTS = [
  playlist('mine', 'My Mix', 'me'),
  playlist('collab', 'Shared Collab', 'friend', true),
  playlist('others', 'Friend Picks', 'friend'),
  playlist('radar', 'Release Radar', 'spotify'),
]

const ITEMS = [
  entry('albA', 'Album A', [['artA', 'Artist A']]),
  entry('albB', 'Album B', [['artB', 'Artist B']]),
  entry('albA', 'Album A', [['artA', 'Artist A']]),
]

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

function renderApp(search = '') {
  history.replaceState(null, '', `/${search}`)
  return render(<App callbackResult="none" />)
}

function menuButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Menu' })
}

async function openDrawer(): Promise<HTMLElement> {
  await userEvent.click(menuButton())
  return screen.findByRole('dialog', { name: 'Playlists' })
}

beforeEach(() => {
  vi.mocked(isLoggedIn).mockReturnValue(true)
  vi.mocked(logout).mockReset()
  vi.mocked(getMe).mockResolvedValue({
    id: 'me',
    display_name: 'Me',
    uri: 'spotify:user:me',
  })
  vi.mocked(getMyPlaylists).mockResolvedValue(PLAYLISTS)
  vi.mocked(getPlaylistItems).mockReset()
  vi.mocked(getPlaylistItems).mockResolvedValue(ITEMS)
  vi.mocked(checkLibraryContains).mockReset()
  vi.mocked(checkLibraryContains).mockResolvedValue([true, false])
  vi.mocked(getFollowedArtistIds).mockReset()
  vi.mocked(getFollowedArtistIds).mockResolvedValue(new Set(['artA']))
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine')
  history.replaceState(null, '', '/')
})

describe('App', () => {
  it('shows the login screen when logged out', () => {
    vi.mocked(isLoggedIn).mockReturnValue(false)
    renderApp()
    expect(
      screen.getByRole('button', { name: 'Log in with Spotify' }),
    ).toBeInTheDocument()
    expect(getMe).not.toHaveBeenCalled()
  })

  it('asks to pick a playlist when none is selected', async () => {
    renderApp()
    expect(
      await screen.findByText('Choose a playlist from the menu'),
    ).toBeInTheDocument()
    expect(getPlaylistItems).not.toHaveBeenCalled()
  })
})

describe('playlist drawer', () => {
  it('lists owned and saved playlists in two sections', async () => {
    renderApp()
    const drawer = await openDrawer()

    const owned = within(drawer).getByRole('region', {
      name: 'Your playlists',
    })
    const saved = within(drawer).getByRole('region', {
      name: 'Saved playlists',
    })
    expect(
      within(owned)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([expect.stringContaining('My Mix')])
    expect(
      within(saved)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      expect.stringContaining('Shared Collab'),
      expect.stringContaining('Friend Picks'),
      expect.stringContaining('Release Radar'),
    ])
    expect(
      within(drawer).getByRole('button', { name: 'Log out' }),
    ).toBeInTheDocument()
  })

  it('grays out inaccessible playlists with a reason and keeps them unselectable', async () => {
    renderApp()
    const drawer = await openDrawer()

    const restricted = within(drawer).getByRole('button', {
      name: /Friend Picks/,
    })
    expect(restricted).toHaveAttribute('aria-disabled', 'true')
    expect(restricted).toHaveAccessibleDescription(
      'Unavailable due to Spotify restrictions',
    )
    expect(
      within(drawer).getByRole('button', { name: /Shared Collab/ }),
    ).not.toHaveAttribute('aria-disabled')

    await userEvent.click(restricted)

    expect(location.search).toBe('')
    expect(screen.getByRole('dialog', { name: 'Playlists' })).toBeVisible()
    expect(getPlaylistItems).not.toHaveBeenCalled()
  })

  it('selects a playlist, closes the drawer and updates the URL', async () => {
    renderApp()
    const drawer = await openDrawer()

    await userEvent.click(
      within(drawer).getByRole('button', { name: /My Mix/ }),
    )

    expect(
      screen.queryByRole('dialog', { name: 'Playlists' }),
    ).not.toBeInTheDocument()
    expect(new URLSearchParams(location.search).get('playlist')).toBe('mine')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My Mix' }),
    ).toBeInTheDocument()
    expect(await screen.findAllByRole('link')).toHaveLength(2)
    expect(menuButton()).toHaveFocus()
  })

  it('drops other query parameters when selecting a playlist', async () => {
    renderApp('?ubi=x')
    const drawer = await openDrawer()

    await userEvent.click(
      within(drawer).getByRole('button', { name: /My Mix/ }),
    )

    expect(location.search).toBe('?playlist=mine')
  })

  it('closes with Escape and returns focus to the menu button', async () => {
    renderApp()
    const drawer = await openDrawer()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
    expect(menuButton()).toHaveAttribute(
      'aria-controls',
      drawer.parentElement!.id,
    )
    await waitFor(() =>
      expect(drawer).toContainElement(document.activeElement as HTMLElement),
    )

    await userEvent.keyboard('{Escape}')

    expect(
      screen.queryByRole('dialog', { name: 'Playlists' }),
    ).not.toBeInTheDocument()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(menuButton()).toHaveFocus()
  })

  it('closes on backdrop tap and returns focus to the menu button', async () => {
    renderApp()
    await openDrawer()

    await userEvent.click(screen.getByTestId('drawer-backdrop'))

    expect(
      screen.queryByRole('dialog', { name: 'Playlists' }),
    ).not.toBeInTheDocument()
    expect(menuButton()).toHaveFocus()
  })

  it('traps focus inside the drawer', async () => {
    renderApp()
    const drawer = await openDrawer()
    const logoutButton = within(drawer).getByRole('button', {
      name: 'Log out',
    })
    const first = within(drawer).getByRole('button', { name: /My Mix/ })
    await waitFor(() => expect(first).toHaveFocus())

    await userEvent.tab({ shift: true })
    expect(logoutButton).toHaveFocus()

    await userEvent.tab()
    expect(first).toHaveFocus()
  })

  it('logs out from the drawer', async () => {
    renderApp()
    const drawer = await openDrawer()
    await userEvent.click(
      within(drawer).getByRole('button', { name: 'Log out' }),
    )
    expect(logout).toHaveBeenCalledOnce()
  })
})

describe('album list', () => {
  it('shows loading progress while fetching items', async () => {
    const pending = deferred<SpotifyPlaylistItem[]>()
    vi.mocked(getPlaylistItems).mockImplementation((_id, options) => {
      options?.onProgress?.(50, 120)
      return pending.promise
    })
    renderApp('?playlist=mine')

    expect(
      await screen.findByText('Loading 50 / 120 tracks'),
    ).toBeInTheDocument()
    expect(getPlaylistItems).toHaveBeenCalledWith(
      'mine',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )

    await act(async () => pending.resolve(ITEMS))
    expect(await screen.findAllByRole('link')).toHaveLength(2)
  })

  it('aborts the previous fetch when switching playlists', async () => {
    let firstSignal: AbortSignal | undefined
    vi.mocked(getPlaylistItems).mockImplementation((id, options) => {
      if (id === 'mine') {
        firstSignal = options?.signal
        return new Promise(() => {})
      }
      return Promise.resolve(ITEMS)
    })
    renderApp('?playlist=mine')
    await screen.findByText('Loading…')
    await waitFor(() => expect(firstSignal).toBeDefined())

    const drawer = await openDrawer()
    await userEvent.click(
      within(drawer).getByRole('button', { name: /Shared Collab/ }),
    )

    await waitFor(() => expect(firstSignal?.aborted).toBe(true))
    expect(await screen.findAllByRole('link')).toHaveLength(2)
  })

  it('shows deduplicated albums with saved, unsaved and loading hearts', async () => {
    const saved = deferred<boolean[]>()
    vi.mocked(checkLibraryContains).mockReturnValue(saved.promise)
    renderApp('?playlist=mine')

    const links = await screen.findAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://open.spotify.com/album/albA',
      'https://open.spotify.com/album/albB',
    ])
    expect(screen.getAllByRole('img', { name: 'Checking' })).toHaveLength(2)
    expect(checkLibraryContains).toHaveBeenCalledWith(
      ['spotify:album:albA', 'spotify:album:albB'],
      expect.any(AbortSignal),
    )

    await act(async () => saved.resolve([true, false]))

    expect(
      await within(links[0]).findByRole('img', {
        name: 'Saved to library',
      }),
    ).toBeInTheDocument()
    expect(
      within(links[1]).getByRole('img', { name: 'Not saved' }),
    ).toBeInTheDocument()
    expect(screen.getByText('2 / 2 albums')).toBeInTheDocument()
  })

  it('filters by followed album artists and updates the count', async () => {
    const followed = deferred<Set<string>>()
    vi.mocked(getFollowedArtistIds).mockReturnValue(followed.promise)
    renderApp('?playlist=mine')
    await screen.findAllByRole('link')
    expect(getFollowedArtistIds).not.toHaveBeenCalled()

    const toggle = screen.getByRole('button', { name: 'Following only' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAttribute('aria-busy', 'true')
    expect(getFollowedArtistIds).toHaveBeenCalledOnce()

    await act(async () => followed.resolve(new Set(['artA'])))

    expect(await screen.findByText('1 / 2 albums')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-busy', 'false')
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      [expect.stringContaining('Album A')],
    )

    await userEvent.click(toggle)
    expect(screen.getByText('2 / 2 albums')).toBeInTheDocument()
    await userEvent.click(toggle)
    expect(screen.getByText('1 / 2 albums')).toBeInTheDocument()
    expect(getFollowedArtistIds).toHaveBeenCalledOnce()
  })

  it('explains when the playlist has no albums', async () => {
    vi.mocked(getPlaylistItems).mockResolvedValue([])
    renderApp('?playlist=mine')
    expect(
      await screen.findByText('This playlist has no albums to show'),
    ).toBeInTheDocument()
  })

  it('does not fetch a playlist restricted by Spotify', async () => {
    renderApp('?playlist=others')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unavailable due to Spotify restrictions',
    )
    expect(getPlaylistItems).not.toHaveBeenCalled()
  })
})

describe('error states', () => {
  it('shows the not-allowed message when /me is forbidden', async () => {
    vi.mocked(getMe).mockRejectedValue(new ForbiddenError('user'))
    renderApp()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("This account isn't allowed to use the app")
    expect(
      within(alert).getByRole('button', { name: 'Log out' }),
    ).toBeInTheDocument()
  })

  it('shows the restriction message when ?playlist= is forbidden', async () => {
    vi.mocked(getPlaylistItems).mockRejectedValue(
      new ForbiddenError('resource'),
    )
    renderApp('?playlist=mine')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't load due to Spotify restrictions",
    )
  })

  it('shows not found when ?playlist= is unknown', async () => {
    vi.mocked(getPlaylistItems).mockRejectedValue(new ApiError(404))
    renderApp('?playlist=unknown')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Playlist not found')
    expect(alert).toHaveTextContent('404')
    expect(getPlaylistItems).toHaveBeenCalledWith('unknown', expect.anything())
  })

  it('does not report a missing playlist when another request returns 404', async () => {
    vi.mocked(getMe).mockRejectedValue(new ApiError(404))
    renderApp('?playlist=mine')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load data from Spotify")
    expect(alert).not.toHaveTextContent('Playlist not found')
    expect(
      within(alert).getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Playlist Albums for Spotify',
      }),
    ).toBeInTheDocument()
  })

  it('shows a generic error with the status code', async () => {
    vi.mocked(getPlaylistItems).mockRejectedValue(new ApiError(502))
    renderApp('?playlist=mine')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load data from Spotify")
    expect(alert).toHaveTextContent('502')
    expect(
      within(alert).getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument()
  })

  it('asks to wait when the quota is exceeded', async () => {
    vi.mocked(getPlaylistItems).mockRejectedValue(new QuotaExceededError())
    renderApp('?playlist=mine')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Please wait a while and try again')
    expect(
      within(alert).getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument()
  })

  it('shows the offline message on a network error and retries', async () => {
    vi.mocked(getPlaylistItems).mockRejectedValueOnce(new NetworkError())
    renderApp('?playlist=mine')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(OFFLINE_TEXT)
    expect(logout).not.toHaveBeenCalled()

    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findAllByRole('link')).toHaveLength(2)
    expect(getPlaylistItems).toHaveBeenCalledTimes(2)
  })

  it('shows the offline message when the browser is offline', async () => {
    setOnline(false)
    renderApp('?playlist=mine')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(OFFLINE_TEXT)
    expect(
      within(alert).getByRole('button', { name: 'Retry' }),
    ).toBeInTheDocument()

    setOnline(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(await screen.findAllByRole('link')).toHaveLength(2)
  })

  it('shows the offline message when the playlist list fails', async () => {
    vi.mocked(getMyPlaylists).mockRejectedValue(new NetworkError())
    renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent(OFFLINE_TEXT)
  })

  it('logs out on an authentication error', async () => {
    vi.mocked(getMe).mockRejectedValue(new AuthError())
    renderApp()
    await waitFor(() => expect(logout).toHaveBeenCalled())
  })
})
