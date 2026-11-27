// Normalized subset of a media server item that the Library page needs.
// Jellyfin is the first provider; new providers map their own DTOs into this
// same shape so the UI never has to know provider-specific field names.
export interface MediaServerItemDto {
  Id: string
  ProviderIds?: Record<string, string>
  Name?: string
  OriginalTitle?: string
  Type?: string
  Overview?: string
  ProductionYear?: number
  PremiereDate?: string
  CommunityRating?: number
  OfficialRating?: string
  RunTimeTicks?: number
  Genres?: string[]
  ImageTags?: { Primary?: string }
  BackdropImageTags?: string[]
  RecursiveItemCount?: number
  ChildCount?: number
  DateCreated?: string
}
