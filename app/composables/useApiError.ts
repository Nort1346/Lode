import type { ApiError } from '~/types/api'

export function mapApiError(e: unknown): ApiError {
  if (
    typeof e === 'object' &&
    e !== null &&
    ('data' in e || 'statusMessage' in e || 'statusCode' in e || 'status' in e)
  ) {
    return e as ApiError
  }
  return {}
}

// h3/ofetch errors expose the status code in several places: top-level status, top-level
// statusCode, or nested under data.statusCode
export function getApiStatusCode(e: unknown): number | undefined {
  const err = mapApiError(e)
  return err.data?.statusCode ?? err.statusCode ?? err.status
}
