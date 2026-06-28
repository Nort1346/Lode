export interface WishlistItem {
  id: string
  mediaType: 'movie' | 'tv'
  mediaId: number
  mediaTitle: string
  mediaPoster: string | null
  createdAt: string
}
