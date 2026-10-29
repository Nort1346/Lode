import { isAbsolute, join, relative, resolve } from 'node:path'
import { stat } from 'node:fs/promises'
import { createLogger } from '#server/utils/logger'
import { getMovieDetails, getTvShowDetails } from '#server/utils/tmdb'
import { parseTorrentTitle } from '#server/utils/torrents/torrent-ranker'
import { parseEpisodeInfo } from '#server/utils/torrents/release-episode'
import {
  buildEpisodeRelativePath,
  buildExtraFileRelativePath,
  buildMovieRelativePath,
  getExtensionLower,
  selectExtraFiles,
  selectVideoFiles
} from '#server/utils/library/organize'
import {
  buildAbsoluteTarget,
  importSingleFile,
  resolveLibraryDir,
  resolveStagingDir
} from '#server/utils/library/importer'
import type { MediaImportMode, OrganizeJobInput, OrganizeResult, OrganizeStatus } from '#server/types/media-organize'
import type { TorrentFile } from '#server/types/torrent'
import type { QBittorrentClient } from '#server/utils/clients/qbittorrent'

const log = createLogger('Organize')

type QbitDeps = Pick<QBittorrentClient, 'findTorrentByHash' | 'getTorrentFiles'>

export interface OrganizeDeps {
  qbit: QbitDeps
  libraryMovies: string
  librarySeries: string
  stagingMovies: string
  stagingSeries: string
  importMode: MediaImportMode
  importExtraFiles: boolean
  extraFileExtensions: readonly string[]
}

interface ImportTarget {
  // Path relative to the torrent root, as reported by qBittorrent.
  sourceName: string
  // Path relative to the library root.
  relativePath: string
}

interface BuildTargets {
  targets: ImportTarget[]
  errors: string[]
}

interface LocatedSource {
  path: string
  root: string
}

