import { getMovieDetails, getSeasonDetails, getTvShowDetails, getImageUrl } from '#server/utils/tmdb'
import { useProwlarr, PROWLARR_CATEGORIES } from '#server/utils/prowlarr'
import { rankTorrents } from '#server/utils/torrents/torrent-ranker'
import { getRankingConfig } from '#server/utils/torrents/ranking-config'
import { pickAlternativeTitles, titleCandidates } from '#server/utils/browse-utils'
import {
  parseEpisodeInfo,
  releaseBelongsToSeason,
  seasonPackFromInfo,
  titleMatchesEpisode
} from '#server/utils/torrents/release-episode'
import type { EpisodeInfo } from '#server/types/release-episode'
import { titleMatchStrength } from '#server/utils/torrents/release-match'
import { createLogger } from '#server/utils/logger'
import type { ProwlarrResult, ProwlarrProgressCallback, ProwlarrProgressEvent } from '#server/types/prowlarr'
import type { RankedTorrent } from '#server/types/torrent'
import type {
  EpisodePackPayload,
  EpisodePayload,
  EpisodeTorrentPayload,
  MovieSearchPayload,
  MovieTorrentsOutcome,
  SeasonPackPayload,
  SeasonSearchPayload,
  SeasonTorrentsOutcome,
  TorrentSearchTorrent,
  TorrentStreamEvent
} from '#server/types/torrent-search'

const log = createLogger('TorrentSearch')

// Single source of truth lives in release-episode.ts (token-based, case
// insensitive); this wrapper keeps the call site short.
function episodeRangeMatches(
  title: string,
  seasonNumber: number,
  episodeNumber: number,
  airDate: string | null,
  absoluteNumber: number
): boolean {
  return titleMatchesEpisode(title, seasonNumber, episodeNumber, airDate, absoluteNumber)
}

function toTorrentPayload(t: RankedTorrent): TorrentSearchTorrent {
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

function toEpisodePayload(t: RankedTorrent): EpisodeTorrentPayload {
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
    language: t.parsed.language,
    source: t.parsed.source,
    tags: t.parsed.tags,
    isPrivate: t.isPrivate
  }
}

function toSeasonPackPayload(t: RankedTorrent, info: EpisodeInfo): SeasonPackPayload {
  const seasons = info.kind === 'season-pack' || info.kind === 'multiseason-pack' ? info.seasons : []
  return {
    ...toEpisodePayload(t),
    isSeasonPack: t.isSeasonPack,
    seasons
  }
}

function toEpisodePackPayload(t: RankedTorrent, info: EpisodeInfo, seasonEpisodes: number[]): EpisodePackPayload {
  const seasons = info.kind === 'episode-pack' ? info.seasons : []
  const episodes = info.kind === 'episode-pack' ? info.episodes : []
  return {
    ...toEpisodePayload(t),
    seasons,
    episodes,
    seasonEpisodes
  }
}

/**
 * A release such as `S1-8E1-96` numbers episodes continuously across seasons.
 * TMDB knows how many episodes each season has, so the absolute range can be
 * cut into the part that actually belongs to the season being viewed.
 */
function episodeNumbersForSeason(
  info: EpisodeInfo,
  seasonNumber: number,
  showSeasons: Array<{ season_number: number; episode_count: number }>
): number[] {
  const from = info.episodes[0] ?? 1
  const to = info.episodes[info.episodes.length - 1] ?? from
  let cursor = 1
  const seasons = [...showSeasons]
    .filter((season) => season.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number)

  for (const season of seasons) {
    const count = Math.max(0, season.episode_count)
    const start = cursor
    const end = cursor + count - 1
    if (season.season_number === seasonNumber) {
      if (count === 0) break
      const localFrom = Math.max(from, start) - start + 1
      const localTo = Math.min(to, end) - start + 1
      if (localFrom > localTo || localFrom > count || localTo > count) return []
      return Array.from({ length: localTo - localFrom + 1 }, (_, i) => localFrom + i)
    }
    cursor = end + 1
  }

  // TMDB has no episode count for this season: keep the absolute range so the
  // release is still visible rather than silently dropped.
  return info.episodes
}

// Maps the internal ladder progress events onto the wire event schema. The
// shapes are 1:1 apart from the kind/type discriminator rename.
export function toStreamEvent(e: ProwlarrProgressEvent): TorrentStreamEvent {
  if (e.kind === 'start') return { type: 'start', queries: e.queries }
  if (e.kind === 'query' && e.state === 'done') {
    return { type: 'query', state: 'done', index: e.index, total: e.total, text: e.text, results: e.results }
  }
  if (e.kind === 'query' && e.state === 'failed') {
    return { type: 'query', state: 'failed', index: e.index, total: e.total, text: e.text, reason: e.reason }
  }
  if (e.kind === 'query') return { type: 'query', state: e.state, index: e.index, total: e.total, text: e.text }
  return { type: 'imdb', results: e.results }
}

