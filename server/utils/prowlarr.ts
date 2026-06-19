import { cacheGet, cacheSet, CACHE_TTL } from './cache'
import { customTrackers } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { decryptAES } from '#server/utils/crypto'
import { performTrackerLogin } from '#server/utils/tracker-auth'
import { createLogger } from '#server/utils/logger'

const log = createLogger('Prowlarr')

export const POLISH_TRACKERS: readonly string[] = ['Devil-Torrents', 'Polskie-Torrenty']

interface TrackerCookieConfig {
  enabled: boolean
  cookie: string
}

export type TrackerType = 'guid' | 'counting'

export function getTrackerType(indexer: string): TrackerType | null {
  if (POLISH_TRACKERS.includes(indexer)) return 'guid'
  const db = useDb()
  const row = db.select().from(customTrackers).where(eq(customTrackers.indexerName, indexer)).get()
  if (row === undefined) return null
  return row.trackerType as TrackerType
}

export async function getTrackerCookieConfig(
  indexer: string,
  config: Record<string, unknown>
): Promise<TrackerCookieConfig | null> {
  const db = useDb()
  const row = db.select().from(customTrackers).where(eq(customTrackers.indexerName, indexer)).get()

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
        log.error(`[Prowlarr] Auto-login failed for ${indexer}: ${msg}`)
        return null
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

export function isPrivateTracker(indexer: string): boolean {
  if (POLISH_TRACKERS.includes(indexer)) return true
  const db = useDb()
  const row = db.select().from(customTrackers).where(eq(customTrackers.indexerName, indexer)).get()
  return row !== undefined && row.enabled
}

export function getEnabledCustomTrackerNames(): string[] {
  const db = useDb()
  const rows = db.select().from(customTrackers).where(eq(customTrackers.enabled, true)).all()
  return rows.map((r) => r.indexerName)
}

export interface ProwlarrResult {
  title: string
  indexer: string
  size: number
  seeders: number
  leechers: number
  magnetLink: string | null
  downloadUrl: string | null
  guid: string | null
  publishDate: string
  categories: number[]
  infoUrl: string
  imdbId: number | null
  isPrivate: boolean
}

interface ProwlarrRelease {
  title: string
  indexer: string
  size: number
  seeders: number | null
  leechers: number | null
  magnetUrl: string | null
  downloadUrl: string | null
  guid: string
  publishDate: string
  categories: number[]
  infoUrl: string
  imdbId: number
}

function normalizeResult(item: ProwlarrRelease): ProwlarrResult {
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
    isPrivate: isPrivateTracker(item.indexer)
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

export class ProwlarrClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey
  }

  private async request(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`)
    url.searchParams.set('apikey', this.apiKey)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }

    const response = await fetch(url.toString())
    if (!response.ok) {
      throw new Error(`Prowlarr API error ${response.status}`)
    }
    return response.json()
  }

  async searchByImdb(imdbId: string, mediaType: 'movie' | 'tv'): Promise<ProwlarrResult[]> {
    const cacheKey = `prowlarr:imdb:${mediaType}:${imdbId}`
    const cached = await cacheGet<ProwlarrResult[]>(cacheKey)
    if (cached !== null) return cached

    const type = mediaType === 'movie' ? 'movie' : 'tvsearch'
    const raw = (await this.request('/api/v1/search', {
      type,
      query: `{imdbid:${imdbId}}`
    })) as ProwlarrRelease[]

    const customNames = getEnabledCustomTrackerNames()
    const results = deduplicateResults(
      (raw ?? []).filter((item) => hasDownloadMethod(item, customNames)).map(normalizeResult)
    )

    await cacheSet(cacheKey, results, CACHE_TTL.PROWLARR_RESULTS)
    return results
  }

  async searchByQuery(query: string, locale = 'pl'): Promise<ProwlarrResult[]> {
    const cacheKey = `prowlarr:query:${query}:${locale}`
    const cached = await cacheGet<ProwlarrResult[]>(cacheKey)
    if (cached !== null) return cached

    const raw = (await this.request('/api/v1/search', {
      type: 'search',
      query
    })) as ProwlarrRelease[]

    const customNames = getEnabledCustomTrackerNames()
    const results = deduplicateResults(
      (raw ?? []).filter((item) => hasDownloadMethod(item, customNames)).map(normalizeResult)
    )

    await cacheSet(cacheKey, results, CACHE_TTL.PROWLARR_RESULTS)
    return results
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
