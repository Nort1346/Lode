import { cacheGet, cacheSet, CACHE_TTL } from './cache'

export const POLISH_TRACKERS: readonly string[] = ['Devil-Torrents', 'Polskie-Torrenty']

interface TrackerCookieConfig {
  enabled: boolean
  cookie: string
}

export function getTrackerCookieConfig(indexer: string, config: Record<string, unknown>): TrackerCookieConfig | null {
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
    imdbId: item.imdbId ?? null
  }
}

function hasDownloadMethod(item: ProwlarrRelease): boolean {
  return item.magnetUrl !== null || item.downloadUrl !== null || POLISH_TRACKERS.includes(item.indexer)
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

    const devilTorrent = raw.find((item) => item.indexer === 'Devil-Torrents')
    if (devilTorrent !== undefined) {
      console.log('[Prowlarr IMDB] Devil-Torrents result:', JSON.stringify(devilTorrent, null, 2))
    }

    const polishTorrent = raw.find((item) => item.indexer === 'Polskie-Torrenty')
    if (polishTorrent !== undefined) {
      console.log('[Prowlarr IMDB] Polskie-Torrenty result:', JSON.stringify(polishTorrent, null, 2))
    }

    const results = (raw ?? []).filter(hasDownloadMethod).map(normalizeResult)

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

    const devilTorrent = raw.find((item) => item.indexer === 'Devil-Torrents')
    if (devilTorrent !== undefined) {
      console.log('[Prowlarr Query] Devil-Torrents result:', JSON.stringify(devilTorrent, null, 2))
    }

    const polishTorrent = raw.find((item) => item.indexer === 'Polskie-Torrenty')
    if (polishTorrent !== undefined) {
      console.log('[Prowlarr Query] Polskie-Torrenty result:', JSON.stringify(polishTorrent, null, 2))
    }

    const results = (raw ?? []).filter(hasDownloadMethod).map(normalizeResult)

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
