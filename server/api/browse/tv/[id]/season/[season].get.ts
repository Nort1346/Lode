import { getSeasonDetails, getTvShowDetails, getImageUrl } from '#server/utils/tmdb'
import { useProwlarr } from '#server/utils/prowlarr'
import { rankTorrents, formatSize } from '#server/utils/torrent-ranker'
import { checkDailyLimit } from '#server/utils/limits'
import { createLogger } from '#server/utils/logger'
import type { ProwlarrResult } from '#server/utils/prowlarr'

const log = createLogger('Season')

function episodeRangeMatches(title: string, seasonNumber: number, episodeNumber: number): boolean {
  const lower = title.toLowerCase()
  const seasonPad = String(seasonNumber).padStart(2, '0')
  const epPad = String(episodeNumber).padStart(2, '0')

  // SxxExx
  if (lower.includes(`s${seasonPad}e${epPad}`)) return true

  // NxMM (e.g. 4x01)
  if (lower.includes(`${seasonNumber}x${epPad}`)) return true

  // Range: S04E01-E03
  const rangeMatch = lower.match(/s(\d{2})e(\d{2})-e(\d{2})/)
  if (rangeMatch !== null) {
    const s = parseInt(rangeMatch[1] ?? '0', 10)
    const eStart = parseInt(rangeMatch[2] ?? '0', 10)
    const eEnd = parseInt(rangeMatch[3] ?? '0', 10)
    if (s === seasonNumber && episodeNumber >= eStart && episodeNumber <= eEnd) return true
  }

  // Polskie: Odc. 01, Odcinek 01, Odc 1
  const odcMatch = lower.match(/(?:odc(?:inek)?\.?\s*)(\d{1,2})/)
  if (odcMatch !== null && parseInt(odcMatch[1] ?? '0', 10) === episodeNumber) return true

  // Angielskie: Episode 01, Ep. 01, Ep01
  const epMatch = lower.match(/(?:ep(?:isode)?\.?\s*)(\d{1,2})/)
  if (epMatch !== null && parseInt(epMatch[1] ?? '0', 10) === episodeNumber) return true

  return false
}

