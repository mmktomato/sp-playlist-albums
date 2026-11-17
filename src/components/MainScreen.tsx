import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { logout } from '../auth/auth'
import { filterByFollowedAlbumArtists } from '../domain/filter'
import { isAccessible } from '../domain/playlists'
import type { Album } from '../domain/types'
import {
  reloadSpotifyData,
  useFollowedArtists,
  useMe,
  usePlaylistAlbums,
  usePlaylists,
  useSavedAlbums,
} from '../hooks/spotifyQueries'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useSelectedPlaylistId } from '../hooks/useSelectedPlaylistId'
import type { SavedState } from './AlbumCard'
import { AlbumList } from './AlbumList'
import { Header } from './Header'
import { PlaylistDrawer, type DrawerStatus } from './PlaylistDrawer'
import { OFFLINE_MESSAGE, describeError } from './states/describeError'
import { ErrorState } from './states/ErrorState'
import { LoadingState } from './states/LoadingState'
import { ActionButton, StatusMessage } from './states/StatusMessage'

const APP_TITLE = 'Playlist Albums for Spotify'

export function MainScreen() {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const drawerId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [followOnly, setFollowOnly] = useState(false)
  const [selectedId, selectPlaylist] = useSelectedPlaylistId()

  const me = useMe()
  const meId = me.data?.id
  const playlists = usePlaylists(meId)
  const selected = useMemo(() => {
    const all = [
      ...(playlists.data?.owned ?? []),
      ...(playlists.data?.saved ?? []),
    ]
    return all.find((playlist) => playlist.id === selectedId)
  }, [playlists.data, selectedId])
  const selectedRestricted =
    selected !== undefined &&
    meId !== undefined &&
    !isAccessible(selected, meId)

  const { query: albumsQuery, progress } = usePlaylistAlbums(
    selectedId,
    playlists.isSuccess && !selectedRestricted,
  )
  const albums = albumsQuery.data
  const savedQuery = useSavedAlbums(
    selectedId,
    albums,
    albumsQuery.dataUpdatedAt,
  )
  const followedQuery = useFollowedArtists(followOnly)

  const visibleAlbums = useMemo(() => {
    if (!albums || !followOnly || !followedQuery.data) return albums
    return filterByFollowedAlbumArtists(albums, followedQuery.data)
  }, [albums, followOnly, followedQuery.data])

  const getSavedState = useCallback(
    (album: Album): SavedState => {
      if (savedQuery.isError) return 'unknown'
      const flag = savedQuery.data?.get(album.id)
      if (flag === undefined) return 'loading'
      return flag ? 'saved' : 'unsaved'
    },
    [savedQuery.data, savedQuery.isError],
  )

  const reload = useCallback(() => {
    void reloadSpotifyData(queryClient)
  }, [queryClient])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const handleSelect = useCallback(
    (playlistId: string) => {
      selectPlaylist(playlistId)
      setDrawerOpen(false)
    },
    [selectPlaylist],
  )

  const drawerStatus: DrawerStatus = playlists.isSuccess
    ? 'ready'
    : me.isError || playlists.isError
      ? 'error'
      : 'loading'

  const title =
    selected?.name ??
    (selectedId && drawerStatus === 'loading' ? '' : APP_TITLE)

  const renderContent = () => {
    if (!online) {
      return (
        <StatusMessage role="alert" title={OFFLINE_MESSAGE}>
          <ActionButton onClick={reload}>Retry</ActionButton>
        </StatusMessage>
      )
    }
    const listError = me.error ?? playlists.error
    if (listError) {
      return <ErrorState error={listError} onRetry={reload} onLogout={logout} />
    }
    if (!playlists.isSuccess) return <LoadingState />
    if (!selectedId) {
      return <StatusMessage title="Choose a playlist from the menu" />
    }
    if (selectedRestricted) {
      return (
        <StatusMessage
          role="alert"
          title="Unavailable due to Spotify restrictions"
          detail="Tracks in playlists owned by other users can't be loaded."
        />
      )
    }
    if (albumsQuery.isError) {
      return (
        <ErrorState
          error={albumsQuery.error}
          source="playlist-items"
          onRetry={reload}
        />
      )
    }
    if (!albums || !visibleAlbums) return <LoadingState progress={progress} />
    if (albums.length === 0) {
      return <StatusMessage title="This playlist has no albums to show" />
    }
    if (followOnly && followedQuery.isError) {
      return (
        <ErrorState
          error={followedQuery.error}
          onRetry={() => void followedQuery.refetch()}
        />
      )
    }
    return (
      <>
        {savedQuery.isError && (
          <p
            role="alert"
            className="mx-3 mt-3 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
          >
            Couldn't check your library ({describeError(savedQuery.error).title}
            )
          </p>
        )}
        {visibleAlbums.length === 0 ? (
          <StatusMessage title="No albums by artists you follow" />
        ) : (
          <AlbumList albums={visibleAlbums} getSavedState={getSavedState} />
        )}
      </>
    )
  }

  return (
    <div className="min-h-dvh">
      <Header
        title={title}
        count={
          albums && visibleAlbums && albums.length > 0
            ? { shown: visibleAlbums.length, total: albums.length }
            : undefined
        }
        menuOpen={drawerOpen}
        menuButtonRef={menuButtonRef}
        drawerId={drawerId}
        onMenuClick={() => setDrawerOpen(true)}
        followOnly={followOnly}
        followLoading={followOnly && followedQuery.isFetching}
        followDisabled={!albums || albums.length === 0}
        onFollowToggle={() => setFollowOnly((value) => !value)}
        reloading={albumsQuery.isFetching || playlists.isFetching}
        onReload={reload}
      />
      <main className="pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        {renderContent()}
      </main>
      <PlaylistDrawer
        id={drawerId}
        open={drawerOpen}
        onClose={closeDrawer}
        returnFocusRef={menuButtonRef}
        status={drawerStatus}
        owned={playlists.data?.owned ?? []}
        saved={playlists.data?.saved ?? []}
        meId={meId ?? ''}
        selectedId={selectedId}
        onSelect={handleSelect}
        onLogout={logout}
      />
    </div>
  )
}
