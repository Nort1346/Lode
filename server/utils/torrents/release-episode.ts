import type { EpisodeInfo } from '#server/types/release-episode'

const UNKNOWN: EpisodeInfo = { kind: 'unknown', seasons: [], episodes: [], airDate: null }

const MAX_SEASON = 99
const MAX_EPISODE = 999
const MAX_ABSOLUTE = 1999
const MIN_YEAR = 1900
const MAX_YEAR = 2099

function toInt(token: string): number | null {
  if (!/^\d+$/.test(token)) return null
  const n = Number.parseInt(token, 10)
  return Number.isSafeInteger(n) ? n : null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Lowercase tokens split on scene separators. Dashes are separators, so `S01-S03` becomes `s01`, `s03`. */
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s._\-+[\](){}]+/)
    .filter((t) => t.length > 0)
}

function isYear(n: number): boolean {
  return n >= MIN_YEAR && n <= MAX_YEAR
}

function uniqSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function rangeList(from: number, to: number): number[] {
  const list: number[] = []
  for (let n = from; n <= to; n++) list.push(n)
  return list
}

function singleEpisodeToken(token: string): { season: number; episode: number } | null {
  const sMatch = /^s(\d{1,2})e(\d{1,3})$/.exec(token)
  if (sMatch !== null) {
    const season = Number.parseInt(sMatch[1] ?? '', 10)
    const episode = Number.parseInt(sMatch[2] ?? '', 10)
    if (season <= MAX_SEASON && episode >= 1 && episode <= MAX_EPISODE) return { season, episode }
    return null
  }
  // NxMM form (e.g. 1x02). The season cap rejects dimensions like 1920x1080.
  const xMatch = /^(\d{1,2})x(\d{1,3})$/.exec(token)
  if (xMatch !== null) {
    const season = Number.parseInt(xMatch[1] ?? '', 10)
    const episode = Number.parseInt(xMatch[2] ?? '', 10)
    if (season <= MAX_SEASON && episode >= 1 && episode <= MAX_EPISODE) return { season, episode }
  }
  return null
}

function multiEpisodeToken(token: string): { season: number; episodes: number[] } | null {
  // S01E01E02 / S01E01E02E03 glued forms
  const glued = /^s(\d{1,2})((?:e\d{1,3}){2,})$/.exec(token)
  if (glued !== null) {
    const season = Number.parseInt(glued[1] ?? '', 10)
    const parts = [...(glued[2] ?? '').matchAll(/e(\d{1,3})/g)].map((m) => Number.parseInt(m[1] ?? '', 10))
    if (season > MAX_SEASON || parts.length < 2 || parts.some((p) => p < 1 || p > MAX_EPISODE)) return null
    return { season, episodes: uniqSorted(parts) }
  }
  return null
}

function seasonToken(token: string): number | null {
  const sMatch = /^s(\d{1,2})$/.exec(token)
  if (sMatch !== null) {
    const season = Number.parseInt(sMatch[1] ?? '', 10)
    return season <= MAX_SEASON ? season : null
  }
  return null
}

function tailEpisodeToken(token: string): number | null {
  // Trailing `e03` left over after splitting `S01E01-E03` on the dash.
  const m = /^e(\d{1,3})$/.exec(token)
  if (m === null) return null
  const episode = Number.parseInt(m[1] ?? '', 10)
  return episode >= 1 && episode <= MAX_EPISODE ? episode : null
}

function keywordEpisodeToken(token: string): number | null {
  // ep12 / episode12 / odc12 / odcinek5 (anime + Polish daily-press styles)
  const m = /^(?:ep|episode|odc|odcinek)0*(\d{1,4})$/.exec(token)
  if (m === null) return null
  const episode = Number.parseInt(m[1] ?? '', 10)
  return episode >= 1 && episode <= MAX_ABSOLUTE && !isYear(episode) ? episode : null
}

/**
 * Single token-based implementation for season/episode detection in release
 * names. Everything is matched on whole tokens (case insensitive) or explicit
 * raw-string markers (dash/bracket episode numbers, dates) - never with naive
 * substring `includes()`, so years, resolutions (1080p/2160p) and codecs
 * (x264) can never be mistaken for episodes.
 */
