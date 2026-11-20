import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { AuthError } from '../errors'

export const STALE_TIME_MS = 5 * 60_000

export function createQueryClient(onAuthError: () => void): QueryClient {
  const handleError = (error: unknown) => {
    if (error instanceof AuthError) onAuthError()
  }
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: {
        networkMode: 'always',
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: STALE_TIME_MS,
      },
      mutations: {
        networkMode: 'always',
        retry: false,
      },
    },
  })
}
