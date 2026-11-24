import { cacheGet, cacheSet, CACHE_TTL } from './cache'
import { customTrackers } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { decryptAES } from '#server/utils/crypto'
import { performTrackerLogin } from '#server/utils/tracker-auth'
import { createLogger } from '#server/utils/logger'
import { useDbAsync, dbGet, dbAll } from '#server/utils/db'
import type {
  ProwlarrResult,
  ProwlarrRelease,
  ProwlarrProgressCallback,
  TrackerType,
  TrackerCookieConfig
} from '#server/types/prowlarr'

const log = createLogger('Prowlarr')

export const POLISH_TRACKERS: readonly string[] = ['Devil-Torrents', 'Polskie-Torrenty']

export const PROWLARR_CATEGORIES = {
  MOVIES: 2000,
  TV: 5000,
  MUSIC: 3000,
  BOOKS: 7000
} as const

export async function getTrackerType(indexer: string): Promise<TrackerType | null> {
  if (POLISH_TRACKERS.includes(indexer)) return 'guid'
  const db = await useDbAsync()
  const row = await dbGet(db.select().from(customTrackers).where(eq(customTrackers.indexerName, indexer)))
  if (row === undefined) return null
  return row.trackerType as TrackerType
}

export async function getTrackerCookieConfig(
  indexer: string,
  config: Record<string, unknown>
): Promise<TrackerCookieConfig | null> {
  const db = await useDbAsync()
  const row = await dbGet(db.select().from(customTrackers).where(eq(customTrackers.indexerName, indexer)))

  if (row !== undefined) {
    if (row.trackerType === 'counting') {
      return { enabled: row.enabled, cookie: '' }
    }
    if (
      row.loginUrl !== null &&
      row.loginUrl.length > 0 &&
      row.loginUsername !== null &&
      row.loginUsername.length > 0 &&
      row.loginPassword !== null &&
      row.loginPassword.length > 0
    ) {
      try {
        const password = decryptAES(row.loginPassword)
        const cookie = await performTrackerLogin(row.loginUrl, row.loginUsername, password)
        return { enabled: row.enabled, cookie }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.error(`Auto-login failed for ${indexer}: ${msg}`)
        throw new Error(`Auto-login failed for ${indexer}: ${msg}`, { cause: err })
      }
    }
    return { enabled: row.enabled, cookie: row.cookie }
  }

  if (indexer === 'Devil-Torrents') {
    return {
      enabled: config.trackerDevilEnabled !== false,
      cookie: (config.trackerDevilCookie as string) ?? ''
    }
  }
  if (indexer === 'Polskie-Torrenty') {
    return {
      enabled: config.trackerPolskieEnabled !== false,
      cookie: (config.trackerPolskieCookie as string) ?? ''
    }
  }
  return null
}

export async function isPrivateTracker(indexer: string): Promise<boolean> {
  if (POLISH_TRACKERS.includes(indexer)) return true
  const db = await useDbAsync()
  const row = await dbGet(db.select().from(customTrackers).where(eq(customTrackers.indexerName, indexer)))
  return row !== undefined && row.enabled
}

export async function getEnabledCustomTrackerNames(): Promise<string[]> {
  const db = await useDbAsync()
  const rows = await dbAll(db.select().from(customTrackers).where(eq(customTrackers.enabled, true)))
  return rows.map((r) => r.indexerName)
}

async function normalizeResult(item: ProwlarrRelease): Promise<ProwlarrResult> {
  return {
    title: item.title,
    indexer: item.indexer,
    size: item.size,
    seeders: item.seeders ?? 0,
    leechers: item.leechers ?? 0,
    magnetLink: item.magnetUrl ?? null,
    downloadUrl: item.downloadUrl ?? null,
    guid: item.guid ?? null,
    publishDate: item.publishDate,
    categories: item.categories ?? [],
    infoUrl: item.infoUrl ?? '',
    imdbId: item.imdbId ?? null,
    isPrivate: await isPrivateTracker(item.indexer)
  }
}

function hasDownloadMethod(item: ProwlarrRelease, customTrackerNames: string[]): boolean {
  return (
    item.magnetUrl !== null ||
    item.downloadUrl !== null ||
    POLISH_TRACKERS.includes(item.indexer) ||
    customTrackerNames.includes(item.indexer)
  )
}

