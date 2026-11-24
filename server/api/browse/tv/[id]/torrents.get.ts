import { getTvShowDetails } from '#server/utils/tmdb'
import { useProwlarr, PROWLARR_CATEGORIES } from '#server/utils/prowlarr'
import { rankTorrents } from '#server/utils/torrents/torrent-ranker'
import { checkDailyLimit } from '#server/utils/limits'
import { getRankingConfig } from '#server/utils/torrents/ranking-config'
import { titleMatchStrength } from '#server/utils/torrents/release-match'
import { pickAlternativeTitles, titleCandidates } from '#server/utils/browse-utils'
import type { RankedTorrent } from '#server/types/torrent'

function toTorrentPayload(t: RankedTorrent) {
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
    score: t.score,
    percentage: t.percentage,
    recommended: t.recommended,
    resolution: t.parsed.resolution,
    source: t.parsed.source,
    language: t.parsed.language,
    tags: t.parsed.tags,
    isPrivate: t.isPrivate
  }
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const id = Number(getRouterParam(event, 'id'))
  if (isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid TV show ID' })
  }

  const locale = (getQuery(event).locale as string | undefined) ?? 'en'

  const limit = await checkDailyLimit(session.user.id)
  if (limit.reached) {
    throw createError({
      statusCode: 429,
      data: { code: 'daily-limit', activeCount: limit.activeCount, todayCount: limit.todayCount, limit: limit.limit }
    })
  }

  let show
  try {
    show = await getTvShowDetails(id, locale)
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch TV show details from TMDB' })
  }

  let torrents: ReturnType<typeof rankTorrents> = []
  let otherTorrents: ReturnType<typeof rankTorrents> = []
  const prowlarr = useProwlarr()
  if (prowlarr !== null) {
    try {
      const rankingConfig = await getRankingConfig()
      const year = show.first_air_date?.slice(0, 4) ?? ''
      const imdbId = show.external_ids?.imdb_id ?? null
      const altTitles = pickAlternativeTitles(
        (show.alternative_names ?? []).map((a) => ({ title: a.name, iso_639_1: a.iso_639_1 })),
        [show.name, show.original_name],
        locale
      )
      let rawResults = await prowlarr.searchTv(
        show.name,
        show.original_name,
        year,
        imdbId,
        null,
        [PROWLARR_CATEGORIES.TV],
        altTitles
      )
      if (rawResults.length === 0 && show.original_name !== show.name) {
        rawResults = await prowlarr.searchTv(
          show.original_name,
          show.name,
          year,
          imdbId,
          null,
          [PROWLARR_CATEGORIES.TV],
          altTitles
        )
      }
      // The text ladder also finds other shows sharing a word with this one;
      // pass all titles to the ranker so this show's releases come first.
      const titles = titleCandidates(
        show.name,
        show.original_name,
        (show.alternative_names ?? []).map((a) => a.name)
      )
      // Every season has its own air year; a release may use any of them.
      const seasonYears = (show.seasons ?? []).map((s) => s.air_date?.slice(0, 4) ?? '').filter((s) => s.length > 0)
      // Flat all-seasons list: no per-season context, so everything is scored
      // with the single-episode size table. Loose text-ladder hits stay in a
      // separate bucket (like the movie endpoint) and are never recommended.
      const matchYears = [year, ...seasonYears]
      const matches = rawResults.filter((r) => titleMatchStrength(r.title, titles, year, 'tv', matchYears) > 0)
      const matched = new Set(matches)
      const others = rawResults.filter((r) => !matched.has(r))
      torrents = rankTorrents(matches, 'series', show.name, year, rankingConfig, titles, matchYears)
      otherTorrents = rankTorrents(others, 'series', show.name, year, rankingConfig, titles, matchYears)
    } catch {
      // Prowlarr might be offline
    }
  }

  return {
    torrents: torrents.map(toTorrentPayload),
    otherTorrents: otherTorrents.map((t) => ({ ...toTorrentPayload(t), recommended: false }))
  }
})
