import type { MatchMediaKind, TitleMatchDetail } from '#server/types/release-match'

// Prowlarr text search is a fuzzy, AND-based query. A short title also returns
// unrelated films whose names merely share one of its words - the indexer
// matched words somewhere in the title, not the whole title. Those releases are
// demoted below the real ones, never hidden: the user asked to see every result
// Prowlarr returned.

// Tokens that are release metadata rather than part of the work's title. They
// are allowed around the title candidate (and between the candidate and the
// year/episode markers) without making the match ambiguous.
const METADATA_TOKENS = new Set([
  // source
  'web',
  'webdl',
  'web-dl',
  'webrip',
  'bluray',
  'blu',
  'ray',
  'bdremux',
  'remux',
  'bdrip',
  'brrip',
  'hdrip',
  'hdtv',
  'pdtv',
  'dvdrip',
  'dvdscr',
  'dvd',
  'hddvd',
  'cam',
  'hdcam',
  'hdts',
  'ts',
  'tc',
  'scr',
  'screener',
  'telecine',
  'telesync',
  'vhs',
  'tv',
  // resolution
  'sd',
  'hd',
  'uhd',
  '4k',
  '8k',
  'hdr',
  'hdr10',
  'hdr10plus',
  'dv',
  'dolby',
  'vision',
  'sdr',
  '10bit',
  '8bit',
  // codec / audio
  'x264',
  'x265',
  'h264',
  'h265',
  'hevc',
  'avc',
  'av1',
  'xvid',
  'divx',
  'aac',
  'ac3',
  'eac3',
  'ddp',
  'dd',
  'dts',
  'dtshd',
  'truehd',
  'atmos',
  'flac',
  'mp3',
  'opus',
  'multi',
  'dual',
  'audio',
  // languages and polish release markers
  'pl',
  'plsub',
  'plsubs',
  'napisy',
  'lektor',
  'dubbing',
  'dub',
  'voice',
  'eng',
  'en',
  'ger',
  'de',
  'fre',
  'fr',
  'spa',
  'es',
  'ita',
  'it',
  'jap',
  'jp',
  'kor',
  'kr',
  'us',
  'uk',
  'gb',
  'au',
  'ca',
  'nz',
  'ie',
  'sub',
  'subs',
  'subtitles',
  // release flags
  'proper',
  'repack',
  'rerip',
  'internal',
  'limited',
  'extended',
  'unrated',
  'remastered',
  'directors',
  'cut',
  'edition',
  'imax',
  'complete',
  'full',
  'season',
  'sezon',
  'series',
  'serie',
  'serial',
  'collection',
  'ep',
  'episode',
  'odc',
  'odcinek',
  // containers
  'mkv',
  'mp4',
  'avi',
  'iso'
])

