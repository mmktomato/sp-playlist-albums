import type { RefObject } from 'react'
import { Spinner } from './states/LoadingState'

type HeaderProps = {
  title: string
  count?: { shown: number; total: number }
  menuOpen: boolean
  menuButtonRef: RefObject<HTMLButtonElement | null>
  drawerId: string
  onMenuClick: () => void
  followOnly: boolean
  followLoading: boolean
  followDisabled: boolean
  onFollowToggle: () => void
  reloading: boolean
  onReload: () => void
}

const iconButton =
  'flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-green-500 dark:hover:bg-neutral-800'

export function Header({
  title,
  count,
  menuOpen,
  menuButtonRef,
  drawerId,
  onMenuClick,
  followOnly,
  followLoading,
  followDisabled,
  onFollowToggle,
  reloading,
  onReload,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-2">
        <button
          ref={menuButtonRef}
          type="button"
          className={iconButton}
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls={drawerId}
          onClick={onMenuClick}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-6 stroke-current"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="min-w-0 text-center">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {count && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {count.shown} / {count.total} albums
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={followOnly}
            aria-busy={followLoading}
            disabled={followDisabled}
            onClick={onFollowToggle}
            className={`flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-green-500 disabled:opacity-40 ${
              followOnly
                ? 'border-green-600 bg-green-600 text-white'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {followLoading && <Spinner className="size-3.5" />}
            Following only
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label="Reload"
            aria-busy={reloading}
            onClick={onReload}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className={`size-5 fill-none stroke-current ${reloading ? 'animate-spin' : ''}`}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
