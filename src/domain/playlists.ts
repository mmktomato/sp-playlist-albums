import type { SpotifySimplifiedPlaylist } from '../spotify/types'
import { pickImageUrl } from './images'
import type { PlaylistSummary } from './types'

export type AccessibilityMethod = 'items-field' | 'owner-or-collaborative'

// Prefer 'items-field' once the API is confirmed to omit `items` for inaccessible playlists.
export const ACCESSIBILITY_METHOD: AccessibilityMethod =
  'owner-or-collaborative'

export function toPlaylistSummary(
  playlist: SpotifySimplifiedPlaylist,
): PlaylistSummary {
  return {
    id: playlist.id,
    name: playlist.name,
    ownerId: playlist.owner.id,
    ownerName: playlist.owner.display_name ?? playlist.owner.id,
    collaborative: playlist.collaborative,
    hasItemsField: playlist.items != null,
    total: playlist.items?.total ?? playlist.tracks?.total,
    imageUrl: pickImageUrl(playlist.images),
  }
}

export function isAccessible(
  summary: PlaylistSummary,
  meId: string,
  method: AccessibilityMethod = ACCESSIBILITY_METHOD,
): boolean {
  if (method === 'items-field') return summary.hasItemsField
  return summary.ownerId === meId || summary.collaborative
}

export function canModify(summary: PlaylistSummary, meId: string): boolean {
  return summary.ownerId === meId || summary.collaborative
}

export type ClassifiedPlaylists = {
  owned: PlaylistSummary[]
  saved: PlaylistSummary[]
}

export function classifyPlaylists(
  playlists: readonly (SpotifySimplifiedPlaylist | null | undefined)[],
  meId: string,
): ClassifiedPlaylists {
  const result: ClassifiedPlaylists = { owned: [], saved: [] }
  for (const playlist of playlists) {
    if (!playlist) continue
    const summary = toPlaylistSummary(playlist)
    if (summary.ownerId === meId) result.owned.push(summary)
    else result.saved.push(summary)
  }
  return result
}
