import type { Album } from '../domain/types'
import { AlbumCard, type SavedState } from './AlbumCard'

type AlbumListProps = {
  albums: readonly Album[]
  getSavedState: (album: Album) => SavedState
  showActions?: boolean
  actionsDisabled?: boolean
  onOpenActions?: (album: Album) => void
}

export function AlbumList({
  albums,
  getSavedState,
  showActions,
  actionsDisabled,
  onOpenActions,
}: AlbumListProps) {
  return (
    <ul className="mx-auto max-w-3xl divide-y divide-neutral-200 py-1 dark:divide-neutral-800">
      {albums.map((album) => (
        <li key={album.id}>
          <AlbumCard
            album={album}
            saved={getSavedState(album)}
            showActions={showActions}
            actionsDisabled={actionsDisabled}
            onOpenActions={onOpenActions}
          />
        </li>
      ))}
    </ul>
  )
}