const TRANSLITERATION: Record<string, string> = {
  ł: 'l',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
  ı: 'i'
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[łøđðßæœþı]/g, (char) => TRANSLITERATION[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
}

function isYearToken(token: string): boolean {
  return /^(?:19|20)\d{2}$/.test(token)
}

function isMetadataToken(token: string, kind: MatchMediaKind): boolean {
  if (METADATA_TOKENS.has(token)) return true
  if (isYearToken(token)) return true
  if (/^\d{3,4}[pi]$/.test(token)) return true
  if (/^\d+bit$/.test(token)) return true
  if (/^s\d{1,2}(?:e\d{1,3})?$/.test(token)) return true
  if (/^e\d{1,3}$/.test(token)) return true
  // A bare number after a TV title is an absolute episode number ("Show - 05");
  // for a movie it could be a sequel number, so it is not a
  // boundary there.
  return kind === 'tv' && /^\d{1,4}$/.test(token)
}

function withoutLeadingArticle(tokens: string[]): string[] {
  const first = tokens[0]
  if (first === 'the' || first === 'a' || first === 'an') return tokens.slice(1)
  return tokens
}

function sequenceMatches(segment: string[], start: number, candidate: string[]): boolean {
  for (let i = 0; i < candidate.length; i++) {
    if (segment[start + i] !== candidate[i]) return false
  }
  return true
}

/**
 * The title candidate must start a slash-separated part of the release name.
 * Anything before it has to be release metadata (a language tag, a bracketed
 * group, ...) and anything after it has to be release metadata too - otherwise
 * a short title would also match a longer one that merely contains it.
 */
function matchesSegment(segment: string[], candidate: string[], kind: MatchMediaKind): number {
  const variants = [{ tokens: candidate, strength: 2 }]
  const articleFree = withoutLeadingArticle(candidate)
  if (articleFree.length > 0 && articleFree.length < candidate.length) {
    variants.push({ tokens: articleFree, strength: 1 })
  }

  for (const variant of variants) {
    for (let start = 0; start + variant.tokens.length <= segment.length; start++) {
      if (start > 0) {
        const prefixIsMetadata = segment.slice(0, start).every((token) => isMetadataToken(token, kind))
        if (!prefixIsMetadata) break
      }
      if (!sequenceMatches(segment, start, variant.tokens)) continue

      const next = segment[start + variant.tokens.length]
      if (next === undefined || isMetadataToken(next, kind)) return variant.strength
    }
  }
  return 0
}

function extractYear(tokens: string[], ignored: ReadonlySet<string>): number | null {
  for (const token of tokens) {
    // A year can be part of the title ("1917", "2001: A Space Odyssey"). Such
    // a token must not be read as the release year - otherwise the correct
    // release of those films gets demoted as a "wrong year".
    if (!ignored.has(token) && isYearToken(token)) return Number(token)
  }
  return null
}

function acceptableYears(year: string | null, altYears: string[]): number[] {
  const years: number[] = []
  for (const value of [year, ...altYears]) {
    if (value === null || !isYearToken(value)) continue
    const parsed = Number(value)
    if (!years.includes(parsed)) years.push(parsed)
  }
  return years
}

function matchForTitle(
  releaseTitle: string,
  candidateTitle: string,
  years: number[],
  kind: MatchMediaKind
): TitleMatchDetail {
  // Strip leading bracketed groups such as "[SubsPlease]" before tokenizing.
  const cleaned = releaseTitle.replace(/^\s*(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\})\s*/u, '')
  const allTokens = tokenize(cleaned)
  const segments = cleaned
    .split(/[/|]+/u)
    .map((part) => tokenize(part))
    .filter((part) => part.length > 0)

  const candidate = tokenize(candidateTitle)
  if (segments.length === 0 || candidate.length === 0) return { strength: 0, yearMatches: false }

  const releaseYear = extractYear(allTokens, new Set(candidate))
  const yearMatches = releaseYear !== null && years.some((expected) => Math.abs(releaseYear - expected) <= 1)
  if (releaseYear !== null && years.length > 0 && !yearMatches) {
    return { strength: 0, yearMatches: false }
  }

  let best = 0
  for (const segment of segments) {
    const strength = matchesSegment(segment, candidate, kind)
    if (strength > best) best = strength
  }
  return { strength: best, yearMatches: best > 0 ? yearMatches : false }
}

/**
 * Matches a release against all known titles. `altYears` lets a TV season
 * accept both the show's pilot year and the season's own air year; without it
 * a four-year gap between them would demote perfectly good releases.
 *
 * Used as a *ranking signal*, never as a filter: every Prowlarr result stays
 * visible to the user.
 */
export function titleMatchDetails(
  releaseTitle: string,
  titles: string[],
  year: string | null,
  kind: MatchMediaKind,
  altYears: string[] = []
): TitleMatchDetail {
  const years = acceptableYears(year, altYears)
  let best: TitleMatchDetail = { strength: 0, yearMatches: false }
  for (const title of titles) {
    const detail = matchForTitle(releaseTitle, title, years, kind)
    const better =
      detail.strength > best.strength || (detail.strength === best.strength && detail.yearMatches && !best.yearMatches)
    if (better) best = detail
    if (best.strength === 2 && best.yearMatches) break
  }
  return best
}

export function titleMatchStrength(
  releaseTitle: string,
  titles: string[],
  year: string | null,
  kind: MatchMediaKind,
  altYears: string[] = []
): number {
  return titleMatchDetails(releaseTitle, titles, year, kind, altYears).strength
}
