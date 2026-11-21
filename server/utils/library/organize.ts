import type { ExtraFilePlan, MainFilePick, OrganizeEpisodeInput, OrganizeMovieInput } from '#server/types/media-organize'
import type { TorrentFile } from '#server/types/torrent'

const VIDEO_EXTENSIONS = new Set(['mkv', 'mp4', 'avi', 'mov', 'm2ts', 'ts', 'wmv', 'flv'])

const FORBIDDEN_CHARS = /[<>:"/\\|?*]/g

const MAX_SEGMENT_LENGTH = 120

function stripControlChars(input: string): string {
  return [...input]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 32
      return code >= 32
    })
    .join('')
}

export function sanitizeFileSegment(input: string): string {
  const cleaned = stripControlChars(input).replace(FORBIDDEN_CHARS, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return 'untitled'
  return cleaned.length > MAX_SEGMENT_LENGTH ? cleaned.slice(0, MAX_SEGMENT_LENGTH).trim() : cleaned
}

export function getExtensionLower(filename: string): string {
  const base = filename.split('/').pop() ?? filename
  const dot = base.lastIndexOf('.')
  if (dot < 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

function isSampleFile(name: string): boolean {
  return name
    .toLowerCase()
    .split(/[\s._\-/\\[\]()]+/)
    .includes('sample')
}

function isVideoFile(name: string): boolean {
  return VIDEO_EXTENSIONS.has(getExtensionLower(name))
}

// Folders that hold bonus material (featurettes, trailers, interviews). Files
// in them are not episodes, so a season pack that ships them must still import
// cleanly instead of failing on a video without an episode number.
const EXTRA_DIRECTORIES = new Set([
  'extras',
  'extra',
  'featurette',
  'featurettes',
  'trailer',
  'trailers',
  'bonus',
  'bonus features',
  'behind the scenes',
  'deleted scenes',
  'interview',
  'interviews'
])

function isInExtraDirectory(name: string): boolean {
  const segments = name.split('/')
  // The last segment is the file itself; only folders are checked.
  segments.pop()
  return segments.some((segment) =>
    EXTRA_DIRECTORIES.has(
      segment
        .toLowerCase()
        .replace(/[._\s-]+/g, ' ')
        .trim()
    )
  )
}

// Torrent paths always use forward slashes, so they are split manually instead
// of with node:path (which would use the platform separator).
function splitRelativePath(name: string): { dir: string; base: string } {
  const idx = name.lastIndexOf('/')
  if (idx < 0) return { dir: '', base: name }
  return { dir: name.slice(0, idx), base: name.slice(idx + 1) }
}

function splitExtension(base: string): { stem: string; ext: string } {
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return { stem: base, ext: '' }
  return { stem: base.slice(0, dot), ext: base.slice(dot + 1).toLowerCase() }
}

// Every non-sample video file of the torrent, largest first. Movies import the
// first entry only, series import all of them (episodes and season packs).
export function selectVideoFiles(files: TorrentFile[]): MainFilePick[] {
  return files
    .filter(
      (file) => !isSampleFile(file.name) && !isInExtraDirectory(file.name) && isVideoFile(file.name) && file.size > 0
    )
    .map((file) => ({ index: file.index, name: file.name, size: file.size }))
    .sort((a, b) => b.size - a.size)
}

// Plans where every extra file of the torrent lands. With the feature enabled
// all files with an allowed extension are imported - not only same-folder
// sidecars, so `ang.srt` at the root and `subs/ang.srt` are taken as well:
//
// - a sidecar in the same folder as a video, whose stem starts with the video
//   stem, follows that video (`Movie.en.srt` next to `Movie.mkv`);
// - a file with the full video stem from any folder (e.g. `subs/Movie.en.srt`)
//   follows that video too;
// - everything else is release level and lands once, next to the first
//   imported video - a season pack must not get one copy of `ang.srt` per
//   episode.
export function planExtraFileImports(
  files: TorrentFile[],
  videoNames: readonly string[],
  extensions: readonly string[]
): ExtraFilePlan {
  const allowed = new Set(extensions.map((ext) => ext.toLowerCase()))
  const videos = videoNames
    .map((name) => {
      const parts = splitRelativePath(name)
      return { name, dir: parts.dir, stem: splitExtension(parts.base).stem }
    })
    .filter((video) => video.stem !== '')

  const byVideo = new Map<string, MainFilePick[]>()
  const releaseLevel: MainFilePick[] = []

  for (const file of files) {
    if (file.size <= 0) continue
    const parts = splitRelativePath(file.name)
    const { stem, ext } = splitExtension(parts.base)
    if (ext === '' || !allowed.has(ext)) continue

    // Same-folder sidecars are attributed first, then a full-stem match from
    // any folder; anything else is release level.
    const owner =
      videos.find((video) => video.dir === parts.dir && extraSuffix(stem, video.stem) !== null) ??
      videos.find((video) => extraSuffix(stem, video.stem) !== null)

    const pick: MainFilePick = { index: file.index, name: file.name, size: file.size }
    if (owner !== undefined) {
      const picks = byVideo.get(owner.name)
      if (picks === undefined) {
        byVideo.set(owner.name, [pick])
      } else {
        picks.push(pick)
      }
    } else {
      releaseLevel.push(pick)
    }
  }

  return { byVideo, releaseLevel }
}

// Suffix that follows the video stem (`Movie.en.srt` -> `.en`), or null when
// the name is a different file. A boundary character is required so
// `Movie2.srt` does not get attached to `Movie.mkv`.
function extraSuffix(candidateStem: string, videoStem: string): string | null {
  if (videoStem === '') return null
  const candidate = candidateStem.toLowerCase()
  if (!candidate.startsWith(videoStem.toLowerCase())) return null
  const rest = candidateStem.slice(videoStem.length)
  return rest === '' || /^[.\s_-]/.test(rest) ? rest : null
}

// Maps a sidecar name onto the organized video name, keeping language/forced
// suffixes: `Movie.en.srt` next to `Dune (2021) 1080p WEB-DL.mkv` becomes
// `Dune (2021) 1080p WEB-DL.en.srt` in the same library folder. A file whose
// stem does not match the video (`ang.srt`) keeps its own stem as a
// language-like suffix (`...WEB-DL.ang.srt`), so several release-level extras
// never collide onto one name.
export function buildExtraFileRelativePath(input: {
  videoSourceName: string
  videoTargetRelativePath: string
  extraName: string
}): string {
  const sourceVideo = splitRelativePath(input.videoSourceName)
  const sourceVideoStem = splitExtension(sourceVideo.base).stem
  const extra = splitRelativePath(input.extraName)
  const extraParts = splitExtension(extra.base)
  const extension = extraParts.ext === '' ? 'bin' : extraParts.ext

  const suffix = extraSuffix(extraParts.stem, sourceVideoStem) ?? (extraParts.stem === '' ? '' : `.${extraParts.stem}`)
  const safeSuffix = /^[.\w -]*$/.test(suffix) ? suffix : ''

  const target = splitRelativePath(input.videoTargetRelativePath)
  const targetStem = splitExtension(target.base).stem
  const fileName = `${targetStem}${safeSuffix}.${extension}`
  return target.dir === '' ? fileName : `${target.dir}/${fileName}`
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function qualitySuffix(resolution: string | null, source: string | null): string {
  const parts: string[] = []
  if (resolution !== null && resolution !== '') parts.push(resolution)
  if (source !== null && source !== '') parts.push(source)
  return parts.join(' ')
}

export function buildMovieFileName(input: OrganizeMovieInput): string {
  const title = sanitizeFileSegment(input.title)
  const year = input.year !== null ? ` (${input.year})` : ''
  const quality = qualitySuffix(input.resolution, input.source)
  const qualityPart = quality === '' ? '' : ` ${quality}`
  const ext = sanitizeFileSegment(input.extension).toLowerCase()
  return `${title}${year}${qualityPart}.${ext}`
}

export function buildMovieRelativePath(input: OrganizeMovieInput): string {
  const title = sanitizeFileSegment(input.title)
  const year = input.year !== null ? ` (${input.year})` : ''
  const folder = `${title}${year}`
  return `${folder}/${buildMovieFileName(input)}`
}

export function buildEpisodeRelativePath(input: OrganizeEpisodeInput): string {
  const series = sanitizeFileSegment(input.seriesTitle)
  const seasonFolder = `Season ${pad2(input.season)}`
  const firstEpisode = `S${pad2(input.season)}E${pad2(input.episode)}`
  const episodeEnd = input.episodeEnd ?? null
  // A single file holding several episodes keeps both numbers (`S01E01-E02`)
  // so the library shows the whole range instead of mislabelling it.
  const episodeCode =
    episodeEnd !== null && episodeEnd !== input.episode ? `${firstEpisode}-E${pad2(episodeEnd)}` : firstEpisode
  const datePart = input.airDate !== null ? ` - ${input.airDate}` : ''
  const quality = qualitySuffix(input.resolution, input.source)
  const qualityPart = quality === '' ? '' : ` ${quality}`
  const ext = sanitizeFileSegment(input.extension).toLowerCase()
  const fileName = `${series} - ${episodeCode}${datePart}${qualityPart}.${ext}`
  return `${series}/${seasonFolder}/${fileName}`
}
