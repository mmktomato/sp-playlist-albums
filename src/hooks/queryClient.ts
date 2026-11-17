import { QueryCache, QueryClient } from '@tanstack/react-query'
import { AuthError } from '../errors'

export const STALE_TIME_MS = 5 * 60_000

export function createQueryClient(onAuthError: () => void): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof AuthError) onAuthError()
      },
    }),
    defaultOptions: {
      queries: {
        networkMode: 'always',
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: STALE_TIME_MS,
      },
    },
  })
}
