import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasGrantedScopes, logout } from '../auth/auth'
import {
  ApiError,
  ForbiddenError,
  PartialRemovalError,
  QuotaExceededError,
} from '../errors'
import { createQueryClient } from '../hooks/queryClient'
import {
  checkLibraryContains,
  getFollowedArtistIds,
  getMe,
  getMyPlaylists,
  getPlaylistItems,
  removePlaylistItems,
} from '../spotify/endpoints'
import type {
  SpotifyPlaylistItem,
  SpotifySimplifiedPlaylist,
} from '../spotify/types'
import { MainScreen } from './MainScreen'

vi.mock('../auth/auth', () => ({
  hasGrantedScopes: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('../spotify/endpoints', () => ({
  getMe: vi.fn(),
  getMyPlaylists: vi.fn(),
  getPlaylistItems: vi.fn(),
  getFollowedArtistIds: vi.fn(),
  checkLibraryContains: vi.fn(),
  removePlaylistItems: vi.fn(),
}))

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
  trackId: string,
): SpotifyPlaylistItem {
  return {
    is_local: false,
    item: {
      type: 'track',
      uri: `spotify:track:${trackId}`,
      album: {
        id: albumId,
        name: albumName,
        uri: `spotify:album:${albumId}`,
        images: [],
        artists: [{ id: `art-${albumId}`, name: `Artist ${albumId}` }],
        total_tracks: 10,
      },
    },
  }
}

const PLAYLISTS = [
  playlist('mine', 'My Mix', 'me'),
  playlist('collab', 'Shared Collab', 'friend', true),
]

const MINE_ITEMS = [
  entry('albA', 'Album A', 't1'),
  entry('albB', 'Album B', 't2'),
  entry('albA', 'Album A', 't3'),
]

const COLLAB_ITEMS = [
  entry('albA', 'Album A', 't1'),
  entry('albC', 'Album C', 't4'),
]

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let queryClient: QueryClient

function renderMain(search = '?playlist=mine') {
  history.replaceState(null, '', `/${search}`)
  queryClient = createQueryClient(logout)
  return render(
    <QueryClientProvider client={queryClient}>
      <MainScreen />
    </QueryClientProvider>,
  )
}

function navigate(search: string) {
  act(() => {
    history.pushState(null, '', `/${search}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

function actionsButton(albumName: string): HTMLElement {
  return screen.getByRole('button', { name: `More actions for ${albumName}` })
}

async function waitForList() {
  await screen.findAllByRole('img', { name: 'Not saved' })
  await waitFor(() => expect(actionsButton('Album A')).toBeEnabled())
}

async function openSheet(albumName: string): Promise<HTMLElement> {
  await userEvent.click(actionsButton(albumName))
  return screen.getByRole('dialog', { name: albumName })
}

async function openConfirm(albumName: string): Promise<HTMLElement> {
  const sheet = await openSheet(albumName)
  await userEvent.click(
    within(sheet).getByRole('button', { name: 'Remove album from playlist' }),
  )
  return screen.getByRole('dialog')
}

async function removeAlbum(albumName: string) {
  const sheet = await openConfirm(albumName)
  await userEvent.click(within(sheet).getByRole('button', { name: 'Remove' }))
}

const SUCCESS_TEXT = /^Removed \d+ tracks? from “.+”$/

async function findSuccessBanner(): Promise<HTMLElement> {
  const text = await screen.findByText(SUCCESS_TEXT)
  const banner = text.closest<HTMLElement>('[role="status"]')
  expect(banner).not.toBeNull()
  return banner!
}

async function findAlertBanner(text: string | RegExp): Promise<HTMLElement> {
  const element = await screen.findByText(text)
  const banner = element.closest<HTMLElement>('[role="alert"]')
  expect(banner).not.toBeNull()
  return banner!
}

function querySuccessBanner(): HTMLElement | null {
  return screen.queryByText(SUCCESS_TEXT)
}

function albumLinks(): string[] {
  return screen
    .queryAllByRole('link')
    .map((link) => link.getAttribute('href') ?? '')
}

beforeEach(() => {
  vi.mocked(logout).mockReset()
  vi.mocked(hasGrantedScopes).mockReturnValue(true)
  vi.mocked(getMe).mockResolvedValue({
    id: 'me',
    display_name: 'Me',
    uri: 'spotify:user:me',
  })
  vi.mocked(getMyPlaylists).mockResolvedValue(PLAYLISTS)
  vi.mocked(getPlaylistItems).mockReset()
  vi.mocked(getPlaylistItems).mockImplementation(async (id) =>
    id === 'collab' ? COLLAB_ITEMS : MINE_ITEMS,
  )
  vi.mocked(checkLibraryContains).mockReset()
  vi.mocked(checkLibraryContains).mockImplementation(async (uris) =>
    uris.map(() => false),
  )
  vi.mocked(getFollowedArtistIds).mockResolvedValue(new Set())
  vi.mocked(removePlaylistItems).mockReset()
  vi.mocked(removePlaylistItems).mockResolvedValue()
})

afterEach(() => {
  queryClient.clear()
  history.replaceState(null, '', '/')
})

describe('removing an album', () => {
  it('removes the album from the shown playlist only', async () => {
    renderMain()
    await waitForList()
    expect(checkLibraryContains).toHaveBeenCalledOnce()

    await removeAlbum('Album A')

    const status = await findSuccessBanner()
    expect(status).toHaveTextContent('Removed 2 tracks from “My Mix”')
    expect(removePlaylistItems).toHaveBeenCalledOnce()
    expect(removePlaylistItems).toHaveBeenCalledWith('mine', [
      'spotify:track:t1',
      'spotify:track:t3',
    ])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(albumLinks()).toEqual(['https://open.spotify.com/album/albB'])
    expect(screen.getByText('1 / 1 albums')).toBeInTheDocument()
    expect(getPlaylistItems).toHaveBeenCalledOnce()
    expect(checkLibraryContains).toHaveBeenCalledOnce()
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('sends a single removal when Remove is tapped twice quickly', async () => {
    const removal = deferred<void>()
    vi.mocked(removePlaylistItems).mockReturnValue(removal.promise)
    renderMain()
    await waitForList()
    const sheet = await openConfirm('Album A')
    const remove = within(sheet).getByRole('button', { name: 'Remove' })

    act(() => {
      remove.click()
      remove.click()
    })
    await act(async () => removal.resolve())

    await findSuccessBanner()
    expect(removePlaylistItems).toHaveBeenCalledOnce()
  })

  it('allows another removal after a failed one', async () => {
    vi.mocked(removePlaylistItems).mockRejectedValueOnce(new ApiError(400))
    renderMain()
    await waitForList()
    await removeAlbum('Album A')
    await findAlertBanner(/^Couldn't remove the album/)

    await removeAlbum('Album A')

    await findSuccessBanner()
    expect(removePlaylistItems).toHaveBeenCalledTimes(2)
  })

  it('inserts the message into a live region that was already mounted', async () => {
    renderMain()
    await waitForList()
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    expect(
      screen.queryByRole('button', { name: 'Dismiss' }),
    ).not.toBeInTheDocument()

    await removeAlbum('Album A')

    expect(await findSuccessBanner()).toBe(status)
  })

  it('shows the banner after removing the last album', async () => {
    vi.mocked(getPlaylistItems).mockResolvedValue([
      entry('albA', 'Album A', 't1'),
    ])
    renderMain()
    await waitForList()

    await removeAlbum('Album A')

    expect(
      await screen.findByText('This playlist has no albums to show'),
    ).toBeInTheDocument()
    expect(screen.getByText('Removed 1 track from “My Mix”')).toBeVisible()
  })

  it('does not send a removal when the playlist changes with the sheet open', async () => {
    renderMain()
    await waitForList()
    await openConfirm('Album A')

    navigate('?playlist=collab')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await screen.findByRole('link', { name: /Album C/ })
    expect(removePlaylistItems).not.toHaveBeenCalled()
  })

  it('shows neither the sheet nor the banner after A → B → A', async () => {
    renderMain()
    await waitForList()
    await openConfirm('Album A')

    navigate('?playlist=collab')
    navigate('?playlist=mine')

    await screen.findByRole('link', { name: /Album A/ })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(removePlaylistItems).not.toHaveBeenCalled()

    await waitFor(() => expect(actionsButton('Album B')).toBeEnabled())
    await removeAlbum('Album B')
    await findSuccessBanner()

    navigate('?playlist=collab')
    expect(querySuccessBanner()).not.toBeInTheDocument()
    navigate('?playlist=mine')
    expect(querySuccessBanner()).not.toBeInTheDocument()
  })

  it('keeps the success off another playlist but updates the original cache', async () => {
    const removal = deferred<void>()
    vi.mocked(removePlaylistItems).mockReturnValue(removal.promise)
    renderMain()
    await waitForList()
    await removeAlbum('Album A')
    expect(removePlaylistItems).toHaveBeenCalledWith('mine', expect.anything())

    navigate('?playlist=collab')
    await screen.findByRole('link', { name: /Album C/ })
    await act(async () => removal.resolve())

    expect(querySuccessBanner()).not.toBeInTheDocument()
    expect(albumLinks()).toEqual([
      'https://open.spotify.com/album/albA',
      'https://open.spotify.com/album/albC',
    ])
    expect(
      queryClient
        .getQueryData<{ id: string }[]>(['playlistAlbums', 'mine'])
        ?.map((album) => album.id),
    ).toEqual(['albB'])
    expect(
      queryClient
        .getQueryData<{ id: string }[]>(['playlistAlbums', 'collab'])
        ?.map((album) => album.id),
    ).toEqual(['albA', 'albC'])

    navigate('?playlist=mine')
    await waitFor(() =>
      expect(albumLinks()).toEqual(['https://open.spotify.com/album/albB']),
    )
    expect(querySuccessBanner()).not.toBeInTheDocument()

    vi.mocked(removePlaylistItems).mockResolvedValue()
    await removeAlbum('Album B')
    await findSuccessBanner()
    expect(removePlaylistItems).toHaveBeenCalledTimes(2)
  })

  it('disables the actions while the playlist is refetching', async () => {
    renderMain()
    await waitForList()
    const refetch = deferred<SpotifyPlaylistItem[]>()
    vi.mocked(getPlaylistItems).mockReturnValue(refetch.promise)

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))

    await waitFor(() => expect(actionsButton('Album A')).toBeDisabled())
    expect(actionsButton('Album B')).toBeDisabled()

    await act(async () => refetch.resolve(MINE_ITEMS))
    await waitFor(() => expect(actionsButton('Album A')).toBeEnabled())
  })

  it('cancels a refetch that started before the removal', async () => {
    renderMain()
    await waitForList()
    const sheet = await openConfirm('Album A')
    const refetch = deferred<SpotifyPlaylistItem[]>()
    vi.mocked(getPlaylistItems).mockReturnValue(refetch.promise)
    act(() => {
      void queryClient.invalidateQueries({
        queryKey: ['playlistAlbums', 'mine'],
      })
    })

    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove' }))
    await findSuccessBanner()
    await act(async () => refetch.resolve(MINE_ITEMS))

    expect(albumLinks()).toEqual(['https://open.spotify.com/album/albB'])
  })

  it('cancels a refetch that started during the removal', async () => {
    const removal = deferred<void>()
    vi.mocked(removePlaylistItems).mockReturnValue(removal.promise)
    renderMain()
    await waitForList()
    await removeAlbum('Album A')
    const refetch = deferred<SpotifyPlaylistItem[]>()
    vi.mocked(getPlaylistItems).mockReturnValue(refetch.promise)
    act(() => {
      void queryClient.invalidateQueries({
        queryKey: ['playlistAlbums', 'mine'],
      })
    })

    await act(async () => removal.resolve())
    await findSuccessBanner()
    await act(async () => refetch.resolve(MINE_ITEMS))

    expect(albumLinks()).toEqual(['https://open.spotify.com/album/albB'])
  })

  it('reports a forbidden playlist without refetching', async () => {
    vi.mocked(removePlaylistItems).mockRejectedValue(
      new ForbiddenError('resource'),
    )
    renderMain()
    await waitForList()

    await removeAlbum('Album A')

    await findAlertBanner("You can't edit this playlist")
    expect(
      screen.queryByRole('button', { name: 'Log in again' }),
    ).not.toBeInTheDocument()
    expect(getPlaylistItems).toHaveBeenCalledOnce()
    expect(albumLinks()).toHaveLength(2)
  })

  it.each([
    ['a client error', new ApiError(400), false],
    ['the quota running out', new QuotaExceededError(), false],
    ['a server error', new ApiError(502), true],
    ['broken JSON on success', new ApiError(200), true],
    ['an unknown error', new Error('boom'), true],
  ])('handles %s', async (_label, error, refetches) => {
    vi.mocked(removePlaylistItems).mockRejectedValue(error)
    renderMain()
    await waitForList()

    await removeAlbum('Album A')

    await findAlertBanner(
      refetches
        ? /^The removal may not have completed \(.+\)$/
        : /^Couldn't remove the album \(.+\)$/,
    )
    if (refetches) {
      await waitFor(() => expect(getPlaylistItems).toHaveBeenCalledTimes(2))
    } else {
      expect(getPlaylistItems).toHaveBeenCalledOnce()
    }
  })

  it('reports a partial removal and refetches', async () => {
    vi.mocked(removePlaylistItems).mockRejectedValue(
      new PartialRemovalError(1, undefined, { cause: new ApiError(500) }),
    )
    renderMain()
    await waitForList()

    await removeAlbum('Album A')

    await findAlertBanner(
      "Only some tracks were removed (Couldn't load data from Spotify)",
    )
    await waitFor(() => expect(getPlaylistItems).toHaveBeenCalledTimes(2))
  })

  it('moves focus to the main area when the refetch disables the button', async () => {
    vi.mocked(removePlaylistItems).mockRejectedValue(new ApiError(502))
    renderMain()
    await waitForList()
    const refetch = deferred<SpotifyPlaylistItem[]>()
    vi.mocked(getPlaylistItems).mockReturnValue(refetch.promise)

    await removeAlbum('Album A')

    await findAlertBanner(/^The removal may not have completed/)
    expect(actionsButton('Album A')).toBeDisabled()
    expect(screen.getByRole('main')).toHaveFocus()
    await act(async () => refetch.resolve(MINE_ITEMS))
  })

  it('returns focus to the actions button when the sheet is canceled', async () => {
    renderMain()
    await waitForList()
    const sheet = await openSheet('Album B')

    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(actionsButton('Album B')).toHaveFocus()
  })

  it('dismisses the banner with its button', async () => {
    renderMain()
    await waitForList()
    await removeAlbum('Album A')
    const status = await findSuccessBanner()

    await userEvent.click(
      within(status).getByRole('button', { name: 'Dismiss' }),
    )

    expect(querySuccessBanner()).not.toBeInTheDocument()
  })

  it('dismisses the banner on reload', async () => {
    renderMain()
    await waitForList()
    await removeAlbum('Album A')
    await findSuccessBanner()

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(querySuccessBanner()).not.toBeInTheDocument()
  })

  it('offers the actions on a collaborative playlist', async () => {
    renderMain('?playlist=collab')
    await screen.findByRole('link', { name: /Album C/ })
    expect(actionsButton('Album C')).toBeInTheDocument()
  })

  it('hides the actions when the playlist is not in the list', async () => {
    renderMain('?playlist=unknown')
    await screen.findAllByRole('img', { name: 'Not saved' })
    expect(albumLinks()).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: /^More actions for/ }),
    ).not.toBeInTheDocument()
  })
})
