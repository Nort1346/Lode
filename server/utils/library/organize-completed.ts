import { dirname, join } from 'node:path'
import { createLogger } from '#server/utils/logger'
import { getMovieDetails, getTvShowDetails } from '#server/utils/tmdb'
import { parseTorrentTitle } from '#server/utils/torrents/torrent-ranker'
import { parseEpisodeInfo } from '#server/utils/torrents/release-episode'
import {
  buildEpisodeRelativePath,
  buildMovieRelativePath,
  getExtensionLower,
  selectMainVideoFile
} from '#server/utils/library/organize'
import { buildAbsoluteTarget, importSingleFile, resolveLibraryDir } from '#server/utils/library/importer'
import type { OrganizeJobInput, OrganizeResult, MediaImportMode } from '#server/types/media-organize'
import type { QBittorrentClient } from '#server/utils/clients/qbittorrent'

const log = createLogger('Organize')

type QbitDeps = Pick<QBittorrentClient, 'findTorrentByHash' | 'getTorrentFiles' | 'renameFile'>

export interface OrganizeDeps {
  qbit: QbitDeps
  libraryMovies: string
  librarySeries: string
  importMode: MediaImportMode
}

function parseYearFromName(name: string): number | null {
  for (const token of name.toLowerCase().split(/[\s._\-+[\](){}]+/)) {
    if (/^(19|20)\d{2}$/.test(token)) {
      const year = Number.parseInt(token, 10)
      if (year >= 1900 && year <= 2099) return year
    }
  }
  return null
}

function yearFromDate(date: string): number | null {
  const year = Number.parseInt(date.slice(0, 4), 10)
  return Number.isInteger(year) && year >= 1900 && year <= 2099 ? year : null
}

async function resolveMovieTarget(
  job: OrganizeJobInput,
  parsedResolution: string | null,
  parsedSource: string | null,
  extension: string
): Promise<string> {
  let title = job.label !== '' ? job.label : job.torrentName
  let year = parseYearFromName(job.torrentName)
  if (job.tmdbId !== null) {
    try {
      const movie = await getMovieDetails(job.tmdbId)
      title = movie.title
      year = yearFromDate(movie.release_date) ?? year
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn(`TMDB movie lookup failed, using label fallback: ${msg}`)
    }
  }
  return buildMovieRelativePath({
    title,
    year,
    resolution: job.resolution ?? parsedResolution,
    source: parsedSource,
    extension
  })
}

async function resolveEpisodeTarget(
  job: OrganizeJobInput,
  season: number,
  episode: number,
  airDate: string | null,
  parsedResolution: string | null,
  parsedSource: string | null,
  extension: string
): Promise<string> {
  let seriesTitle = job.label !== '' ? job.label : job.torrentName
  if (job.tmdbId !== null) {
    try {
      const show = await getTvShowDetails(job.tmdbId)
      seriesTitle = show.name
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn(`TMDB show lookup failed, using label fallback: ${msg}`)
    }
  }
  return buildEpisodeRelativePath({
    seriesTitle,
    season,
    episode,
    episodeTitle: null,
    airDate,
    resolution: job.resolution ?? parsedResolution,
    source: parsedSource,
    extension
  })
}

// Organizes one freshly completed download into the library. Returns a result
// instead of throwing so the torrent-sync loop can persist it and continue.
// Movies/series go to `Library/Title/...`; anything else (games, books, music)
// is skipped. When staging equals the library directory the file is renamed
// in place via qBittorrent (seeding-safe); otherwise the main video file is
// hardlinked/copied/moved onto the target path.
export async function organizeCompletedDownload(
  hash: string,
  job: OrganizeJobInput,
  deps: OrganizeDeps
): Promise<OrganizeResult> {
  if (job.savePath !== 'movies' && job.savePath !== 'series') {
    return { status: 'skipped', targetRelativePath: null, error: null }
  }

  let files
  try {
    files = await deps.qbit.getTorrentFiles(hash)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'failed', targetRelativePath: null, error: `file list failed: ${msg}` }
  }

  const pick = selectMainVideoFile(files)
  if (pick === null) {
    return { status: 'failed', targetRelativePath: null, error: 'no video file found' }
  }

  let saveDir: string | null
  try {
    const torrent = await deps.qbit.findTorrentByHash(hash)
    saveDir = torrent?.save_path ?? null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'failed', targetRelativePath: null, error: `torrent lookup failed: ${msg}` }
  }
  if (saveDir === null || saveDir === '') {
    return { status: 'failed', targetRelativePath: null, error: 'unknown save path' }
  }

  const parsed = parseTorrentTitle(pick.name)
  const extension = getExtensionLower(pick.name) === '' ? 'mkv' : getExtensionLower(pick.name)
  const libraryDir = resolveLibraryDir(job.savePath, {
    savePathMovies: deps.libraryMovies,
    savePathSeries: deps.librarySeries
  })

  let relative: string
  if (job.savePath === 'movies' && (job.mediaType === null || job.mediaType === 'movie')) {
    relative = await resolveMovieTarget(job, parsed.resolution, parsed.source, extension)
  } else {
    const info = parseEpisodeInfo(pick.name)
    if (info.kind === 'episode' && info.seasons.length === 1 && info.episodes.length === 1) {
      const season = info.seasons[0] ?? 1
      const episode = info.episodes[0] ?? 1
      relative = await resolveEpisodeTarget(job, season, episode, null, parsed.resolution, parsed.source, extension)
    } else if (info.kind === 'daily' && info.airDate !== null) {
      relative = await resolveEpisodeTarget(job, 1, 1, info.airDate, parsed.resolution, parsed.source, extension)
    } else {
      return { status: 'failed', targetRelativePath: null, error: `unrecognized episode naming: ${pick.name}` }
    }
  }

  const source = join(saveDir, pick.name)
  const target = buildAbsoluteTarget(libraryDir, relative)

  try {
    if (dirname(source) === dirname(target)) {
      const newBase = relative.split('/').pop() ?? relative
      await deps.qbit.renameFile(hash, pick.name, newBase)
      return { status: 'done', targetRelativePath: relative, error: null }
    }
    await importSingleFile(source, target, deps.importMode)
    return { status: 'done', targetRelativePath: relative, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`organize failed for ${hash}: ${msg}`)
    return { status: 'failed', targetRelativePath: relative, error: msg }
  }
}