function deduplicateResults(results: ProwlarrResult[]): ProwlarrResult[] {
  const byUrl = new Map<string, ProwlarrResult[]>()
  for (const r of results) {
    if (r.downloadUrl === null) continue
    const group = byUrl.get(r.downloadUrl)
    if (group !== undefined) {
      group.push(r)
    } else {
      byUrl.set(r.downloadUrl, [r])
    }
  }

  const urlDeduped: ProwlarrResult[] = []
  for (const group of byUrl.values()) {
    group.sort((a, b) => b.seeders - a.seeders)
    const best = group[0]
    if (best !== undefined) urlDeduped.push(best)
  }

  const noUrl = results.filter((r) => r.downloadUrl === null)
  const combined = [...urlDeduped, ...noUrl]

  const byTitleSize = new Map<string, ProwlarrResult[]>()
  for (const r of combined) {
    const key = `${r.title.toLowerCase()}:${r.size}`
    const group = byTitleSize.get(key)
    if (group !== undefined) {
      group.push(r)
    } else {
      byTitleSize.set(key, [r])
    }
  }

  const deduplicated: ProwlarrResult[] = []
  for (const group of byTitleSize.values()) {
    if (group.length === 1) {
      const first = group[0]
      if (first !== undefined) deduplicated.push(first)
      continue
    }

    group.sort((a, b) => {
      const aMagnet = a.magnetLink !== null ? 1 : 0
      const bMagnet = b.magnetLink !== null ? 1 : 0
      if (aMagnet !== bMagnet) return bMagnet - aMagnet
      return b.seeders - a.seeders
    })

    const best = group[0]
    if (best !== undefined) deduplicated.push(best)
  }

  return deduplicated
}

// Generous safety bound on text queries for one search. Each TMDB title gets
// its own tier and every tier is fired - cutting the ladder at four queries
// used to drop all alternative titles, which is exactly where localized and
// scene releases often live. The IMDB branch adds at most one more request.
const MAX_SEARCH_QUERIES = 12

// Whole-ladder wall clock budget. One request may take up to 45s; with three
// concurrent slots, 12 queries could otherwise keep a search alive for three
// minutes - far past the client's 60s stale watchdog. Queries still queued
// when this budget is gone emit a `skipped` event instead of firing.
const MAX_LADDER_WALL_MS = 50_000

// Max concurrent in-flight requests to Prowlarr, shared across ladders from
// parallel users. Prowlarr's own HTTP API has no documented client rate
// limit; the 429s it can return come from the indexers behind it (each
// indexer has its own "Query Limit" in Prowlarr's settings). Keep this low
// so a burst of searches stays gentle on those indexers.
const PROWLARR_MAX_CONCURRENT = 3

// Backoff for a Prowlarr 429 when no usable Retry-After header is present.
const RATE_LIMIT_BACKOFF_MS = 2000

// A single Prowlarr search fans out to every enabled indexer inside Prowlarr,
// so one sick tracker can hold the whole response open. Each request gets its
// own deadline; aborting it cuts that slice while the rest of the ladder keeps
// merging. Kept below the client-side stale watchdog (60s) so a timeout event
// always reaches the UI before it can fail the whole search.
const PROWLARR_QUERY_TIMEOUT_MS = 45_000

export class ProwlarrTimeoutError extends Error {}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
}