// Runs the movie torrent search: TMDB details, Prowlarr ladder (with progress
// forwarding), ranking and payload mapping. Prowlarr failures resolve to an
// empty payload instead of rejecting, matching the pre-stream endpoint
// behavior.
export async function searchMovieTorrents(
  id: number,
  locale: string,
  onProgress?: ProwlarrProgressCallback
): Promise<MovieTorrentsOutcome> {
  let movie
  try {
    movie = await getMovieDetails(id, locale)
  } catch {
    return { kind: 'details-failed' }
  }

  const prowlarr = useProwlarr()
  if (prowlarr === null) {
    const payload: MovieSearchPayload = { torrents: [], otherTorrents: [] }
    return { kind: 'ok', payload, found: 0 }
  }

  try {
    const rankingConfig = await getRankingConfig()
    const year = movie.release_date?.slice(0, 4) ?? ''
    const altTitles = pickAlternativeTitles(
      (movie.alternative_titles ?? []).map((a) => ({ title: a.title, iso_639_1: a.iso_639_1 })),
      [movie.title, movie.original_title],
      locale
    )
    const rawResults = await prowlarr.searchMovie(
      movie.title,
      movie.original_title,
      altTitles,
      year,
      [PROWLARR_CATEGORIES.MOVIES],
      onProgress,
      movie.imdb_id
    )
    // Prowlarr's text search matches any word in the title, so a short title
    // also brings back unrelated films that share one of its words. Releases
    // that do not name this film go into a separate bucket: nothing is lost,
    // but they cannot be mistaken for the requested movie or recommended.
    const titles = titleCandidates(
      movie.title,
      movie.original_title,
      (movie.alternative_titles ?? []).map((a) => a.title)
    )
    const matches = rawResults.filter((r) => titleMatchStrength(r.title, titles, year, 'movie') > 0)
    const matched = new Set(matches)
    const others = rawResults.filter((r) => !matched.has(r))

    const torrents = rankTorrents(matches, 'movie', movie.title, year, rankingConfig, titles).map(toTorrentPayload)
    const otherTorrents = rankTorrents(others, 'movie', movie.title, year, rankingConfig, titles).map((t) => ({
      ...toTorrentPayload(t),
      recommended: false
    }))
    log.info(`Movie "${movie.title}": ${torrents.length} matches, ${otherTorrents.length} loose Prowlarr results`)
    const payload: MovieSearchPayload = { torrents, otherTorrents }
    return { kind: 'ok', payload, found: rawResults.length }
  } catch {
    // Prowlarr might be offline mid-search - return empty instead of failing
    return { kind: 'ok', payload: { torrents: [], otherTorrents: [] }, found: 0 }
  }
}

