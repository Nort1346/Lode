export interface ApiError {
  data?: { statusMessage?: string }
  statusMessage?: string
}

export function mapApiError(e: unknown): ApiError {
  if (typeof e === 'object' && e !== null && 'data' in e) {
    return e as ApiError
  }
  if (typeof e === 'object' && e !== null && 'statusMessage' in e) {
    return e as ApiError
  }
  return {}
}
