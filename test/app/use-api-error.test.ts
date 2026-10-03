import { describe, expect, it, vi } from 'vitest'
import { describeApiError, getApiStatusCode, isSafeServerMessage, mapApiError } from '~/composables/useApiError'

// The composable debug-logs raw errors; keep test output clean.
vi.spyOn(console, 'debug').mockImplementation(() => {})

// Records the key (and params) instead of translating, so tests can assert
// exactly which i18n key the mapping produced.
function fakeT() {
  return (key: string, params?: number | Record<string, unknown>) => `${key}(${params === undefined ? '' : JSON.stringify(params)})`
}

// Mimics the shape of an ofetch FetchError wrapping an h3 createError body.
function ofetchError(statusCode: number, statusMessage?: string, bodyData?: Record<string, unknown>) {
  return {
    name: 'FetchError',
    status: statusCode,
    statusCode,
    statusMessage,
    data: { statusCode, statusMessage, data: bodyData }
  }
}

describe('describeApiError', () => {
  it.each([
    [400, 'apiError.badRequestTitle', 'apiError.badRequestDesc'],
    [401, 'apiError.sessionTitle', 'apiError.sessionDesc'],
    [403, 'apiError.forbiddenTitle', 'apiError.forbiddenDesc'],
    [404, 'apiError.notFoundTitle', 'apiError.notFoundDesc'],
    [408, 'apiError.timeoutTitle', 'apiError.timeoutDesc'],
    [409, 'apiError.conflictTitle', 'apiError.conflictDesc'],
    [413, 'apiError.tooLargeTitle', 'apiError.tooLargeDesc'],
    [422, 'apiError.invalidTitle', 'apiError.invalidDesc'],
    [500, 'apiError.serverTitle', 'apiError.serverDesc'],
    [502, 'apiError.upstreamTitle', 'apiError.upstreamDesc'],
    [503, 'apiError.unavailableTitle', 'apiError.unavailableDesc'],
    [504, 'apiError.timeoutTitle', 'apiError.timeoutDesc']
  ] as Array<[number, string, string]>)(
    'maps HTTP %i to the %s pair',
    (status, titleKey, descKey) => {
      const result = describeApiError(ofetchError(status), fakeT())
      expect(result).toEqual({ title: `${titleKey}()`, description: `${descKey}()` })
    }
  )

  it('falls back to the 4xx catch-all for unmapped client errors', () => {
    const result = describeApiError(ofetchError(418), fakeT())
    expect(result).toEqual({ title: 'apiError.client4xxTitle()', description: 'apiError.client4xxDesc({"code":418})' })
  })

  it('falls back to the 5xx catch-all for unmapped server errors', () => {
    const result = describeApiError(ofetchError(599), fakeT())
    expect(result).toEqual({ title: 'apiError.server5xxTitle()', description: 'apiError.server5xxDesc({"code":599})' })
  })

  it('uses a safe server statusMessage verbatim as the description', () => {
    const result = describeApiError(ofetchError(500, 'The torrent file is corrupted'), fakeT())
    expect(result.title).toBe('apiError.serverTitle()')
    expect(result.description).toBe('The torrent file is corrupted')
  })

  it.each([
    ['Prowlarr request failed: 401', 'prowlarr'],
    ['See https://example.com for details', 'url'],
    ['Line `broken` here', 'backtick'],
    ['First line\nsecond line', 'newline'],
    ['token expired', 'token'],
    ['Your api-key was rejected', 'api-key'],
    ['at handleRequest (api.ts:12:5)', 'stack frame'],
    ['a'.repeat(141), 'too long']
  ] as Array<[string, string]>)(
    'filters unsafe server messages (%s)',
    (message) => {
      const result = describeApiError(ofetchError(502, message), fakeT())
      expect(result.description).toBe('apiError.upstreamDesc()')
      expect(result.description).not.toContain(message)
    }
  )

  it('never leaks service names from the raw message into the description', () => {
    const result = describeApiError(ofetchError(500, 'qbittorrent responded with a bad secret'), fakeT())
    expect(result.description.toLowerCase()).not.toContain('qbittorrent')
    expect(result.description.toLowerCase()).not.toContain('secret')
  })

  describe('429 rate limiting', () => {
    it('uses structured cooldown data', () => {
      const result = describeApiError(
        ofetchError(429, 'Too many requests', { code: 'cooldown', cooldownSeconds: 90 }),
        fakeT()
      )
      expect(result).toEqual({ title: 'apiError.cooldownTitle()', description: 'apiError.cooldownDesc({"count":90})' })
    })

    it('uses structured limit data for active-limit', () => {
      const result = describeApiError(ofetchError(429, 'Too many requests', { code: 'active-limit', limit: 5 }), fakeT())
      expect(result).toEqual({ title: 'apiError.limitTitle()', description: 'apiError.limitDesc({"limit":5})' })
    })

    it('uses structured limit data for daily-limit', () => {
      const result = describeApiError(
        ofetchError(429, 'Daily limit reached', { code: 'daily-limit', limit: 10 }),
        fakeT()
      )
      expect(result).toEqual({ title: 'apiError.limitTitle()', description: 'apiError.limitDesc({"limit":10})' })
    })

    it('parses the cooldown from the message when there is no structured data', () => {
      const result = describeApiError(ofetchError(429, 'Please wait 45s before the next download'), fakeT())
      expect(result).toEqual({ title: 'apiError.cooldownTitle()', description: 'apiError.cooldownDesc({"count":45})' })
    })

    it('parses the limit from the message when there is no structured data', () => {
      const result = describeApiError(ofetchError(429, 'Daily download limit reached (10)'), fakeT())
      expect(result).toEqual({ title: 'apiError.limitTitle()', description: 'apiError.limitDesc({"limit":10})' })
    })

    it('falls back to the generic rate-limit message when nothing is parseable', () => {
      const result = describeApiError(ofetchError(429, 'Rate limit exceeded'), fakeT())
      expect(result).toEqual({ title: 'apiError.rateLimitTitle()', description: 'apiError.rateLimitDesc()' })
      // A 429 must never fall back to the raw server text
      expect(result.description).not.toBe('Rate limit exceeded')
    })
  })

  it.each([
    ['Failed to fetch'],
    ['NetworkError when attempting to fetch resource.'],
    ['Load failed'],
    ['Connection timed out']
  ])('maps network-like errors without a status code (%s)', (message) => {
    const result = describeApiError(new Error(message), fakeT())
    expect(result).toEqual({ title: 'apiError.networkTitle()', description: 'apiError.networkDesc()' })
  })

  it('maps AbortError to the cancelled pair', () => {
    const error = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
    const result = describeApiError(error, fakeT())
    expect(result).toEqual({ title: 'apiError.abortedTitle()', description: 'apiError.abortedDesc()' })
  })

  it.each([
    ['a plain string', 'boom'],
    ['undefined', undefined],
    ['null', null],
    ['an unknown object', { weird: true }],
    ['a number', 42]
  ] as Array<[string, unknown]>)(
    'maps %s to the generic pair',
    (_, thrown) => {
      const result = describeApiError(thrown, fakeT())
      expect(result).toEqual({ title: 'apiError.genericTitle()', description: 'apiError.genericDesc()' })
    }
  )
})