// Runs the season torrent search: TMDB show + season details, Prowlarr search
// (IMDB + text ladder, with the original-name retry), per-episode and pack
// classification, ranking and payload mapping.
export async function searchSeasonTorrents(
  showId: number,
  seasonNumber: number,
  locale: string,
  onProgress?: ProwlarrProgressCallback
): Promise<SeasonTorrentsOutcome> {
  let show
  let season
  try {
    show = await getTvShowDetails(showId, locale)
    season = await getSeasonDetails(showId, seasonNumber, locale)
  } catch {
    return { kind: 'details-failed' }
  }

  const year = show.first_air_date?.slice(0, 4) ?? ''

  let rawTorrents: ProwlarrResult[] = []
  const prowlarr = useProwlarr()
  if (prowlarr !== null) {
    try {
      const imdbId = show.external_ids?.imdb_id ?? null
      const altTitles = pickAlternativeTitles(
        (show.alternative_names ?? []).map((a) => ({ title: a.name, iso_639_1: a.iso_639_1 })),
        [show.name, show.original_name],
        locale
      )
      log.info(
        `Searching: show="${show.name}" original="${show.original_name}" season=${seasonNumber} imdb=${imdbId ?? 'none'}`
      )
      rawTorrents = await prowlarr.searchTv(
        show.name,
        show.original_name,
        year,
        imdbId,
        seasonNumber,
        [PROWLARR_CATEGORIES.TV],
        altTitles,
        onProgress
      )
      if (rawTorrents.length === 0 && show.original_name !== show.name) {
        log.info(`Retrying with original name: "${show.original_name}"`)
        rawTorrents = await prowlarr.searchTv(
          show.original_name,
          show.name,
          year,
          imdbId,
          seasonNumber,
          [PROWLARR_CATEGORIES.TV],
          altTitles,
          onProgress
        )
      }
      log.info(`Prowlarr returned ${rawTorrents.length} results`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error(`Prowlarr search failed: ${msg}`)
    }
  } else {
    log.warn(`Prowlarr not configured`)
  }

  // All titles are passed to the ranker so releases of this show sort above
  // same-numbered episodes from other shows, without hiding any result.
  const showTitles = titleCandidates(
    show.name,
    show.original_name,
    (show.alternative_names ?? []).map((a) => a.name)
  )
  // A release may carry the show's pilot year or the year this particular
  // season aired. Accept both (within a year) so neither is demoted.
  const seasonYear = season.air_date?.slice(0, 4) ?? ''
  const matchYears = seasonYear === '' ? [] : [year, seasonYear]

  // Anime releases often use running (absolute) episode numbers instead of
  // SxxExx. Add up the episodes of the earlier seasons to map them back.
  const priorEpisodes = (show.seasons ?? [])
    .filter((s) => s.season_number > 0 && s.season_number < seasonNumber)
    .reduce((sum, s) => sum + s.episode_count, 0)

  const rankingConfig = await getRankingConfig()
  const matched = new Set<ProwlarrResult>()

  const episodes: EpisodePayload[] = (season.episodes ?? []).map((ep) => {
    const absoluteNumber = priorEpisodes + ep.episode_number
    const episodeTorrents = rawTorrents.filter((t) =>
      episodeRangeMatches(t.title, seasonNumber, ep.episode_number, ep.air_date, absoluteNumber)
    )
    for (const torrent of episodeTorrents) matched.add(torrent)
    if (episodeTorrents.length > 0) {
      log.info(`Episode ${ep.episode_number}: ${episodeTorrents.length} torrents matched`)
    }
    const ranked = rankTorrents(episodeTorrents, 'series', show.name, year, rankingConfig, showTitles, matchYears)

    return {
      id: ep.id,
      episodeNumber: ep.episode_number,
      name: ep.name,
      overview: ep.overview,
      stillUrl: getImageUrl(ep.still_path, 'w300'),
      airDate: ep.air_date,
      rating: ep.vote_average,
      runtime: ep.runtime,
      torrents: ranked.map(toEpisodePayload)
    }
  })

  // Pack rule: anything spanning more than one episode (season packs and
  // multi-episode ranges alike) lands here; per-episode buckets only get true
  // single episodes. The ranker is told the bucket kind explicitly and never
  // re-guesses it from the title.
  // Parse once per release and reuse the result for classification and
  // payloads. Key by title: rankTorrents() spreads results into new objects,
  // so object identity would be lost between the two steps.
  const parsedInfos = new Map<string, EpisodeInfo>()
  for (const torrent of rawTorrents) {
    parsedInfos.set(torrent.title, parseEpisodeInfo(torrent.title))
  }

  const packInfos = new Map<string, EpisodeInfo>()
  const seasonPackTorrents = rawTorrents.filter((t) => {
    const info = seasonPackFromInfo(parsedInfos.get(t.title) ?? parseEpisodeInfo(t.title), seasonNumber)
    if (info === null) return false
    packInfos.set(t.title, info)
    return true
  })
  for (const torrent of seasonPackTorrents) matched.add(torrent)
  if (seasonPackTorrents.length > 0) {
    log.info(`Season packs: ${seasonPackTorrents.length} found`)
  }

  const seasonPacks = rankTorrents(
    seasonPackTorrents,
    'seasonPack',
    show.name,
    year,
    rankingConfig,
    showTitles,
    matchYears
  ).map((t) =>
    toSeasonPackPayload(
      t,
      packInfos.get(t.title) ?? { kind: 'complete-series', seasons: [], episodes: [], airDate: null }
    )
  )

  // A range such as `S1-8E1-96` is a pack of many episodes, not one episode and
  // not a whole-season pack. Split its absolute range per TMDB season so it
  // lands in the right season's "Episode packs" section.
  const episodePackInfos = new Map<string, EpisodeInfo>()
  const episodePackTorrents = rawTorrents.filter((t) => {
    const info = parsedInfos.get(t.title)
    if (info?.kind !== 'episode-pack' || !info.seasons.includes(seasonNumber)) return false
    episodePackInfos.set(t.title, info)
    return true
  })
  for (const torrent of episodePackTorrents) matched.add(torrent)
  if (episodePackTorrents.length > 0) {
    log.info(`Episode packs: ${episodePackTorrents.length} found`)
  }

  const episodePacks = rankTorrents(
    episodePackTorrents,
    'seasonPack',
    show.name,
    year,
    rankingConfig,
    showTitles,
    matchYears
  ).map((t) => {
    const info = episodePackInfos.get(t.title) ?? parseEpisodeInfo(t.title)
    return toEpisodePackPayload(t, info, episodeNumbersForSeason(info, seasonNumber, show.seasons ?? []))
  })

  // Nothing relevant is discarded: releases that do not map onto a TMDB
  // episode or pack (a just-aired episode TMDB has not added yet, unusual
  // numbering, ...) get their own bucket in the UI. Releases that explicitly
  // belong to another season stay out of it - they show up when that season
  // is selected instead.
  const otherTorrents = rankTorrents(
    rawTorrents.filter((t) => !matched.has(t) && releaseBelongsToSeason(t.title, seasonNumber)),
    'series',
    show.name,
    year,
    rankingConfig,
    showTitles,
    matchYears
  ).map(toEpisodePayload)
  if (otherTorrents.length > 0) {
    log.info(`Other (unmapped) releases: ${otherTorrents.length}`)
  }

  const payload: SeasonSearchPayload = {
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
    seasonPacks,
    episodePacks,
    otherTorrents
  }
  return { kind: 'ok', payload, found: rawTorrents.length }
}