export function parseEpisodeInfo(releaseName: string): EpisodeInfo {
  const lower = releaseName.toLowerCase()
  const tokens = tokenize(releaseName)

  const epTokens: Array<{ season: number; episode: number }> = []
  const multiRanges: Array<{ season: number; episodes: number[] }> = []
  const seasonTokens: number[] = []
  const keywordEpisodes: number[] = []
  let pendingSeason: number | null = null
  let pendingSeasonIdx = -2

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? ''

    // Two-token keyword forms: `season 1`, `sezon 1-2`, `episode 5`, `odc 12`.
    if (token === 'season' || token === 'sezon') {
      const a = toInt(tokens[i + 1] ?? '')
      const b = toInt(tokens[i + 2] ?? '')
      if (a !== null && a <= MAX_SEASON && b !== null && b <= MAX_SEASON && (tokens[i + 2] ?? '').length <= 2) {
        const from = Math.min(a, b)
        const to = Math.max(a, b)
        return {
          kind: 'multiseason-pack',
          seasons: rangeList(from, to),
          episodes: [],
          airDate: null
        }
      }
      if (a !== null && a <= MAX_SEASON) {
        seasonTokens.push(a)
        i++
        continue
      }
      continue
    }
    if (token === 'ep' || token === 'episode' || token === 'odc' || token === 'odcinek') {
      const n = toInt(tokens[i + 1] ?? '')
      if (n !== null && n >= 1 && n <= MAX_ABSOLUTE && !isYear(n)) keywordEpisodes.push(n)
      if (n !== null) i++
      continue
    }

    const multi = multiEpisodeToken(token)
    if (multi !== null) {
      multiRanges.push(multi)
      continue
    }

    const single = singleEpisodeToken(token)
    if (single !== null) {
      epTokens.push(single)
      // `S01E01-E03` splits into `s01e01`, `e03`: a trailing e-token within
      // two positions extends the range.
      const tail = tailEpisodeToken(tokens[i + 1] ?? '')
      if (tail !== null) {
        const from = Math.min(single.episode, tail)
        const to = Math.max(single.episode, tail)
        multiRanges.push({ season: single.season, episodes: rangeList(from, to) })
        epTokens.pop()
        i++
      }
      continue
    }

    const season = seasonToken(token)
    if (season !== null) {
      seasonTokens.push(season)
      pendingSeason = season
      pendingSeasonIdx = i
      continue
    }

    // A lone `s01` followed by `e02` (`Show.S01.E02`) is one episode.
    const tail = tailEpisodeToken(token)
    if (tail !== null && pendingSeason !== null && i - pendingSeasonIdx <= 1) {
      epTokens.push({ season: pendingSeason, episode: tail })
      seasonTokens.pop()
      pendingSeason = null
      continue
    }
    pendingSeason = null

    const kw = keywordEpisodeToken(token)
    if (kw !== null) keywordEpisodes.push(kw)
  }

  // Multi-episode ranges win over everything else.
  if (multiRanges.length > 0) {
    const seasons = uniqSorted(multiRanges.map((r) => r.season))
    if (seasons.length === 1) {
      const season = seasons[0] ?? 0
      const episodes = uniqSorted(multiRanges.flatMap((r) => r.episodes))
      return { kind: 'multi-episode', seasons: [season], episodes, airDate: null }
    }
    const from = seasons[0] ?? 0
    const to = seasons[seasons.length - 1] ?? 0
    return { kind: 'multiseason-pack', seasons: rangeList(from, to), episodes: [], airDate: null }
  }

  if (epTokens.length > 0) {
    const seasons = uniqSorted(epTokens.map((e) => e.season))
    const episodes = uniqSorted(epTokens.map((e) => e.episode))
    if (seasons.length === 1) {
      if (episodes.length === 1) {
        return { kind: 'episode', seasons, episodes, airDate: null }
      }
      return { kind: 'multi-episode', seasons, episodes, airDate: null }
    }
    return { kind: 'multiseason-pack', seasons, episodes: [], airDate: null }
  }

  if (seasonTokens.length > 0) {
    const seasons = uniqSorted(seasonTokens)
    if (seasons.length === 1) {
      return { kind: 'season-pack', seasons, episodes: [], airDate: null }
    }
    // `S01-S03` style packs imply every season in between.
    const from = seasons[0] ?? 0
    const to = seasons[seasons.length - 1] ?? 0
    return { kind: 'multiseason-pack', seasons: rangeList(from, to), episodes: [], airDate: null }
  }

  // Date-based (daily) releases: YYYY.MM.DD token triples or a YYYYMMDD token.
  for (let i = 0; i < tokens.length; i++) {
    const y = toInt(tokens[i] ?? '')
    if (y !== null && isYear(y)) {
      const m = toInt(tokens[i + 1] ?? '')
      const d = toInt(tokens[i + 2] ?? '')
      if (m !== null && d !== null && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return { kind: 'daily', seasons: [], episodes: [], airDate: `${y}-${pad2(m)}-${pad2(d)}` }
      }
    }
    const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(tokens[i] ?? '')
    if (compact !== null) {
      const y2 = Number.parseInt(compact[1] ?? '', 10)
      const m2 = Number.parseInt(compact[2] ?? '', 10)
      const d2 = Number.parseInt(compact[3] ?? '', 10)
      if (isYear(y2) && m2 >= 1 && m2 <= 12 && d2 >= 1 && d2 <= 31) {
        return { kind: 'daily', seasons: [], episodes: [], airDate: `${y2}-${pad2(m2)}-${pad2(d2)}` }
      }
    }
  }

  // Absolute numbering (anime): explicit markers only, so titles containing
  // bare numbers (e.g. `The 100`) never match. Markers are `ep`/`odc` keyword
  // forms collected above, or a dash/bracket wrapped number in the raw name
  // such as `- 1090 -` or `- 1090 (1080p)`. The trailing letter guard keeps
  // resolutions like `(1080p)` out.
  if (keywordEpisodes.length > 0) {
    return { kind: 'absolute', seasons: [], episodes: uniqSorted(keywordEpisodes), airDate: null }
  }
  const marked = /(?:^|[-([])\s*0*(\d{1,4})(?![0-9a-z])(?:$|[\s\-)\].])/.exec(lower)
  if (marked !== null) {
    const n = Number.parseInt(marked[1] ?? '', 10)
    if (n >= 1 && n <= MAX_ABSOLUTE && !isYear(n)) {
      return { kind: 'absolute', seasons: [], episodes: [n], airDate: null }
    }
  }

  // Complete-series packs without any season token.
  const hasComplete = tokens.includes('complete') || tokens.includes('full') || tokens.includes('kompletny')
  const hasSeriesWord =
    tokens.includes('series') || tokens.includes('serie') || tokens.includes('serial') || tokens.includes('collection')
  if (hasComplete && hasSeriesWord) {
    return { kind: 'complete-series', seasons: [], episodes: [], airDate: null }
  }

  // `Complete Season` / `Full Season` without a number: a pack of unknown season.
  if ((hasComplete || tokens.includes('all')) && (tokens.includes('season') || tokens.includes('sezon'))) {
    return { kind: 'season-pack', seasons: [], episodes: [], airDate: null }
  }

  return UNKNOWN
}

