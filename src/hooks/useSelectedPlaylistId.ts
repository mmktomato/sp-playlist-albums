import { useCallback, useSyncExternalStore } from 'react'

export const PLAYLIST_PARAM = 'playlist'

const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('popstate', onChange)
  }
}

function getSnapshot(): string | null {
  return new URLSearchParams(location.search).get(PLAYLIST_PARAM) || null
}

export function useSelectedPlaylistId(): [string | null, (id: string) => void] {
  const selectedId = useSyncExternalStore(subscribe, getSnapshot)
  const select = useCallback((id: string) => {
    if (id === getSnapshot()) return
    const url = new URL(location.href)
    url.searchParams.set(PLAYLIST_PARAM, id)
    history.pushState(history.state, '', url)
    for (const listener of listeners) listener()
  }, [])
  return [selectedId, select]
}
