import { useState } from 'react'
import type { Album } from '../domain/types'
import { formatTracks } from './formatTracks'

export type SavedState = 'saved' | 'unsaved' | 'loading' | 'unknown'

const HEART_LABELS: Record<Exclude<SavedState, 'unknown'>, string> = {
  saved: 'Saved to library',
  unsaved: 'Not saved',
  loading: 'Checking',
}

const HEART_PATH =
  'M12 21s-7.5-4.6-9.6-9.3C1 8.4 3 5 6.4 5c2 0 3.6 1.1 4.6 2.6l1 1.4 1-1.4C14 6.1 15.6 5 17.6 5 21 5 23 8.4 21.6 11.7 19.5 16.4 12 21 12 21Z'

function Heart({ state }: { state: SavedState }) {
  if (state === 'unknown') return null
  if (state === 'loading') {
    return (
      <span
        role="img"
        aria-label={HEART_LABELS.loading}
        data-heart="loading"
        className="size-6 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700"
      />
    )
  }
  const saved = state === 'saved'
  return (
    <span
      role="img"
      aria-label={HEART_LABELS[state]}
      data-heart={state}
      className="flex size-6 items-center justify-center"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`size-6 ${saved ? 'fill-green-500 stroke-green-500' : 'fill-none stroke-neutral-400 dark:stroke-neutral-500'}`}
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <path d={HEART_PATH} />
      </svg>
    </span>
  )
}

function CoverPlaceholder() {
  return (
    <div
      data-testid="cover-placeholder"
      aria-hidden="true"
      className="flex size-full items-center justify-center text-neutral-400 dark:text-neutral-500"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-1/2">
        <path d="M9 18.5a3 3 0 1 1-2-2.83V5l12-2v12.5a3 3 0 1 1-2-2.83V7.4l-8 1.33v9.77Z" />
      </svg>
    </div>
  )
}

type AlbumCardProps = {
  album: Album
  saved: SavedState
}

export function AlbumCard({ album, saved }: AlbumCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = album.imageUrl !== undefined && !imageFailed
  const artistNames = album.artists.map((artist) => artist.name).join(', ')
  const trackTotal =
    typeof album.totalTracks === 'number' && Number.isFinite(album.totalTracks)
      ? formatTracks(album.totalTracks)
      : null

  return (
    <a
      href={album.url}
      className="flex items-center gap-3 px-3 py-2 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green-500 dark:hover:bg-neutral-900"
    >
      <div className="size-14 shrink-0 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
        {showImage ? (
          <img
            src={album.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="size-full object-cover"
          />
        ) : (
          <CoverPlaceholder />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{album.name}</p>
        {artistNames && (
          <p className="truncate text-xs text-neutral-600 dark:text-neutral-400">
            {artistNames}
          </p>
        )}
        {trackTotal && <p className="text-xs text-neutral-500">{trackTotal}</p>}
      </div>
      <div className="flex size-6 shrink-0 items-center justify-center">
        <Heart state={saved} />
      </div>
    </a>
  )
}
