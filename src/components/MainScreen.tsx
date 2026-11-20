import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { logout } from '../auth/auth'
import { filterByFollowedAlbumArtists } from '../domain/filter'
import { canModify, isAccessible } from '../domain/playlists'
import type { Album } from '../domain/types'
import { ForbiddenError, PartialRemovalError } from '../errors'
import {
  isNothingRemoved,
  queryKeys,
  reloadSpotifyData,
  useFollowedArtists,
  useMe,
  usePlaylistAlbums,
  usePlaylists,
  useRemoveAlbumFromPlaylist,
  useSavedAlbums,
} from '../hooks/spotifyQueries'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useSelectedPlaylistId } from '../hooks/useSelectedPlaylistId'
import { AlbumActionSheet } from './AlbumActionSheet'
import type { SavedState } from './AlbumCard'
import { AlbumList } from './AlbumList'
import { Banner } from './Banner'
import { formatTracks } from './formatTracks'
import { Header } from './Header'
import { PlaylistDrawer, type DrawerStatus } from './PlaylistDrawer'
import { OFFLINE_MESSAGE, describeError } from './states/describeError'
import { ErrorState } from './states/ErrorState'
import { LoadingState } from './states/LoadingState'
import { ActionButton, StatusMessage } from './states/StatusMessage'

const APP_TITLE = 'Playlist Albums for Spotify'

type SheetState = {
  playlistId: string
  playlistName: string
  album: Album
}

type BannerState = {
  playlistId: string
  role: 'status' | 'alert'
  message: string
}

function removalErrorMessage(error: unknown): string {
  if (error instanceof ForbiddenError) return "You can't edit this playlist"
  if (error instanceof PartialRemovalError) {
    return `Only some tracks were removed (${describeError(error.cause).title})`
  }
  if (!isNothingRemoved(error)) {
    return `The removal may not have completed (${describeError(error).title})`
  }
  return `Couldn't remove the album (${describeError(error).title})`
}

export function MainScreen() {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const drawerId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [followOnly, setFollowOnly] = useState(false)
  const [selectedId, selectPlaylist] = useSelectedPlaylistId()
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [banner, setBanner] = useState<BannerState | null>(null)
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId)
  if (prevSelectedId !== selectedId) {
    setPrevSelectedId(selectedId)
    setSheet(null)
    setBanner(null)
  }
  const sheetRef = useRef(sheet)
  useEffect(() => {
    sheetRef.current = sheet
  }, [sheet])
  const removeMutation = useRemoveAlbumFromPlaylist()
  const submittingRef = useRef(false)

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
    setBanner(null)
    void reloadSpotifyData(queryClient)
  }, [queryClient])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const showActions =
    selected !== undefined && meId !== undefined && canModify(selected, meId)
  const actionsDisabled = removeMutation.isPending || albumsQuery.isFetching

  const openActions = useCallback(
    (album: Album) => {
      if (!selectedId || !selected) return
      setBanner(null)
      setSheet({ playlistId: selectedId, playlistName: selected.name, album })
    },
    [selectedId, selected],
  )

  const closeSheet = useCallback(() => setSheet(null), [])

  const confirmRemoval = () => {
    const snapshot = sheet
    if (!snapshot || submittingRef.current || removeMutation.isPending) return
    submittingRef.current = true
    const { playlistId, playlistName, album } = snapshot
    removeMutation.mutate(
      { playlistId, albumId: album.id, uris: album.trackUris },
      {
        onSuccess: () => {
          if (sheetRef.current !== snapshot) return
          setSheet(null)
          setBanner({
            playlistId,
            role: 'status',
            message: `Removed ${formatTracks(album.trackCount)} from “${playlistName}”`,
          })
          mainRef.current?.focus()
        },
        onError: (error) => {
          if (sheetRef.current !== snapshot) return
          const refetching =
            queryClient.isFetching({
              queryKey: queryKeys.playlistAlbums(playlistId),
            }) > 0
          if (refetching) mainRef.current?.focus()
          setSheet(null)
          setBanner({
            playlistId,
            role: 'alert',
            message: removalErrorMessage(error),
          })
        },
        onSettled: () => {
          submittingRef.current = false
        },
      },
    )
  }

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

  const visibleBanner = banner?.playlistId === selectedId ? banner : null

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
          <AlbumList
            albums={visibleAlbums}
            getSavedState={getSavedState}
            showActions={showActions}
            actionsDisabled={actionsDisabled}
            onOpenActions={openActions}
          />
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
      <main
        ref={mainRef}
        tabIndex={-1}
        className={`pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] outline-none ${
          visibleBanner
            ? 'pb-[calc(env(safe-area-inset-bottom)+8rem)]'
            : 'pb-[env(safe-area-inset-bottom)]'
        }`}
      >
        {renderContent()}
      </main>
      <Banner banner={visibleBanner} onDismiss={() => setBanner(null)} />
      {sheet && sheet.playlistId === selectedId && (
        <AlbumActionSheet
          album={sheet.album}
          playlistName={sheet.playlistName}
          pending={removeMutation.isPending}
          onConfirm={confirmRemoval}
          onClose={closeSheet}
          fallbackFocusRef={mainRef}
        />
      )}
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
