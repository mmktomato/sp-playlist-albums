import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState, type JSX } from 'react'
import { isLoggedIn, logout, type CallbackResult } from './auth/auth'
import { MainScreen } from './components/MainScreen'
import { LoadingState } from './components/states/LoadingState'
import { LoginScreen } from './components/states/LoginScreen'
import { SPOTIFY_CLIENT_ID } from './config'
import { createQueryClient } from './hooks/queryClient'

const DebugPage = lazy(() => import('./dev/DebugPage'))

export type AppProps = {
  callbackResult: CallbackResult
}

export default function App({ callbackResult }: AppProps): JSX.Element {
  const [loggedIn] = useState(isLoggedIn)
  if (!loggedIn) {
    return (
      <LoginScreen
        callbackResult={callbackResult}
        clientIdConfigured={SPOTIFY_CLIENT_ID !== ''}
      />
    )
  }
  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const [queryClient] = useState(() => createQueryClient(logout))
  const [debug] = useState(() =>
    new URLSearchParams(location.search).has('debug'),
  )
  return (
    <QueryClientProvider client={queryClient}>
      {debug ? (
        <Suspense fallback={<LoadingState />}>
          <DebugPage />
        </Suspense>
      ) : (
        <MainScreen />
      )}
    </QueryClientProvider>
  )
}
