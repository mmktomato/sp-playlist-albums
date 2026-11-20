import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { hasGrantedScopes, login } from '../auth/auth'
import { MODIFY_SCOPES } from '../config'
import type { Album } from '../domain/types'
import { useModalFocus } from '../hooks/useModalFocus'
import { formatTracks } from './formatTracks'

type Step = 'menu' | 'permission' | 'confirm'

type AlbumActionSheetProps = {
  album: Album
  playlistName: string
  pending: boolean
  onConfirm: () => void
  onClose: () => void
  fallbackFocusRef?: RefObject<HTMLElement | null>
}

const sheetButton =
  'w-full rounded-lg px-4 py-3 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-neutral-800'

const primaryButton =
  'w-full rounded-full px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500 disabled:cursor-not-allowed disabled:opacity-60'

function confirmMessage(trackCount: number, albumName: string): string {
  return trackCount === 1
    ? `1 track from “${albumName}” will be removed from this playlist.`
    : `All ${formatTracks(trackCount)} from “${albumName}” will be removed from this playlist.`
}

export function AlbumActionSheet({
  album,
  playlistName,
  pending,
  onConfirm,
  onClose,
  fallbackFocusRef,
}: AlbumActionSheetProps) {
  const [step, setStep] = useState<Step>('menu')
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const loginRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const detailId = useId()
  const reasonId = useId()

  useModalFocus({
    open: true,
    containerRef: panelRef,
    onClose,
    fallbackFocusRef,
    dismissible: !pending,
  })

  useEffect(() => {
    if (step === 'confirm') cancelRef.current?.focus()
    else if (step === 'permission') loginRef.current?.focus()
  }, [step])

  useEffect(() => {
    if (pending) panelRef.current?.focus()
  }, [pending])

  const artistNames = album.artists.map((artist) => artist.name).join(', ')

  const handleRemoveItem = () => {
    setStep(hasGrantedScopes(MODIFY_SCOPES) ? 'confirm' : 'permission')
  }

  const handleLogin = () => {
    login().catch((error: unknown) => console.error(error))
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        data-testid="sheet-backdrop"
        aria-hidden="true"
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          if (!pending) onClose()
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={step === 'confirm' ? detailId : undefined}
        aria-busy={pending}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-2xl bg-white pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-xl outline-none dark:bg-neutral-900"
      >
        <div className="flex flex-col gap-1 p-4">
          {step === 'menu' && (
            <>
              <h2 id={titleId} className="truncate text-base font-semibold">
                {album.name}
              </h2>
              {artistNames && (
                <p className="truncate text-sm text-neutral-600 dark:text-neutral-400">
                  {artistNames}
                </p>
              )}
              <div className="mt-3 flex flex-col">
                <button
                  type="button"
                  disabled={!album.removable}
                  aria-describedby={album.removable ? undefined : reasonId}
                  onClick={handleRemoveItem}
                  className={`${sheetButton} text-left text-red-600 dark:text-red-400`}
                >
                  Remove album from playlist
                </button>
                {!album.removable && (
                  <p
                    id={reasonId}
                    className="px-4 pb-2 text-xs text-neutral-600 dark:text-neutral-400"
                  >
                    Some tracks can't be removed by this app
                  </p>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className={`${sheetButton} text-left`}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
          {step === 'permission' && (
            <>
              <h2 id={titleId} className="text-base font-semibold">
                Editing playlists needs extra permission
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  ref={loginRef}
                  type="button"
                  onClick={handleLogin}
                  className={`${primaryButton} bg-green-600 text-white hover:bg-green-500`}
                >
                  Log in again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className={`${sheetButton} text-center`}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
          {step === 'confirm' && (
            <>
              <h2 id={titleId} className="text-base font-semibold">
                Remove from “{playlistName}”?
              </h2>
              <p
                id={detailId}
                className="text-sm text-neutral-600 dark:text-neutral-400"
              >
                {confirmMessage(album.trackCount, album.name)}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={onConfirm}
                  className={`${primaryButton} bg-red-600 text-white hover:bg-red-500`}
                >
                  {pending ? 'Removing…' : 'Remove'}
                </button>
                <button
                  ref={cancelRef}
                  type="button"
                  disabled={pending}
                  onClick={onClose}
                  className={`${sheetButton} text-center`}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
