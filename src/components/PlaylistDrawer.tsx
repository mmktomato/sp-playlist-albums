import { useEffect, useId, useRef, type RefObject } from 'react'
import { isAccessible } from '../domain/playlists'
import type { PlaylistSummary } from '../domain/types'

const RESTRICTED_REASON = 'Unavailable due to Spotify restrictions'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export type DrawerStatus = 'loading' | 'error' | 'ready'

type PlaylistDrawerProps = {
  id: string
  open: boolean
  onClose: () => void
  returnFocusRef: RefObject<HTMLElement | null>
  status: DrawerStatus
  owned: readonly PlaylistSummary[]
  saved: readonly PlaylistSummary[]
  meId: string
  selectedId: string | null
  onSelect: (playlistId: string) => void
  onLogout: () => void
}

export function PlaylistDrawer({
  id,
  open,
  onClose,
  returnFocusRef,
  status,
  owned,
  saved,
  meId,
  selectedId,
  onSelect,
  onLogout,
}: PlaylistDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const returnTarget = returnFocusRef.current
    if (!panel) return

    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    ;(focusables()[0] ?? panel).focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!panel.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      returnTarget?.focus()
    }
  }, [open, returnFocusRef])

  return (
    <div id={id} hidden={!open} className="fixed inset-0 z-40">
      <div
        data-testid="drawer-backdrop"
        aria-hidden="true"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Playlists"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-xl outline-none dark:bg-neutral-900"
      >
        <div className="flex-1 overflow-y-auto py-2">
          {status === 'loading' && (
            <p role="status" className="px-4 py-3 text-sm text-neutral-500">
              Loading…
            </p>
          )}
          {status === 'error' && (
            <p role="alert" className="px-4 py-3 text-sm text-neutral-500">
              Couldn't load playlists
            </p>
          )}
          {status === 'ready' && (
            <>
              <PlaylistSection
                title="Your playlists"
                playlists={owned}
                meId={meId}
                selectedId={selectedId}
                onSelect={onSelect}
              />
              <PlaylistSection
                title="Saved playlists"
                playlists={saved}
                meId={meId}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            </>
          )}
        </div>
        <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-green-500 dark:text-red-400 dark:hover:bg-neutral-800"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}

type PlaylistSectionProps = {
  title: string
  playlists: readonly PlaylistSummary[]
  meId: string
  selectedId: string | null
  onSelect: (playlistId: string) => void
}

function PlaylistSection({
  title,
  playlists,
  meId,
  selectedId,
  onSelect,
}: PlaylistSectionProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="py-2">
      <h2
        id={headingId}
        className="px-4 pb-1 text-xs font-semibold tracking-wide text-neutral-500 dark:text-neutral-400"
      >
        {title}
      </h2>
      {playlists.length === 0 ? (
        <p className="px-4 py-2 text-sm text-neutral-500">No playlists</p>
      ) : (
        <ul>
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <PlaylistItem
                playlist={playlist}
                accessible={isAccessible(playlist, meId)}
                selected={playlist.id === selectedId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type PlaylistItemProps = {
  playlist: PlaylistSummary
  accessible: boolean
  selected: boolean
  onSelect: (playlistId: string) => void
}

function PlaylistItem({
  playlist,
  accessible,
  selected,
  onSelect,
}: PlaylistItemProps) {
  const reasonId = useId()
  return (
    <button
      type="button"
      aria-disabled={accessible ? undefined : true}
      aria-describedby={accessible ? undefined : reasonId}
      aria-current={selected ? 'true' : undefined}
      onClick={() => {
        if (accessible) onSelect(playlist.id)
      }}
      className={`flex w-full flex-col items-start px-4 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green-500 ${
        accessible
          ? 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
          : 'cursor-not-allowed opacity-50'
      } ${selected ? 'bg-neutral-100 font-semibold dark:bg-neutral-800' : ''}`}
    >
      <span className="w-full truncate text-sm">{playlist.name}</span>
      {accessible ? (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {playlist.ownerName}
        </span>
      ) : (
        <span id={reasonId} className="text-xs text-neutral-500">
          {RESTRICTED_REASON}
        </span>
      )}
    </button>
  )
}
