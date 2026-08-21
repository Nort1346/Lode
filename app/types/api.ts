export interface ApiError {
  data?: { statusMessage?: string; statusCode?: number }
  statusMessage?: string
  statusCode?: number
  status?: number
}
