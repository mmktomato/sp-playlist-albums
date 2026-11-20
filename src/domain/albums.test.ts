import { describe, expect, it } from 'vitest'
import type {
  SpotifyImage,
  SpotifyPlaylistItem,
  SpotifySimplifiedAlbum,
} from '../spotify/types'
import { aggregateAlbums } from './albums'

function album(
  id: string | null,
  overrides: Partial<SpotifySimplifiedAlbum> = {},
): SpotifySimplifiedAlbum {
  return {
    id,
    name: `Album ${id}`,
    uri: id ? `spotify:album:${id}` : null,
    images: [{ url: `https://i.scdn.co/${id}`, width: 300, height: 300 }],
    artists: [{ id: `artist-${id}`, name: `Artist ${id}` }],
    ...overrides,
  }
}

function track(
  name: string,
  trackAlbum: SpotifySimplifiedAlbum | null,
): SpotifyPlaylistItem {
  return {
    is_local: false,
    item: { type: 'track', id: name, name, album: trackAlbum },
  }
}

describe('aggregateAlbums', () => {
  it('dedupes albums from the spec example', () => {
    const result = aggregateAlbums([
      track('a', album('A')),
      track('b', album('B')),
      track('aa', album('A')),
    ])
    expect(result.map((a) => a.id)).toEqual(['A', 'B'])
  })

  it('keeps first-appearance order and counts tracks', () => {
    const result = aggregateAlbums([
      track('c1', album('C')),
      track('a1', album('A')),
      track('c2', album('C')),
      track('b1', album('B')),
      track('c3', album('C')),
      track('a2', album('A')),
    ])
    expect(result.map((a) => [a.id, a.trackCount])).toEqual([
      ['C', 3],
      ['A', 2],
      ['B', 1],
    ])
  })

  it('maps album fields', () => {
    const [result] = aggregateAlbums([
      track('a', album('A', { total_tracks: 12 })),
    ])
    expect(result).toStrictEqual({
      id: 'A',
      name: 'Album A',
      uri: 'spotify:album:A',
      url: 'https://open.spotify.com/album/A',
      imageUrl: 'https://i.scdn.co/A',
      artists: [{ id: 'artist-A', name: 'Artist A' }],
      trackCount: 1,
      totalTracks: 12,
    })
  })

  it('leaves totalTracks undefined when total_tracks is missing or not a number', () => {
    const result = aggregateAlbums([
      track('a', album('A')),
      track('b', album('B', { total_tracks: '7' as unknown as number })),
      track('c', album('C', { total_tracks: Number.NaN })),
    ])
    expect(result.map((a) => a.totalTracks)).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })

  it('takes totalTracks from the first appearance of the album', () => {
    const [result] = aggregateAlbums([
      track('a1', album('A', { total_tracks: 10 })),
      track('a2', album('A', { total_tracks: 11 })),
    ])
    expect(result.totalTracks).toBe(10)
  })

  it('falls back to the deprecated track key', () => {
    const result = aggregateAlbums([
      { is_local: false, track: { type: 'track', album: album('A') } },
    ])
    expect(result.map((a) => a.id)).toEqual(['A'])
  })

  it('prefers the item key over the track key', () => {
    const result = aggregateAlbums([
      {
        is_local: false,
        item: { type: 'track', album: album('A') },
        track: { type: 'track', album: album('B') },
      },
    ])
    expect(result.map((a) => a.id)).toEqual(['A'])
  })

  it('excludes local tracks', () => {
    const result = aggregateAlbums([
      { is_local: true, item: { type: 'track', album: album('L') } },
      {
        is_local: false,
        item: { type: 'track', is_local: true, album: album('M') },
      },
      track('a', album('A')),
    ])
    expect(result.map((a) => a.id)).toEqual(['A'])
  })

  it('excludes episodes, including ones returned in track shape', () => {
    const result = aggregateAlbums([
      { is_local: false, item: { type: 'episode', id: 'e1', name: 'Ep' } },
      {
        is_local: false,
        track: {
          type: 'episode',
          id: 'e2',
          name: 'Ep in track shape',
          album: album('show-1', { name: 'Some Show' }),
        },
      },
      track('a', album('A')),
    ])
    expect(result.map((a) => a.id)).toEqual(['A'])
  })

  it('excludes null items and null entries', () => {
    const result = aggregateAlbums([
      { is_local: false, item: null },
      { is_local: false, item: null, track: null },
      { is_local: false },
      null,
      track('a', album('A')),
    ])
    expect(result.map((a) => a.id)).toEqual(['A'])
  })

  it('excludes tracks whose album or album id is null', () => {
    const result = aggregateAlbums([
      track('x', album(null)),
      track('y', null),
      track('a', album('A')),
    ])
    expect(result.map((a) => a.id)).toEqual(['A'])
  })

  it('leaves imageUrl undefined when images are empty or missing', () => {
    const result = aggregateAlbums([
      track('a', album('A', { images: [] })),
      track('b', album('B', { images: undefined })),
    ])
    expect(result.map((a) => a.imageUrl)).toEqual([undefined, undefined])
  })

  it('prefers an image around 300px', () => {
    const images: SpotifyImage[] = [
      { url: 'large', width: 640, height: 640 },
      { url: 'medium', width: 300, height: 300 },
      { url: 'small', width: 64, height: 64 },
    ]
    const [result] = aggregateAlbums([track('a', album('A', { images }))])
    expect(result.imageUrl).toBe('medium')
  })

  it('uses the first image when sizes are unknown', () => {
    const images: SpotifyImage[] = [
      { url: 'first', width: null, height: null },
      { url: 'second', width: null, height: null },
    ]
    const [result] = aggregateAlbums([track('a', album('A', { images }))])
    expect(result.imageUrl).toBe('first')
  })

  it('tolerates missing album artists', () => {
    const result = aggregateAlbums([
      track('a', album('A', { artists: undefined })),
      track('b', album('B', { artists: [{ id: null, name: 'Unknown' }] })),
    ])
    expect(result.map((a) => a.artists)).toEqual([[], []])
  })

  it('falls back to a built URI when the album URI is null', () => {
    const [result] = aggregateAlbums([track('a', album('A', { uri: null }))])
    expect(result.uri).toBe('spotify:album:A')
  })
})
