import type { ReactNode } from 'react'

type StatusMessageProps = {
  title: string
  detail?: ReactNode
  role?: 'status' | 'alert'
  children?: ReactNode
}

export function StatusMessage({
  title,
  detail,
  role = 'status',
  children,
}: StatusMessageProps) {
  return (
    <div
      role={role}
      className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center"
    >
      <p className="text-base font-semibold">{title}</p>
      {detail && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {detail}
        </p>
      )}
      {children && <div className="mt-2 flex gap-3">{children}</div>}
    </div>
  )
}

type ActionButtonProps = {
  onClick: () => void
  children: ReactNode
}

export function ActionButton({ onClick, children }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-semibold text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
    >
      {children}
    </button>
  )
}