describe('getApiStatusCode', () => {
  it('reads the nested body status first', () => {
    expect(getApiStatusCode(ofetchError(429, 'x'))).toBe(429)
  })

  it('falls back to the top-level status field', () => {
    expect(getApiStatusCode({ status: 404 })).toBe(404)
  })

  it('returns undefined for non-error values', () => {
    expect(getApiStatusCode(new Error('nope'))).toBeUndefined()
    expect(getApiStatusCode('nope')).toBeUndefined()
    expect(getApiStatusCode(null)).toBeUndefined()
  })
})

describe('mapApiError', () => {
  it('keeps only string/number fields', () => {
    const mapped = mapApiError({ statusMessage: 123, statusCode: '400', status: 500 })
    expect(mapped.statusMessage).toBeUndefined()
    expect(mapped.statusCode).toBeUndefined()
    expect(mapped.status).toBe(500)
  })

  it('returns an empty object for primitives', () => {
    expect(mapApiError('x')).toEqual({})
    expect(mapApiError(null)).toEqual({})
    expect(mapApiError(undefined)).toEqual({})
  })
})

describe('isSafeServerMessage', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['   ', undefined]
  ] as Array<[string | undefined, string | undefined]>)(
    'rejects missing or empty input',
    (input, expected) => {
      expect(isSafeServerMessage(input)).toBe(expected)
    }
  )

  it('accepts a short plain message', () => {
    expect(isSafeServerMessage('Looks good')).toBe('Looks good')
  })

  it('accepts a message of exactly 140 characters', () => {
    const message = 'a'.repeat(140)
    expect(isSafeServerMessage(message)).toBe(message)
  })

  it('rejects a message of 141 characters', () => {
    expect(isSafeServerMessage('a'.repeat(141))).toBeUndefined()
  })

  it.each([
    'Check https://example.com/x',
    'use `backticks` carefully',
    'line one\nline two',
    'prowlarr is unreachable',
    'qbittorrent api key invalid',
    'flaresolverr token missing',
    'jellyfin secret rotated',
    'tmdb indexer api-key rejected',
    'at foo (bar.ts:1:1)',
    'see src/x.ts:12 for details'
  ])('rejects unsafe content: %s', (message) => {
    expect(isSafeServerMessage(message)).toBeUndefined()
  })
})
