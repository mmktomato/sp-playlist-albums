import { describe, expect, it } from 'vitest'
import type { SpotifyPlaylistItem } from '../spotify/types'
import { aggregateAlbums } from './albums'
import { filterByFollowedAlbumArtists } from './filter'

const entries: SpotifyPlaylistItem[] = [
  {
    is_local: false,
    item: {
      type: 'track',
      name: 'Solo',
      artists: [{ id: 'followed', name: 'Followed' }],
      album: {
        id: 'A',
        name: 'Album A',
        uri: 'spotify:album:A',
        artists: [{ id: 'followed', name: 'Followed' }],
      },
    },
  },
  {
    is_local: false,
    item: {
      type: 'track',
      name: 'Feat',
      artists: [
        { id: 'other', name: 'Other' },
        { id: 'followed', name: 'Followed' },
      ],
      album: {
        id: 'B',
        name: 'Album B',
        uri: 'spotify:album:B',
        artists: [{ id: 'other', name: 'Other' }],
      },
    },
  },
  {
    is_local: false,
    item: {
      type: 'track',
      name: 'Split',
      artists: [{ id: 'other', name: 'Other' }],
      album: {
        id: 'C',
        name: 'Album C',
        uri: 'spotify:album:C',
        artists: [
          { id: 'other', name: 'Other' },
          { id: 'followed', name: 'Followed' },
        ],
      },
    },
  },
  {
    is_local: false,
    item: {
      type: 'track',
      name: 'No artists',
      album: { id: 'D', name: 'Album D', uri: 'spotify:album:D' },
    },
  },
]

describe('filterByFollowedAlbumArtists', () => {
  const albums = aggregateAlbums(entries)

  it('keeps albums whose album artists include a followed artist', () => {
    const result = filterByFollowedAlbumArtists(albums, new Set(['followed']))
    expect(result.map((a) => a.id)).toEqual(['A', 'C'])
  })

  it('ignores track artists, including featured-only followed artists', () => {
    const result = filterByFollowedAlbumArtists(albums, new Set(['followed']))
    expect(result.map((a) => a.id)).not.toContain('B')
  })

  it('returns nothing when no artist is followed', () => {
    expect(filterByFollowedAlbumArtists(albums, new Set())).toEqual([])
  })
})