function buildResult(input: {
  status: OrganizeStatus
  targetRelativePath?: string | null
  error?: string | null
  importedFiles?: number
  skippedFiles?: number
  extrasImported?: number
}): OrganizeResult {
  return {
    status: input.status,
    targetRelativePath: input.targetRelativePath ?? null,
    error: input.error ?? null,
    importedFiles: input.importedFiles ?? 0,
    skippedFiles: input.skippedFiles ?? 0,
    extrasImported: input.extrasImported ?? 0
  }
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

async function resolveMovieMetadata(job: OrganizeJobInput): Promise<{ title: string; year: number | null }> {
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
  return { title, year }
}

async function resolveSeriesTitle(job: OrganizeJobInput): Promise<string> {
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
  return seriesTitle
}

// Movies import exactly one file (the largest non-sample video), like Radarr.
async function buildMovieTargets(job: OrganizeJobInput, files: TorrentFile[]): Promise<BuildTargets> {
  const pick = selectVideoFiles(files)[0]
  if (pick === undefined) return { targets: [], errors: ['no video file found'] }

  const parsed = parseTorrentTitle(pick.name)
  const extension = getExtensionLower(pick.name) === '' ? 'mkv' : getExtensionLower(pick.name)
  const { title, year } = await resolveMovieMetadata(job)

  return {
    targets: [
      {
        sourceName: pick.name,
        relativePath: buildMovieRelativePath({
          title,
          year,
          resolution: job.resolution ?? parsed.resolution,
          source: parsed.source,
          extension
        })
      }
    ],
    errors: []
  }
}

// Series import every video file, so season packs and multi-episode releases
// land in the library episode by episode instead of only the largest file.
async function buildSeriesTargets(job: OrganizeJobInput, files: TorrentFile[]): Promise<BuildTargets> {
  const videos = selectVideoFiles(files)
  if (videos.length === 0) return { targets: [], errors: ['no video file found'] }

  const seriesTitle = await resolveSeriesTitle(job)
  const targets: ImportTarget[] = []
  const errors: string[] = []

  for (const video of videos) {
    const parsed = parseTorrentTitle(video.name)
    const extension = getExtensionLower(video.name) === '' ? 'mkv' : getExtensionLower(video.name)
    const info = parseEpisodeInfo(video.name)
    const base = {
      seriesTitle,
      resolution: job.resolution ?? parsed.resolution,
      source: parsed.source,
      extension
    }

    if (info.kind === 'episode' && info.seasons.length === 1 && info.episodes.length === 1) {
      targets.push({
        sourceName: video.name,
        relativePath: buildEpisodeRelativePath({
          ...base,
          season: info.seasons[0] ?? 1,
          episode: info.episodes[0] ?? 1,
          airDate: null
        })
      })
      continue
    }

    if (info.kind === 'multi-episode' && info.seasons.length === 1 && info.episodes.length > 0) {
      targets.push({
        sourceName: video.name,
        relativePath: buildEpisodeRelativePath({
          ...base,
          season: info.seasons[0] ?? 1,
          episode: info.episodes[0] ?? 1,
          episodeEnd: info.episodes[info.episodes.length - 1] ?? null,
          airDate: null
        })
      })
      continue
    }

    if (info.kind === 'daily' && info.airDate !== null) {
      targets.push({
        sourceName: video.name,
        relativePath: buildEpisodeRelativePath({
          ...base,
          // Daily releases are filed under the air year, like Sonarr.
          season: yearFromDate(info.airDate) ?? 1,
          episode: 1,
          airDate: info.airDate
        })
      })
      continue
    }

    errors.push(`unrecognized episode naming: ${video.name}`)
  }

  return { targets, errors }
}

// qBittorrent and Lode may mount the same directory under different paths
// (e.g. /downloads vs /media/downloads). Prefer the client-reported save path
// and fall back to the configured staging dir before giving up.
async function locateSource(roots: string[], name: string): Promise<LocatedSource | null> {
  for (const root of roots) {
    const path = join(root, name)
    try {
      const info = await stat(path)
      if (info.isFile()) return { path, root }
    } catch {
      // try the next root
    }
  }
  return null
}

// True when `child` is `parent` or lives below it. Used to reject downloads
// that qBittorrent wrote straight into the library: importing them would
// duplicate the file and leave the original release folder in the library.
function isSameOrInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function importExtras(input: {
  files: TorrentFile[]
  sourceName: string
  targetRelativePath: string
  libraryDir: string
  sourceRoot: string
  extensions: readonly string[]
}): Promise<number> {
  if (input.extensions.length === 0) return 0

  const extras = selectExtraFiles(input.files, input.sourceName, input.extensions)
  let imported = 0
  for (const extra of extras) {
    const relativePath = buildExtraFileRelativePath({
      videoSourceName: input.sourceName,
      videoTargetRelativePath: input.targetRelativePath,
      extraName: extra.name
    })
    try {
      // Extras are always copied: they are small and must not break seeding.
      await importSingleFile(
        join(input.sourceRoot, extra.name),
        buildAbsoluteTarget(input.libraryDir, relativePath),
        'copy'
      )
      imported++
    } catch (err) {
      if (!isEexist(err)) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn(`extra file import failed (${extra.name}): ${msg}`)
      }
    }
  }
  return imported
}

