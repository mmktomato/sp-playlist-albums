type BannerRole = 'status' | 'alert'

type BannerProps = {
  banner: { role: BannerRole; message: string } | null
  onDismiss: () => void
}

const ROLES: readonly BannerRole[] = ['status', 'alert']

const COLORS: Record<BannerRole, string> = {
  status: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900',
  alert: 'bg-red-700 text-white',
}

export function Banner({ banner, onDismiss }: BannerProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pr-[calc(env(safe-area-inset-right)+0.75rem)] pb-[env(safe-area-inset-bottom)] pl-[calc(env(safe-area-inset-left)+0.75rem)]">
      {ROLES.map((role) => (
        <LiveRegion
          key={role}
          role={role}
          message={banner?.role === role ? banner.message : null}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}

type LiveRegionProps = {
  role: BannerRole
  message: string | null
  onDismiss: () => void
}

function LiveRegion({ role, message, onDismiss }: LiveRegionProps) {
  return (
    <div
      role={role}
      className={
        message === null
          ? undefined
          : `pointer-events-auto mb-3 flex w-full max-w-lg items-center gap-2 rounded-lg py-2 pr-2 pl-4 text-sm shadow-lg ${COLORS[role]}`
      }
    >
      {message !== null && (
        <>
          <p className="min-w-0 flex-1">{message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-green-500 dark:hover:bg-black/10"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-5 fill-none stroke-current"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}
