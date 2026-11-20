export type AlbumArtist = {
  id: string
  name: string
}

export type Album = {
  id: string
  name: string
  uri: string
  url: string
  imageUrl?: string
  artists: AlbumArtist[]
  trackCount: number
  totalTracks?: number
}

export type PlaylistSummary = {
  id: string
  name: string
  ownerId: string
  ownerName: string
  collaborative: boolean
  hasItemsField: boolean
  total?: number
  imageUrl?: string
}
