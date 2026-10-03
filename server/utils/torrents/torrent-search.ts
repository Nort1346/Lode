import { getMovieDetails, getSeasonDetails, getTvShowDetails, getImageUrl } from '#server/utils/tmdb'
import { useProwlarr, PROWLARR_CATEGORIES } from '#server/utils/prowlarr'
import { rankTorrents } from '#server/utils/torrents/torrent-ranker'
import { getRankingConfig } from '#server/utils/torrents/ranking-config'
import { pickAlternativeTitles } from '#server/utils/browse-utils'
import { titleIsSeasonPack, titleMatchesEpisode } from '#server/utils/torrents/release-episode'
import { createLogger } from '#server/utils/logger'
import type { ProwlarrResult, ProwlarrProgressCallback, ProwlarrProgressEvent } from '#server/types/prowlarr'
import type { RankedTorrent } from '#server/types/ranking'
import type {
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
// insensitive); these wrappers keep the call sites unchanged.
function episodeRangeMatches(title: string, seasonNumber: number, episodeNumber: number): boolean {
  return titleMatchesEpisode(title, seasonNumber, episodeNumber)
}

function isSeasonPack(title: string, seasonNumber: number): boolean {
  return titleIsSeasonPack(title, seasonNumber)
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

function toSeasonPackPayload(t: RankedTorrent): SeasonPackPayload {
  return {
    ...toEpisodePayload(t),
    isSeasonPack: t.isSeasonPack
  }
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
    const payload: MovieSearchPayload = { torrents: [] }
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
      onProgress
    )
    const torrents = rankTorrents(rawResults, 'movie', movie.title, year, rankingConfig).map(toTorrentPayload)
    const payload: MovieSearchPayload = { torrents }
    return { kind: 'ok', payload, found: torrents.length }
  } catch {
    // Prowlarr might be offline mid-search - return empty instead of failing
    return { kind: 'ok', payload: { torrents: [] }, found: 0 }
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

  const rankingConfig = await getRankingConfig()

  const episodes: EpisodePayload[] = (season.episodes ?? []).map((ep) => {
    const episodeTorrents = rawTorrents.filter((t) => episodeRangeMatches(t.title, seasonNumber, ep.episode_number))
    if (episodeTorrents.length > 0) {
      log.info(`Episode ${ep.episode_number}: ${episodeTorrents.length} torrents matched`)
    }
    const ranked = rankTorrents(episodeTorrents, 'series', show.name, year, rankingConfig)

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

  // This isSeasonPack filter is the single source of pack classification -
  // the ranker is told the bucket kind explicitly and no longer re-guesses it
  // from the title (which broke episode-range packs like S01E01-E10).
  const seasonPackTorrents = rawTorrents.filter((t) => isSeasonPack(t.title, seasonNumber))
  if (seasonPackTorrents.length > 0) {
    log.info(`Season packs: ${seasonPackTorrents.length} found`)
  }

  const seasonPacks = rankTorrents(seasonPackTorrents, 'seasonPack', show.name, year, rankingConfig).map(
    toSeasonPackPayload
  )

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
    seasonPacks
  }
  return { kind: 'ok', payload, found: rawTorrents.length }
}
