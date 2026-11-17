import type { LoadProgress } from '../../hooks/spotifyQueries'

type LoadingStateProps = {
  progress?: LoadProgress | null
}

export function LoadingState({ progress }: LoadingStateProps) {
  return (
    <div
      role="status"
      className="mx-auto flex max-w-xs flex-col items-center gap-3 px-6 py-16 text-center"
    >
      <Spinner className="size-6" />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {progress
          ? `Loading ${progress.loaded} / ${progress.total} tracks`
          : 'Loading…'}
      </p>
      {progress && progress.total > 0 && (
        <progress
          className="h-1 w-full accent-green-500"
          value={progress.loaded}
          max={progress.total}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`animate-spin ${className}`}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
