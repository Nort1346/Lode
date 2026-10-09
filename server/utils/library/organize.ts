import type { MainFilePick, OrganizeEpisodeInput, OrganizeMovieInput } from '#server/types/media-organize'
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

export function selectMainVideoFile(files: TorrentFile[]): MainFilePick | null {
  let best: MainFilePick | null = null
  for (const file of files) {
    if (isSampleFile(file.name)) continue
    const ext = getExtensionLower(file.name)
    if (!VIDEO_EXTENSIONS.has(ext)) continue
    if (file.size <= 0) continue
    if (best === null || file.size > best.size) {
      best = { index: file.index, name: file.name, size: file.size }
    }
  }
  return best
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
  const episodeCode = `S${pad2(input.season)}E${pad2(input.episode)}`
  const titlePart =
    input.episodeTitle !== null && input.episodeTitle !== '' ? ` - ${sanitizeFileSegment(input.episodeTitle)}` : ''
  const datePart = input.episodeTitle === null && input.airDate !== null ? ` - ${input.airDate}` : ''
  const quality = qualitySuffix(input.resolution, input.source)
  const qualityPart = quality === '' ? '' : ` ${quality}`
  const ext = sanitizeFileSegment(input.extension).toLowerCase()
  const fileName = `${series} - ${episodeCode}${titlePart}${datePart}${qualityPart}.${ext}`
  return `${series}/${seasonFolder}/${fileName}`
}
