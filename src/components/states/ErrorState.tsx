import { describeError, type ErrorSource } from './describeError'
import { ActionButton, StatusMessage } from './StatusMessage'

type ErrorStateProps = {
  error: unknown
  source?: ErrorSource
  onRetry?: () => void
  onLogout?: () => void
}

export function ErrorState({
  error,
  source,
  onRetry,
  onLogout,
}: ErrorStateProps) {
  const { kind, title, detail, retryable } = describeError(error, source)
  return (
    <StatusMessage role="alert" title={title} detail={detail}>
      {retryable && onRetry && (
        <ActionButton onClick={onRetry}>Retry</ActionButton>
      )}
      {kind === 'not-allowed-user' && onLogout && (
        <ActionButton onClick={onLogout}>Log out</ActionButton>
      )}
    </StatusMessage>
  )
}
