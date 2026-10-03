import type { ApiError, RateLimitPayload } from '~/types/api'

export type ApiErrorTranslator = (key: string, params?: number | Record<string, unknown>) => string

export interface FriendlyApiError {
  title: string
  description: string
}

export function mapApiError(e: unknown): ApiError {
  if (e !== null && typeof e === 'object') {
    const candidate = e as { data?: unknown; statusMessage?: unknown; statusCode?: unknown; status?: unknown }
    return {
      data: (candidate.data ?? undefined) as ApiError['data'],
      statusMessage: typeof candidate.statusMessage === 'string' ? candidate.statusMessage : undefined,
      statusCode: typeof candidate.statusCode === 'number' ? candidate.statusCode : undefined,
      status: typeof candidate.status === 'number' ? candidate.status : undefined
    }
  }
  return {}
}

export function getApiStatusCode(e: unknown): number | undefined {
  const err = mapApiError(e)
  return err.data?.statusCode ?? err.statusCode ?? err.status
}

// Server messages that are safe to show verbatim: short, no URLs, no newlines or
// backticks, no upstream service or credential names, no stack-trace fragments.
// Anything else falls back to the localized generic description.
export function isSafeServerMessage(message: string | undefined): string | undefined {
  if (message === undefined || message.trim().length === 0) return undefined
  if (message.length > 140) return undefined
  if (/https?:\/\//i.test(message)) return undefined
  if (/[\n\r`\\]/.test(message)) return undefined
  if (/\b(prowlarr|qbittorrent|tmdb|jellyfin|flaresolverr|indexer|api[_ -]?key|token|secret)\b/i.test(message)) return undefined
  if (/\bat \w+ \(/.test(message)) return undefined
  if (/\.(ts|js|mjs|cjs)(:\d+)?\b/.test(message)) return undefined
  return message
}

function getRateLimitPayload(e: unknown): RateLimitPayload | undefined {
  return mapApiError(e).data?.data
}

function parseCount(message: string | undefined, pattern: RegExp): number | undefined {
  if (message === undefined) return undefined
  const match = pattern.exec(message)
  const parsed = match === null ? undefined : Number(match[1])
  return parsed === undefined || !Number.isFinite(parsed) ? undefined : parsed
}

// Turns any thrown value (ofetch FetchError, Error, or unknown shape) into a
// localized, human-friendly { title, description } pair. `t` is the i18n
// translate function, injected so the mapping stays pure and unit-testable.
// The site-level title (e.g. download.error) always wins; use the returned
// description for the toast body.
export function describeApiError(e: unknown, t: ApiErrorTranslator): FriendlyApiError {
  if (e !== null && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError') {
    return { title: t('apiError.abortedTitle'), description: t('apiError.abortedDesc') }
  }

  const status = getApiStatusCode(e)
  const rawMessage = mapApiError(e).data?.statusMessage ?? mapApiError(e).statusMessage
  const safeMessage = isSafeServerMessage(rawMessage)

  if (status === undefined) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
    if (/network|failed to fetch|load failed|timed? ?out/i.test(message)) {
      console.debug('[api-error] network failure:', e)
      return { title: t('apiError.networkTitle'), description: t('apiError.networkDesc') }
    }
    console.debug('[api-error] unrecognized error:', e)
    return { title: t('apiError.genericTitle'), description: t('apiError.genericDesc') }
  }

  if (status === 429) {
    const payload = getRateLimitPayload(e)
    const cooldownSeconds = payload?.cooldownSeconds ?? parseCount(rawMessage, /Please wait (\d+)s\b/)
    if (cooldownSeconds !== undefined) {
      return { title: t('apiError.cooldownTitle'), description: t('apiError.cooldownDesc', { count: cooldownSeconds }) }
    }
    const limit = payload?.limit ?? parseCount(rawMessage, /limit reached \((\d+)\)/i)
    if (limit !== undefined) {
      return { title: t('apiError.limitTitle'), description: t('apiError.limitDesc', { limit }) }
    }
    return { title: t('apiError.rateLimitTitle'), description: t('apiError.rateLimitDesc') }
  }

  const byStatus: Record<number, FriendlyApiError> = {
    400: { title: t('apiError.badRequestTitle'), description: t('apiError.badRequestDesc') },
    401: { title: t('apiError.sessionTitle'), description: t('apiError.sessionDesc') },
    403: { title: t('apiError.forbiddenTitle'), description: t('apiError.forbiddenDesc') },
    404: { title: t('apiError.notFoundTitle'), description: t('apiError.notFoundDesc') },
    408: { title: t('apiError.timeoutTitle'), description: t('apiError.timeoutDesc') },
    409: { title: t('apiError.conflictTitle'), description: t('apiError.conflictDesc') },
    413: { title: t('apiError.tooLargeTitle'), description: t('apiError.tooLargeDesc') },
    422: { title: t('apiError.invalidTitle'), description: t('apiError.invalidDesc') },
    500: { title: t('apiError.serverTitle'), description: t('apiError.serverDesc') },
    502: { title: t('apiError.upstreamTitle'), description: t('apiError.upstreamDesc') },
    503: { title: t('apiError.unavailableTitle'), description: t('apiError.unavailableDesc') },
    504: { title: t('apiError.timeoutTitle'), description: t('apiError.timeoutDesc') }
  }

  const mapped = byStatus[status]
  if (mapped !== undefined) {
    if (safeMessage === undefined && rawMessage !== undefined && rawMessage.length > 0) {
      console.debug('[api-error] filtered server message:', rawMessage)
    }
    return { title: mapped.title, description: safeMessage ?? mapped.description }
  }

  if (status >= 400 && status < 500) {
    return { title: t('apiError.client4xxTitle'), description: t('apiError.client4xxDesc', { code: status }) }
  }
  return { title: t('apiError.server5xxTitle'), description: t('apiError.server5xxDesc', { code: status }) }
}
