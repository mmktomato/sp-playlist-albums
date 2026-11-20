import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getGrantedScopes } from '../auth/auth'
import { ForbiddenError } from '../errors'
import * as endpoints from '../spotify/endpoints'
import type { SpotifySimplifiedPlaylist } from '../spotify/types'
import DebugPage from './DebugPage'

vi.mock('../auth/auth', () => ({
  logout: vi.fn(),
  getGrantedScopes: vi.fn(() => []),
}))

vi.mock('../spotify/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../spotify/endpoints')>()
  return {
    ...actual,
    getMe: vi.fn(),
    getMyPlaylists: vi.fn(),
    getPlaylistItems: vi.fn(),
    getPlaylistItemsFirstPageRaw: vi.fn(),
    getFollowedArtistIds: vi.fn(),
    checkLibraryContains: vi.fn(),
  }
})

function playlist(
  overrides: Partial<SpotifySimplifiedPlaylist> & { id: string },
): SpotifySimplifiedPlaylist {
  return {
    name: overrides.id,
    uri: `spotify:playlist:${overrides.id}`,
    collaborative: false,
    owner: { id: 'me' },
    images: [{ url: 'https://i.scdn.co/image/x', width: 300, height: 300 }],
    ...overrides,
  }
}

describe('DebugPage', () => {
  beforeEach(() => {
    vi.mocked(endpoints.getMe).mockResolvedValue({
      id: 'me',
      display_name: 'Me',
      uri: 'spotify:user:me',
    })
    vi.mocked(endpoints.getMyPlaylists).mockResolvedValue([
      playlist({
        id: 'mine',
        items: { href: 'https://api.spotify.com/x', total: 3 },
      }),
      playlist({ id: 'theirs', owner: { id: 'other' } }),
      playlist({ id: 'radar', owner: { id: 'spotify' } }),
    ])
  })

  it('renders me id and playlist rows with both accessibility values', async () => {
    render(<DebugPage />)

    expect(await screen.findByTestId('me-id')).toHaveTextContent('me')

    const mine = screen.getByTestId('playlist-mine')
    expect(within(mine).getByTestId('access-items-field')).toHaveTextContent(
      'true',
    )
    expect(
      within(mine).getByTestId('access-owner-or-collaborative'),
    ).toHaveTextContent('true')

    const theirs = screen.getByTestId('playlist-theirs')
    expect(within(theirs).getByTestId('access-items-field')).toHaveTextContent(
      'false',
    )
    expect(
      within(theirs).getByTestId('access-owner-or-collaborative'),
    ).toHaveTextContent('false')

    expect(
      within(screen.getByTestId('playlist-radar')).getByText('Made for You?'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('image-hosts')).toHaveTextContent('i.scdn.co')
  })

  it('shows the granted scopes', async () => {
    vi.mocked(getGrantedScopes).mockReturnValueOnce([
      'playlist-read-private',
      'playlist-modify-public',
    ])
    render(<DebugPage />)

    const list = screen.getByTestId('granted-scopes')
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['playlist-read-private', 'playlist-modify-public'])
    expect(await screen.findByTestId('me-id')).toHaveTextContent('me')
  })

  it('notes when no scopes are recorded', async () => {
    render(<DebugPage />)

    expect(screen.getByTestId('granted-scopes')).toHaveTextContent(
      '(none recorded)',
    )
    expect(await screen.findByTestId('me-id')).toHaveTextContent('me')
  })

  it('shows the error class when a selected playlist is forbidden', async () => {
    vi.mocked(endpoints.getPlaylistItemsFirstPageRaw).mockRejectedValue(
      new ForbiddenError('resource'),
    )
    vi.mocked(endpoints.getPlaylistItems).mockRejectedValue(
      new ForbiddenError('resource'),
    )
    render(<DebugPage />)

    await userEvent.click(await screen.findByRole('button', { name: 'theirs' }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts[0]).toHaveTextContent('ForbiddenError (scope=resource)')
  })
})