// Organizes one freshly completed download into the library, *arr style: the
// torrent is left untouched in its staging directory (so seeding keeps working)
// and the files are hardlinked/copied/moved into `Library/Title/...`. Without a
// configured staging dir the download is reported as failed instead of being
// renamed inside the library, which used to leave torrent leftovers there.
export async function organizeCompletedDownload(
  hash: string,
  job: OrganizeJobInput,
  deps: OrganizeDeps
): Promise<OrganizeResult> {
  if (job.savePath !== 'movies' && job.savePath !== 'series') {
    return buildResult({ status: 'skipped' })
  }

  const stagingDir = resolveStagingDir(job.savePath, {
    downloadPathMovies: deps.stagingMovies,
    downloadPathSeries: deps.stagingSeries
  })
  if (stagingDir === null) {
    const variable = job.savePath === 'movies' ? 'NUXT_DOWNLOAD_PATH_MOVIES' : 'NUXT_DOWNLOAD_PATH_SERIES'
    return buildResult({
      status: 'failed',
      error: `staging dir not configured for ${job.savePath} (set ${variable})`
    })
  }

  let files: TorrentFile[]
  try {
    files = await deps.qbit.getTorrentFiles(hash)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return buildResult({ status: 'failed', error: `file list failed: ${msg}` })
  }

  const built = job.savePath === 'movies' ? await buildMovieTargets(job, files) : await buildSeriesTargets(job, files)
  if (built.targets.length === 0) {
    return buildResult({ status: 'failed', error: built.errors[0] ?? 'no importable file found' })
  }

  let saveDir: string
  try {
    const torrent = await deps.qbit.findTorrentByHash(hash)
    if (torrent === undefined || torrent.save_path === '') {
      return buildResult({ status: 'failed', error: 'unknown save path' })
    }
    saveDir = torrent.save_path
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return buildResult({ status: 'failed', error: `torrent lookup failed: ${msg}` })
  }

  const libraryDir = resolveLibraryDir(job.savePath, {
    savePathMovies: deps.libraryMovies,
    savePathSeries: deps.librarySeries
  })

  // A torrent added before staging was configured sits inside the library.
  // Importing it would hardlink/copy the file into a new folder and leave the
  // original release folder behind - exactly the mess this feature avoids - so
  // only the staging root is searched for those.
  const sameRoot = resolve(saveDir) === resolve(stagingDir)
  const saveDirInLibrary = !sameRoot && isSameOrInside(libraryDir, saveDir)
  const roots = sameRoot || saveDirInLibrary ? [stagingDir] : [saveDir, stagingDir]

  let importedFiles = 0
  let skippedFiles = 0
  let extrasImported = 0
  let failedFiles = built.errors.length
  let firstTarget: string | null = null
  let firstError: string | null = built.errors[0] ?? null

  for (const target of built.targets) {
    const source = await locateSource(roots, target.sourceName)
    if (source === null) {
      failedFiles++
      firstError ??= saveDirInLibrary
        ? `download files live inside the library (${saveDir}), not in staging; re-download it`
        : `source file not found: ${target.sourceName}`
      log.warn(
        `source file not found: hash=${hash} file="${target.sourceName}" save_path=${saveDir} staging=${stagingDir}${
          saveDirInLibrary ? ' (save path is inside the library)' : ''
        }`
      )
      continue
    }

    const absoluteTarget = buildAbsoluteTarget(libraryDir, target.relativePath)
    // Copy and move overwrite an existing file, while a hardlink answers
    // EEXIST. Check first so a duplicate release is skipped in every mode.
    if (await targetExists(absoluteTarget)) {
      skippedFiles++
      firstTarget ??= target.relativePath
      continue
    }

    try {
      const outcome = await importSingleFile(source.path, absoluteTarget, deps.importMode)
      importedFiles++
      firstTarget ??= target.relativePath
      log.info(`imported "${target.sourceName}" -> ${target.relativePath} via ${outcome.method}`)

      if (deps.importExtraFiles) {
        extrasImported += await importExtras({
          files,
          sourceName: target.sourceName,
          targetRelativePath: target.relativePath,
          libraryDir,
          sourceRoot: source.root,
          extensions: deps.extraFileExtensions
        })
      }
    } catch (err) {
      // A second download of the same release targets the same file name; the
      // first import already placed it, so skip instead of failing.
      if (isEexist(err)) {
        skippedFiles++
        firstTarget ??= target.relativePath
        continue
      }
      const msg = err instanceof Error ? err.message : String(err)
      failedFiles++
      firstError ??= `${target.sourceName}: ${msg}`
      log.warn(`organize failed for ${hash}: ${target.sourceName}: ${msg}`)
    }
  }

  const counts = { importedFiles, skippedFiles, extrasImported }

  if (failedFiles > 0) {
    return buildResult({
      ...counts,
      status: 'failed',
      targetRelativePath: firstTarget,
      error: firstError ?? `${failedFiles} file(s) failed`
    })
  }

  if (importedFiles === 0) {
    return buildResult({
      ...counts,
      status: 'skipped',
      targetRelativePath: firstTarget,
      error: skippedFiles > 0 ? 'target already exists' : firstError
    })
  }

  log.info(`organized ${hash}: ${importedFiles} file(s), ${skippedFiles} skipped, ${extrasImported} extra file(s)`)
  return buildResult({ ...counts, status: 'done', targetRelativePath: firstTarget, error: firstError })
}

async function targetExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

function isEexist(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EEXIST'
}
