import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