function isSeasonPack(title: string, seasonNumber: number): boolean {
  const lower = title.toLowerCase()
  const seasonPad = String(seasonNumber).padStart(2, '0')

  // "S01" without single episode - but allow "S01E01-E10" (range = pack)
  const sMatch = lower.match(/s(\d{2})/)
  if (sMatch !== null && sMatch[1] === seasonPad) {
    // If it has "SxxExx" with a single episode number, it's NOT a season pack
    if (/s\d{2}e\d{2}(?!-)/.test(lower)) return false
    return true
  }

  // "Sezon 01" or "Sezon 01-02" (Polish format)
  const sezonMatch = lower.match(/sezon\s+(\d{1,2})/)
  if (sezonMatch !== null) {
    const startSeason = parseInt(sezonMatch[1] ?? '0', 10)
    if (startSeason === seasonNumber) return true
    // Handle ranges: "Sezon 01-02" → matches season 1 and 2
    const rangeMatch = lower.match(/sezon\s+(\d{1,2})\s*-\s*(\d{1,2})/)
    if (rangeMatch !== null) {
      const end = parseInt(rangeMatch[2] ?? '0', 10)
      if (seasonNumber >= startSeason && seasonNumber <= end) return true
    }
  }

  // "Season 1" or "Season 01"
  if (lower.includes(`season ${seasonNumber}`)) return true

  return false
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const showId = Number(getRouterParam(event, 'id'))
  const seasonNumber = Number(getRouterParam(event, 'season'))
  if (isNaN(showId) || isNaN(seasonNumber)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid show/season ID' })
  }

  const locale = (getQuery(event).locale as string | undefined) ?? 'pl'

  const limit = checkDailyLimit(session.user.id)
  if (limit.reached) {
    throw createError({
      statusCode: 429,
      data: { activeCount: limit.activeCount, todayCount: limit.todayCount, limit: limit.limit }
    })
  }

  let show, season
  try {
    show = await getTvShowDetails(showId, locale)
    season = await getSeasonDetails(showId, seasonNumber, locale)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch season details from TMDB' })
  }

  const year = show.first_air_date?.slice(0, 4) ?? ''

  let rawTorrents: ProwlarrResult[] = []
  const prowlarr = useProwlarr()
  if (prowlarr !== null) {
    try {
      const imdbId = show.external_ids?.imdb_id ?? null
      log.info(
        `[Season] Searching: show="${show.name}" original="${show.original_name}" season=${seasonNumber} imdb=${imdbId ?? 'none'}`
      )
      rawTorrents = await prowlarr.searchTv(show.name, show.original_name, year, imdbId, seasonNumber, locale)
      if (rawTorrents.length === 0 && show.original_name !== show.name) {
        log.info(`[Season] Retrying with original name: "${show.original_name}"`)
        rawTorrents = await prowlarr.searchTv(show.original_name, show.name, year, imdbId, seasonNumber, locale)
      }
      log.info(`[Season] Prowlarr returned ${rawTorrents.length} results`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error(`[Season] Prowlarr search failed: ${msg}`)
    }
  } else {
    log.warn(`[Season] Prowlarr not configured`)
  }

  const episodes = (season.episodes ?? []).map((ep) => {
    const episodeTorrents = rawTorrents.filter((t) => episodeRangeMatches(t.title, seasonNumber, ep.episode_number))
    if (episodeTorrents.length > 0) {
      log.info(`[Season] Episode ${ep.episode_number}: ${episodeTorrents.length} torrents matched`)
    }
    const ranked = rankTorrents(episodeTorrents, 'series', show.name, year)

    return {
      id: ep.id,
      episodeNumber: ep.episode_number,
      name: ep.name,
      overview: ep.overview,
      stillUrl: getImageUrl(ep.still_path, 'w300'),
      airDate: ep.air_date,
      rating: ep.vote_average,
      runtime: ep.runtime,
      torrents: ranked.map((t) => ({
        title: t.title,
        size: t.size,
        sizeFormatted: formatSize(t.size),
        seeders: t.seeders,
        leechers: t.leechers,
        indexer: t.indexer,
        magnetLink: t.magnetLink,
        downloadUrl: t.downloadUrl,
        guid: t.guid,
        score: t.score,
        percentage: t.percentage,
        recommended: t.recommended,
        resolution: t.parsed.resolution,
        source: t.parsed.source,
        language: t.parsed.language,
        isPrivate: t.isPrivate
      }))
    }
  })

  const seasonPackTorrents = rawTorrents.filter((t) => isSeasonPack(t.title, seasonNumber))
  if (seasonPackTorrents.length > 0) {
    log.info(`[Season] Season packs: ${seasonPackTorrents.length} found`)
  }

  const seasonPacks = rankTorrents(seasonPackTorrents, 'series', show.name, year).map((t) => ({
    title: t.title,
    size: t.size,
    sizeFormatted: formatSize(t.size),
    seeders: t.seeders,
    leechers: t.leechers,
    indexer: t.indexer,
    magnetLink: t.magnetLink,
    downloadUrl: t.downloadUrl,
    guid: t.guid,
    score: t.score,
    percentage: t.percentage,
    recommended: t.recommended,
    resolution: t.parsed.resolution,
    source: t.parsed.source,
    language: t.parsed.language,
    isSeasonPack: true,
    isPrivate: t.isPrivate
  }))

  return {
    show: {
      id: show.id,
      name: show.name
    },
    season: {
      seasonNumber: season.season_number,
      name: season.name,
      overview: season.overview,
      posterUrl: getImageUrl(season.poster_path),
      airDate: season.air_date
    },
    episodes,
    seasonPacks
  }
})