/**
 * Episode-bucket matcher used by the torrent search: only true single episodes
 * land under an episode. Multi-episode ranges are packs (see titleIsSeasonPack),
 * so picking E02 never silently matches a torrent holding E01-E03. Daily
 * releases carry air dates, not episode numbers, so they never match here.
 */
export function titleMatchesEpisode(title: string, seasonNumber: number, episodeNumber: number): boolean {
  const info = parseEpisodeInfo(title)
  if (info.kind === 'episode') {
    return info.seasons.includes(seasonNumber) && info.episodes.includes(episodeNumber)
  }
  if (info.kind === 'absolute') {
    return info.episodes.includes(episodeNumber)
  }
  return false
}

/**
 * Pack matcher used by the torrent search: anything spanning more than one
 * episode (season packs, multi-season packs, multi-episode ranges, complete
 * series) is a pack. A range matches each season it spans.
 */
export function titleIsSeasonPack(title: string, seasonNumber: number): boolean {
  const info = parseEpisodeInfo(title)
  if (info.kind === 'season-pack' || info.kind === 'multiseason-pack') {
    return info.seasons.length === 0 || info.seasons.includes(seasonNumber)
  }
  if (info.kind === 'multi-episode') {
    return info.seasons.includes(seasonNumber)
  }
  if (info.kind === 'complete-series') return true
  return false
}
