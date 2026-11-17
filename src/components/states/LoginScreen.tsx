import { useState } from 'react'
import { login, type CallbackResult } from '../../auth/auth'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { OFFLINE_MESSAGE } from './describeError'

const CALLBACK_MESSAGES: Partial<Record<CallbackResult, string>> = {
  denied: 'Login was canceled',
  'missing-verifier': 'Please log in again',
  error: 'Login failed',
}

type LoginScreenProps = {
  callbackResult: CallbackResult
  clientIdConfigured: boolean
}

export function LoginScreen({
  callbackResult,
  clientIdConfigured,
}: LoginScreenProps) {
  const online = useOnlineStatus()
  const [loginFailed, setLoginFailed] = useState(false)

  const notice = !clientIdConfigured
    ? 'Client ID is not set'
    : !online
      ? OFFLINE_MESSAGE
      : loginFailed
        ? CALLBACK_MESSAGES.error
        : CALLBACK_MESSAGES[callbackResult]

  const handleLogin = async () => {
    setLoginFailed(false)
    try {
      await login()
    } catch (error) {
      console.error(error)
      setLoginFailed(true)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center">
      <h1 className="text-2xl font-bold">Playlist Albums</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        See every album in your Spotify playlists
      </p>
      {notice && (
        <p
          role="alert"
          className="rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
        >
          {notice}
        </p>
      )}
      <button
        type="button"
        onClick={handleLogin}
        disabled={!clientIdConfigured || !online}
        className="rounded-full bg-green-600 px-8 py-3 font-semibold text-white hover:bg-green-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500 disabled:cursor-not-allowed disabled:bg-neutral-400 dark:disabled:bg-neutral-700"
      >
        Log in with Spotify
      </button>
    </main>
  )
}
