import { describe, expect, it } from 'vitest'
import type { SpotifySimplifiedPlaylist } from '../spotify/types'
import {
  ACCESSIBILITY_METHOD,
  canModify,
  classifyPlaylists,
  isAccessible,
  toPlaylistSummary,
} from './playlists'

const ME = 'me'

function playlist(
  id: string,
  overrides: Partial<SpotifySimplifiedPlaylist> = {},
): SpotifySimplifiedPlaylist {
  return {
    id,
    name: `Playlist ${id}`,
    uri: `spotify:playlist:${id}`,
    collaborative: false,
    owner: { id: ME, display_name: 'Me' },
    images: [{ url: `https://i.scdn.co/${id}`, width: 300, height: 300 }],
    items: {
      href: `https://api.spotify.com/v1/playlists/${id}/items`,
      total: 10,
    },
    ...overrides,
  }
}

const owned = playlist('owned')
const ownedCollaborative = playlist('owned-collab', { collaborative: true })
const saved = playlist('saved', {
  owner: { id: 'someone', display_name: 'Someone' },
  items: undefined,
})
const savedCollaborative = playlist('saved-collab', {
  owner: { id: 'friend', display_name: 'Friend' },
  collaborative: true,
})
const invitedCollaborator = playlist('invited', {
  owner: { id: 'friend', display_name: 'Friend' },
  collaborative: false,
})
const madeForYou = playlist('release-radar', {
  owner: { id: 'spotify', display_name: 'Spotify' },
  items: undefined,
})

describe('toPlaylistSummary', () => {
  it('maps the API playlist', () => {
    expect(toPlaylistSummary(owned)).toEqual({
      id: 'owned',
      name: 'Playlist owned',
      ownerId: ME,
      ownerName: 'Me',
      collaborative: false,
      hasItemsField: true,
      total: 10,
      imageUrl: 'https://i.scdn.co/owned',
    })
  })

  it('detects a missing items field', () => {
    const summary = toPlaylistSummary(saved)
    expect(summary.hasItemsField).toBe(false)
    expect(summary.total).toBeUndefined()
  })

  it('falls back to the deprecated tracks total', () => {
    const summary = toPlaylistSummary(
      playlist('old', {
        items: undefined,
        tracks: { href: 'https://example.com', total: 7 },
      }),
    )
    expect(summary.hasItemsField).toBe(false)
    expect(summary.total).toBe(7)
  })

  it('handles missing images and owner display name', () => {
    const summary = toPlaylistSummary(
      playlist('bare', {
        images: null,
        owner: { id: 'someone', display_name: null },
      }),
    )
    expect(summary.imageUrl).toBeUndefined()
    expect(summary.ownerName).toBe('someone')
  })
})

describe('classifyPlaylists', () => {
  it('splits owned and saved playlists in order, skipping nulls', () => {
    const result = classifyPlaylists(
      [
        saved,
        null,
        owned,
        savedCollaborative,
        undefined,
        ownedCollaborative,
        madeForYou,
      ],
      ME,
    )
    expect(result.owned.map((p) => p.id)).toEqual(['owned', 'owned-collab'])
    expect(result.saved.map((p) => p.id)).toEqual([
      'saved',
      'saved-collab',
      'release-radar',
    ])
  })
})

describe('isAccessible', () => {
  const summaries = Object.fromEntries(
    [
      owned,
      ownedCollaborative,
      saved,
      savedCollaborative,
      invitedCollaborator,
      madeForYou,
    ].map((p) => [p.id, toPlaylistSummary(p)]),
  )

  it('defaults to the owner-or-collaborative method', () => {
    expect(ACCESSIBILITY_METHOD).toBe('owner-or-collaborative')
    expect(isAccessible(summaries.saved, ME)).toBe(false)
    expect(isAccessible(summaries.owned, ME)).toBe(true)
  })

  it('uses ownership and the collaborative flag', () => {
    const method = 'owner-or-collaborative'
    expect(isAccessible(summaries.owned, ME, method)).toBe(true)
    expect(isAccessible(summaries['owned-collab'], ME, method)).toBe(true)
    expect(isAccessible(summaries['saved-collab'], ME, method)).toBe(true)
    expect(isAccessible(summaries.saved, ME, method)).toBe(false)
    expect(isAccessible(summaries.invited, ME, method)).toBe(false)
    expect(isAccessible(summaries['release-radar'], ME, method)).toBe(false)
  })

  it('uses the presence of the items field', () => {
    const method = 'items-field'
    expect(isAccessible(summaries.owned, ME, method)).toBe(true)
    expect(isAccessible(summaries['owned-collab'], ME, method)).toBe(true)
    expect(isAccessible(summaries['saved-collab'], ME, method)).toBe(true)
    expect(isAccessible(summaries.invited, ME, method)).toBe(true)
    expect(isAccessible(summaries.saved, ME, method)).toBe(false)
    expect(isAccessible(summaries['release-radar'], ME, method)).toBe(false)
  })
})

describe('canModify', () => {
  const summaries = Object.fromEntries(
    [
      owned,
      ownedCollaborative,
      saved,
      savedCollaborative,
      invitedCollaborator,
      madeForYou,
    ].map((p) => [p.id, toPlaylistSummary(p)]),
  )

  it('allows owned and collaborative playlists', () => {
    expect(canModify(summaries.owned, ME)).toBe(true)
    expect(canModify(summaries['owned-collab'], ME)).toBe(true)
    expect(canModify(summaries['saved-collab'], ME)).toBe(true)
  })

  it('rejects playlists owned by others that are not collaborative', () => {
    expect(canModify(summaries.saved, ME)).toBe(false)
    expect(canModify(summaries.invited, ME)).toBe(false)
    expect(canModify(summaries['release-radar'], ME)).toBe(false)
  })

  it('ignores the items field', () => {
    const withItems = toPlaylistSummary(
      playlist('other-with-items', {
        owner: { id: 'someone', display_name: 'Someone' },
      }),
    )
    expect(withItems.hasItemsField).toBe(true)
    expect(canModify(withItems, ME)).toBe(false)
  })
})
