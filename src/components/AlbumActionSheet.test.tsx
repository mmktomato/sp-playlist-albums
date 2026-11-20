import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasGrantedScopes, login } from '../auth/auth'
import { MODIFY_SCOPES } from '../config'
import type { Album } from '../domain/types'
import { AlbumActionSheet } from './AlbumActionSheet'

vi.mock('../auth/auth', () => ({
  hasGrantedScopes: vi.fn(),
  login: vi.fn(),
}))

const album: Album = {
  id: 'alb1',
  name: 'Album One',
  uri: 'spotify:album:alb1',
  url: 'https://open.spotify.com/album/alb1',
  artists: [{ id: 'a1', name: 'Artist A' }],
  trackCount: 3,
  totalTracks: 10,
  trackUris: ['spotify:track:t1', 'spotify:track:t2'],
  removable: true,
}

type SheetProps = Parameters<typeof AlbumActionSheet>[0]

function renderSheet(props: Partial<SheetProps> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  const allProps: SheetProps = {
    album,
    playlistName: 'My Mix',
    pending: false,
    onConfirm,
    onClose,
    ...props,
  }
  const result = render(<AlbumActionSheet {...allProps} />)
  return {
    ...result,
    onConfirm,
    onClose,
    rerenderWith: (next: Partial<SheetProps>) =>
      result.rerender(<AlbumActionSheet {...allProps} {...next} />),
  }
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog')
}

async function goToConfirm() {
  await userEvent.click(
    within(dialog()).getByRole('button', {
      name: 'Remove album from playlist',
    }),
  )
}

beforeEach(() => {
  vi.mocked(hasGrantedScopes).mockReset()
  vi.mocked(hasGrantedScopes).mockReturnValue(true)
  vi.mocked(login).mockReset()
  vi.mocked(login).mockResolvedValue()
})

describe('AlbumActionSheet', () => {
  it('shows the album and its artists as a modal dialog', () => {
    renderSheet()
    const sheet = screen.getByRole('dialog', { name: 'Album One' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(sheet).toHaveTextContent('Artist A')
    expect(
      within(sheet).getByRole('button', { name: 'Remove album from playlist' }),
    ).toHaveFocus()
  })

  it('confirms and then removes', async () => {
    const { onConfirm, onClose } = renderSheet()
    await goToConfirm()

    const sheet = screen.getByRole('dialog', {
      name: 'Remove from “My Mix”?',
    })
    expect(sheet).toHaveAccessibleDescription(
      'All 3 tracks from “Album One” will be removed from this playlist.',
    )
    expect(within(sheet).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(hasGrantedScopes).toHaveBeenCalledWith(MODIFY_SCOPES)

    await userEvent.click(within(sheet).getByRole('button', { name: 'Remove' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('uses the singular form for one track', async () => {
    renderSheet({ album: { ...album, trackCount: 1 } })
    await goToConfirm()
    expect(dialog()).toHaveAccessibleDescription(
      '1 track from “Album One” will be removed from this playlist.',
    )
  })

  it('closes with Cancel from the menu', async () => {
    const { onClose, onConfirm } = renderSheet()
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Cancel' }),
    )
    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('closes with Cancel from the confirmation', async () => {
    const { onClose, onConfirm } = renderSheet()
    await goToConfirm()
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Cancel' }),
    )
    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('closes with Escape and on backdrop tap', async () => {
    const { onClose } = renderSheet()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByTestId('sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('cannot be closed while removing', async () => {
    const { onClose, onConfirm, rerenderWith } = renderSheet()
    await goToConfirm()
    rerenderWith({ pending: true })

    const sheet = dialog()
    const removing = within(sheet).getByRole('button', { name: 'Removing…' })
    expect(removing).toBeDisabled()
    expect(within(sheet).getByRole('button', { name: 'Cancel' })).toBeDisabled()

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByTestId('sheet-backdrop'))
    await userEvent.click(removing)

    expect(onClose).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('asks to log in again instead of removing without the scopes', async () => {
    vi.mocked(hasGrantedScopes).mockReturnValue(false)
    const { onConfirm } = renderSheet()
    await goToConfirm()

    const sheet = screen.getByRole('dialog', {
      name: 'Editing playlists needs extra permission',
    })
    const loginButton = within(sheet).getByRole('button', {
      name: 'Log in again',
    })
    expect(loginButton).toHaveFocus()
    expect(
      within(sheet).queryByRole('button', { name: 'Remove' }),
    ).not.toBeInTheDocument()

    await userEvent.click(loginButton)

    expect(login).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disables removal when some tracks cannot be removed', async () => {
    const { onConfirm } = renderSheet({
      album: { ...album, removable: false },
    })
    const item = within(dialog()).getByRole('button', {
      name: 'Remove album from playlist',
    })
    expect(item).toBeDisabled()
    expect(item).toHaveAccessibleDescription(
      "Some tracks can't be removed by this app",
    )
    expect(
      within(dialog()).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus()

    await userEvent.click(item)

    expect(hasGrantedScopes).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('traps focus inside the sheet', async () => {
    renderSheet()
    const sheet = dialog()
    const item = within(sheet).getByRole('button', {
      name: 'Remove album from playlist',
    })
    const cancel = within(sheet).getByRole('button', { name: 'Cancel' })
    expect(item).toHaveFocus()

    await userEvent.tab({ shift: true })
    expect(cancel).toHaveFocus()

    await userEvent.tab()
    expect(item).toHaveFocus()
  })
})
