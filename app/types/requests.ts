export interface Request {
  id: string
  userId: string
  username: string
  mediaType: 'movie' | 'tv'
  mediaId: number
  mediaTitle: string
  mediaPoster: string | null
  status: 'pending' | 'accepted' | 'rejected'
  userNote: string | null
  adminNote: string | null
  createdAt: string
  updatedAt: string | null
}

export type RequestStatus = 'pending' | 'accepted' | 'rejected' | null