// Resolves (rather than rejects) on abort so callers can turn it into the same
// ProwlarrTimeoutError a timed-out fetch produces, and never reach the retry.
function waitForAbortOrTimeout(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
    }
  })
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const name of names) {
    const trimmed = name.trim()
    if (trimmed.length === 0) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

// One tier per name, most specific query first. The bare-name tier is what
// catches releases the specific queries miss (localized "Sezon 01" naming,
// missing year, alternate titles) - season/episode filtering happens later in
// the browse endpoints.
//
// TV season queries deliberately omit the year. TMDB's `first_air_date` year
// is the year of the *pilot*, so "Show S05 2019" finds nothing for a 2025
// season while the release itself is named just "Show.S05E03". The year is
// only useful for movies, where it disambiguates remakes.
function buildNameTiers(names: string[], seasonPad: string | null, year: string): string[][] {
  const tiers: string[][] = []
  for (const name of names) {
    const tier = seasonPad !== null ? [`${name} S${seasonPad}`.trim(), name] : [`${name} ${year}`.trim(), name]
    tiers.push(uniqueNames(tier))
  }
  return tiers
}

// Flattens the per-title tiers in relevance order. No query is dropped just
// because an earlier one returned results - a different indexer may hold a
// release that only that specific query finds. The only cut is the safety cap.
function selectLadderQueries(tiers: string[][]): string[] {
  return tiers.flat().slice(0, MAX_SEARCH_QUERIES)
}

// Bounds concurrent in-flight requests. A released slot is transferred
// directly to the next waiter (no re-increment), so `active` never exceeds
// `max` even when a waiter is woken.
class SlotLimiter {
  private active = 0
  private waiting: Array<() => void> = []

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve)
      })
      return
    }
    this.active += 1
  }

  release(): void {
    const next = this.waiting.shift()
    if (next !== undefined) {
      next()
      return
    }
    this.active -= 1
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

export class ProwlarrClient {
  private baseUrl: string
  private apiKey: string
  private readonly limiter = new SlotLimiter(PROWLARR_MAX_CONCURRENT)
  private readonly queryTimeoutMs: number
  private readonly ladderTimeoutMs: number

  constructor(
    baseUrl: string,
    apiKey: string,
    queryTimeoutMs: number = PROWLARR_QUERY_TIMEOUT_MS,
    ladderTimeoutMs: number = MAX_LADDER_WALL_MS
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey
    this.queryTimeoutMs = queryTimeoutMs
    this.ladderTimeoutMs = ladderTimeoutMs
  }

  private async request(
    path: string,
    params: Record<string, string> = {},
    timeoutMs: number = this.queryTimeoutMs
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`)
    url.searchParams.set('apikey', this.apiKey)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }

    // One deadline per request, covering the 429 backoff and retry as well
    const startedAt = Date.now()
    const signal = AbortSignal.timeout(timeoutMs)
    let response = await this.fetchWithTimeout(url.toString(), signal, timeoutMs)
    if (response.status === 429) {
      // Back off before one retry - indexers behind Prowlarr rate-limit hard,
      // and hammering a 429 only lengthens the cooldown. Honor Retry-After
      // (seconds) when present, otherwise use a fixed delay. A large header
      // must not hold the slot past the request deadline or ignore an abort.
      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfter = retryAfterHeader !== null ? Number(retryAfterHeader) : NaN
      const requestedDelayMs =
        Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : RATE_LIMIT_BACKOFF_MS
      const remainingMs = Math.max(0, startedAt + timeoutMs - Date.now())
      const delayMs = Math.min(requestedDelayMs, remainingMs)
      log.warn(`Prowlarr returned 429, backing off ${delayMs}ms before one retry`)
      await waitForAbortOrTimeout(delayMs, signal)
      if (signal.aborted) {
        throw new ProwlarrTimeoutError(`Prowlarr request timed out after ${timeoutMs}ms`)
      }
      response = await this.fetchWithTimeout(url.toString(), signal, timeoutMs)
    }
    if (!response.ok) {
      throw new Error(`Prowlarr API error ${response.status}`)
    }
    return response.json()
  }

  private async fetchWithTimeout(url: string, signal: AbortSignal, timeoutMs: number): Promise<Response> {
    try {
      return await fetch(url, { signal })
    } catch (err) {
      if (isAbortError(err)) {
        throw new ProwlarrTimeoutError(`Prowlarr request timed out after ${timeoutMs}ms`)
      }
      throw err
    }
  }

  async searchByImdb(imdbId: string, mediaType: 'movie' | 'tv', categories?: number[]): Promise<ProwlarrResult[]> {
    const cacheKey = `prowlarr:imdb:${mediaType}:${imdbId}:${categories?.join(',') ?? 'all'}`
    const cached = await cacheGet<ProwlarrResult[]>(cacheKey)
    if (cached !== null) return cached

    const type = mediaType === 'movie' ? 'movie' : 'tvsearch'
    const params: Record<string, string> = { type, query: `{imdbid:${imdbId}}` }
    if (categories !== undefined && categories.length > 0) {
      params.categories = categories.join(',')
    }
    const raw = (await this.limiter.run(() => this.request('/api/v1/search', params))) as ProwlarrRelease[]

    const customNames = await getEnabledCustomTrackerNames()
    const results = deduplicateResults(
      await Promise.all((raw ?? []).filter((item) => hasDownloadMethod(item, customNames)).map(normalizeResult))
    )

    // Don't cache empty results - a transient indexer hiccup must not lock the
    // IMDB branch out for the whole TTL
    if (results.length > 0) {
      await cacheSet(cacheKey, results, CACHE_TTL.PROWLARR_RESULTS)
    }
    return results
  }

  async searchMovie(
    title: string,
    originalTitle: string,
    altTitles: string[],
    year: string,
    categories?: number[],
    onProgress?: ProwlarrProgressCallback,
    imdbId?: string | null
  ): Promise<ProwlarrResult[]> {
    const names = uniqueNames([title, originalTitle, ...altTitles])
    const textResults = this.runQueryLadder(buildNameTiers(names, null, year), categories, onProgress)

    // The text ladder covers the private trackers whose releases carry no
    // IMDb ID. Public indexers answer an IMDb movie search much more
    // precisely, so run both in parallel and merge.
    if (imdbId !== null && imdbId !== undefined && imdbId.length > 0) {
      const imdbResults = await this.searchByImdb(imdbId, 'movie', categories).then(
        (results) => {
          onProgress?.({ kind: 'imdb', results: results.length })
          return results
        },
        (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          log.warn(`searchMovie: IMDB search failed: ${msg}`)
          onProgress?.({ kind: 'imdb', results: 0 })
          return [] as ProwlarrResult[]
        }
      )
      const text = await textResults
      return deduplicateResults([...text, ...imdbResults])
    }

    return textResults
  }

  async searchByQuery(query: string, categories?: number[], timeoutMs?: number): Promise<ProwlarrResult[]> {
    const catsKey = categories?.join(',') ?? 'all'
    const cacheKey = `prowlarr:query:${query}:${catsKey}`
    const cached = await cacheGet<ProwlarrResult[]>(cacheKey)
    if (cached !== null) return cached

    const params: Record<string, string> = { type: 'search', query }
    if (categories !== undefined && categories.length > 0) {
      params.categories = categories.join(',')
    }
    const raw = (await this.request('/api/v1/search', params, timeoutMs)) as ProwlarrRelease[]

    const customNames = await getEnabledCustomTrackerNames()
    const rawItems = raw ?? []
    const downloadable = rawItems.filter((item) => hasDownloadMethod(item, customNames))
    const filtered = rawItems.length - downloadable.length
    if (filtered > 0) {
      log.info(`searchByQuery: ${filtered}/${rawItems.length} results filtered (no download method)`)
    }

    const results = deduplicateResults(await Promise.all(downloadable.map(normalizeResult)))

    // Don't cache empty results - retry on next request
    if (results.length > 0) {
      await cacheSet(cacheKey, results, CACHE_TTL.PROWLARR_RESULTS)
    }
    return results
  }

  // Runs the query ladder in PARALLEL and MERGES every result set instead of
  // stopping at the first non-empty one - a sparse first hit (e.g. a single
  // weak episode release) must not hide a full season pack that a broader
  // query finds. Every query in the capped ladder is fired: an early "healthy"
  // set of five results used to skip the bare-name query, which hid brand new
  // episodes whose release names carry no year. The ladder is capped and
  // bounded by a wall-clock budget plus the shared request limiter, so one
  // missing show cannot turn a page load into a query storm. A failing query
  // is logged and dropped instead of failing the whole search.
  private async runQueryLadder(
    tiers: string[][],
    categories?: number[],
    onProgress?: ProwlarrProgressCallback
  ): Promise<ProwlarrResult[]> {
    const queries = selectLadderQueries(tiers)
    const total = queries.length
    const startedAt = Date.now()
    const deadline = startedAt + this.ladderTimeoutMs

    const merged: ProwlarrResult[] = []
    let fired = 0

    onProgress?.({ kind: 'start', queries: total })

    await Promise.all(
      queries.map(async (query, qi) => {
        const index = qi + 1
        await this.limiter.acquire()
        try {
          const remaining = deadline - Date.now()
          if (remaining <= 0) {
            log.warn(`search: "${query}" skipped - ladder budget exhausted`)
            onProgress?.({ kind: 'query', state: 'skipped', index, total, text: query })
            return
          }
          // A slow indexer must not push the whole ladder past the client's
          // stale watchdog, so each request gets what is left of the budget.
          const timeoutMs = Math.min(this.queryTimeoutMs, remaining)
          fired += 1
          log.info(`search: "${query}"`)
          onProgress?.({ kind: 'query', state: 'start', index, total, text: query })
          try {
            const results = await this.searchByQuery(query, categories, timeoutMs)
            log.info(`search: "${query}" -> ${results.length} results`)
            onProgress?.({ kind: 'query', state: 'done', index, total, text: query, results: results.length })
            merged.push(...results)
          } catch (err) {
            const reason = err instanceof ProwlarrTimeoutError ? 'timeout' : 'error'
            const msg = err instanceof Error ? err.message : String(err)
            log.warn(`search: "${query}" failed: ${msg}`)
            onProgress?.({ kind: 'query', state: 'failed', index, total, text: query, reason })
          }
        } finally {
          this.limiter.release()
        }
      })
    )

    log.info(`search: fired ${fired}/${total} queries in ${Date.now() - startedAt}ms, pool=${merged.length} results`)
    return deduplicateResults(merged)
  }

  async searchTv(
    showName: string,
    originalName: string,
    year: string,
    imdbId: string | null,
    seasonNumber: number | null,
    categories?: number[],
    altTitles: string[] = [],
    onProgress?: ProwlarrProgressCallback
  ): Promise<ProwlarrResult[]> {
    const seasonPad = seasonNumber !== null ? String(seasonNumber).padStart(2, '0') : null
    const nameKey = imdbId !== null && imdbId.length > 0 ? imdbId : `${showName}:${seasonPad ?? 'all'}`
    const catsKey = categories?.join(',') ?? 'all'
    const cacheKey = `prowlarr:tv:${nameKey}:${year}:${catsKey}`
    const cached = await cacheGet<ProwlarrResult[]>(cacheKey)
    if (cached !== null) return cached

    log.info(`searchTv: show="${showName}" season=${seasonPad ?? 'all'} year=${year} imdb=${imdbId ?? 'none'}`)

    // Run IMDB and text search in parallel
    const promises: Promise<ProwlarrResult[]>[] = []

    // 1. IMDB tvsearch - covers public trackers
    if (imdbId !== null && imdbId.length > 0) {
      promises.push(
        this.searchByImdb(imdbId, 'tv', categories).then(
          (results) => {
            onProgress?.({ kind: 'imdb', results: results.length })
            return results
          },
          (err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err)
            log.warn(`searchTv: IMDB search failed: ${msg}`)
            onProgress?.({ kind: 'imdb', results: 0 })
            return [] as ProwlarrResult[]
          }
        )
      )
    }

    // 2. Text search - covers private trackers
    promises.push(this.searchTvText(showName, originalName, altTitles, seasonPad, year, categories, onProgress))

    const settled = await Promise.all(promises)
    const hasImdb = imdbId !== null && imdbId.length > 0
    const imdbResults = hasImdb ? (settled[0] as ProwlarrResult[]) : ([] as ProwlarrResult[])
    const textResults = hasImdb ? (settled[1] as ProwlarrResult[]) : (settled[0] as ProwlarrResult[])

    log.info(`searchTv: IMDB=${imdbResults.length} text=${textResults.length} (before dedup)`)

    // Merge text results first (private trackers priority), then IMDB (public trackers)
    const combined = deduplicateResults([...textResults, ...imdbResults])

    log.info(`searchTv: combined=${combined.length} results`)

    if (combined.length === 0) {
      log.warn(`searchTv: ALL searches returned 0 results for "${showName}" season ${seasonPad ?? 'all'}`)
    }

    // Don't cache empty results
    if (combined.length > 0) {
      await cacheSet(cacheKey, combined, CACHE_TTL.PROWLARR_RESULTS)
    }
    return combined
  }

  private async searchTvText(
    showName: string,
    originalName: string,
    altTitles: string[],
    seasonPad: string | null,
    year: string,
    categories?: number[],
    onProgress?: ProwlarrProgressCallback
  ): Promise<ProwlarrResult[]> {
    // Ladder tiers in relevance order: localized name, original name, then
    // alternative titles. The bare-name tier of each also catches releases
    // the specific queries miss (localized "Sezon 01" naming, missing year).
    const names = uniqueNames([showName, originalName, ...altTitles])
    return this.runQueryLadder(buildNameTiers(names, seasonPad, year), categories, onProgress)
  }
}

let _client: ProwlarrClient | null = null

export function useProwlarr(): ProwlarrClient | null {
  const config = useRuntimeConfig()
  const url = config.prowlarrUrl as string
  const apiKey = config.prowlarrApiKey as string

  if (!url || !apiKey) return null

  if (_client === null) {
    _client = new ProwlarrClient(url, apiKey)
  }
  return _client
}
