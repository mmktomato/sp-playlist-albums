import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Album } from '../domain/types'
import { AlbumCard } from './AlbumCard'

const album: Album = {
  id: 'alb1',
  name: 'Album One',
  uri: 'spotify:album:alb1',
  url: 'https://open.spotify.com/album/alb1',
  imageUrl: 'https://i.scdn.co/image/alb1',
  artists: [
    { id: 'a1', name: 'Artist A' },
    { id: 'a2', name: 'Artist B' },
  ],
  trackCount: 1,
  trackUris: ['spotify:track:t1'],
  removable: true,
}

describe('AlbumCard', () => {
  it('links to the album page and shows the album and artist names', () => {
    render(<AlbumCard album={album} saved="saved" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/album/alb1')
    expect(link).toHaveTextContent('Album One')
    expect(link).toHaveTextContent('Artist A, Artist B')
  })

  it('truncates the album name and the artist names to one line each', () => {
    render(<AlbumCard album={album} saved="saved" />)
    expect(screen.getByText('Album One')).toHaveClass('truncate')
    expect(screen.getByText('Artist A, Artist B')).toHaveClass('truncate')
  })

  it('switches to the placeholder when the cover fails to load', () => {
    const { container } = render(<AlbumCard album={album} saved="saved" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(screen.queryByTestId('cover-placeholder')).not.toBeInTheDocument()

    fireEvent.error(img!)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('cover-placeholder')).toBeInTheDocument()
  })

  it('shows the placeholder when the album has no cover', () => {
    const { container } = render(
      <AlbumCard album={{ ...album, imageUrl: undefined }} saved="saved" />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('cover-placeholder')).toBeInTheDocument()
  })

  it.each([
    ['saved', 'Saved to library'],
    ['unsaved', 'Not saved'],
    ['loading', 'Checking'],
  ] as const)('labels the %s heart', (state, label) => {
    render(<AlbumCard album={album} saved={state} />)
    const heart = screen.getByRole('img', { name: label })
    expect(heart).toHaveAttribute('data-heart', state)
  })

  it('renders a filled heart only when saved', () => {
    const { container, rerender } = render(
      <AlbumCard album={album} saved="saved" />,
    )
    expect(container.querySelector('[data-heart] svg')).toHaveClass(
      'fill-green-500',
    )
    rerender(<AlbumCard album={album} saved="unsaved" />)
    expect(container.querySelector('[data-heart] svg')).toHaveClass('fill-none')
  })

  it('hides the heart when the saved state is unknown', () => {
    render(<AlbumCard album={album} saved="unknown" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it.each([
    [12, '12 tracks'],
    [1, '1 track'],
  ])('shows %i album tracks inside the link', (totalTracks, text) => {
    render(<AlbumCard album={{ ...album, totalTracks }} saved="saved" />)
    expect(screen.getByRole('link')).toContainElement(screen.getByText(text))
  })

  it('omits the track count line when the total is missing', () => {
    render(<AlbumCard album={album} saved="saved" />)
    expect(screen.queryByText(/\btracks?\b/)).not.toBeInTheDocument()
  })

  it('has no actions button unless requested', () => {
    render(<AlbumCard album={album} saved="saved" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens the actions for the album from a button next to the link', () => {
    const onOpenActions = vi.fn()
    render(
      <AlbumCard
        album={album}
        saved="saved"
        showActions
        onOpenActions={onOpenActions}
      />,
    )
    const button = screen.getByRole('button', {
      name: 'More actions for Album One',
    })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toBeEnabled()
    expect(screen.getByRole('link')).not.toContainElement(button)
    expect(
      within(screen.getByRole('link')).queryByRole('button'),
    ).not.toBeInTheDocument()

    fireEvent.click(button)

    expect(onOpenActions).toHaveBeenCalledWith(album)
  })

  it('disables the actions button', () => {
    const onOpenActions = vi.fn()
    render(
      <AlbumCard
        album={album}
        saved="saved"
        showActions
        actionsDisabled
        onOpenActions={onOpenActions}
      />,
    )
    const button = screen.getByRole('button', {
      name: 'More actions for Album One',
    })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onOpenActions).not.toHaveBeenCalled()
  })
})
