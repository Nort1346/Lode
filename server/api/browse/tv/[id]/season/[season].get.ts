import { getSeasonDetails, getTvShowDetails, getImageUrl } from '../../../../../utils/tmdb'
import { useProwlarr } from '../../../../../utils/prowlarr'
import { rankTorrents, formatSize, parseTorrentTitle } from '../../../../../utils/torrent-ranker'
import type { ProwlarrResult } from '../../../../../utils/prowlarr'

function episodeRangeMatches(title: string, seasonNumber: number, episodeNumber: number): boolean {
  const lower = title.toLowerCase()
  const seasonPad = String(seasonNumber).padStart(2, '0')
  const epPad = String(episodeNumber).padStart(2, '0')

  if (lower.includes(`s${seasonPad}e${epPad}`)) return true
  if (lower.includes(`s${seasonPad}e${epPad}-`)) return true
  if (lower.includes(`${seasonNumber}x${epPad}`)) return true

  const rangeMatch = lower.match(/s(\d{2})e(\d{2})-e(\d{2})/)
  if (rangeMatch !== null) {
    const s = parseInt(rangeMatch[1] ?? '0', 10)
    const eStart = parseInt(rangeMatch[2] ?? '0', 10)
    const eEnd = parseInt(rangeMatch[3] ?? '0', 10)
    if (s === seasonNumber && episodeNumber >= eStart && episodeNumber <= eEnd) return true
  }

  return false
}

function isSeasonPack(title: string, seasonNumber: number): boolean {
  const lower = title.toLowerCase()
  const seasonPad = String(seasonNumber).padStart(2, '0')
  if (lower.includes(`s${seasonPad}`) && !lower.includes('e0')) return true
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

  let show, season
  try {
    show = await getTvShowDetails(showId, locale)
    season = await getSeasonDetails(showId, seasonNumber, locale)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch season details from TMDB' })
  }

  let rawTorrents: ProwlarrResult[] = []
  const prowlarr = useProwlarr()
  if (prowlarr !== null) {
    try {
      rawTorrents = await prowlarr.searchByQuery(show.name, locale)
      if (rawTorrents.length === 0 && show.original_name !== show.name) {
        rawTorrents = await prowlarr.searchByQuery(show.original_name, locale)
      }
    } catch {
      // Prowlarr might be offline
    }
  }

  const episodes = (season.episodes ?? []).map((ep) => {
    const episodeTorrents = rawTorrents.filter((t) => episodeRangeMatches(t.title, seasonNumber, ep.episode_number))
    const ranked = rankTorrents(episodeTorrents, 'series')

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
        recommended: t.recommended,
        resolution: t.parsed.resolution,
        source: t.parsed.source,
        language: t.parsed.language
      }))
    }
  })

  const seasonPacks = rawTorrents
    .filter((t) => isSeasonPack(t.title, seasonNumber))
    .map((t) => {
      const parsed = parseTorrentTitle(t.title)
      return {
        title: t.title,
        size: t.size,
        sizeFormatted: formatSize(t.size),
        seeders: t.seeders,
        leechers: t.leechers,
        indexer: t.indexer,
        magnetLink: t.magnetLink,
        downloadUrl: t.downloadUrl,
        guid: t.guid,
        score: 0,
        recommended: false,
        resolution: parsed.resolution,
        source: parsed.source,
        language: parsed.language,
        isSeasonPack: true
      }
    })

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
