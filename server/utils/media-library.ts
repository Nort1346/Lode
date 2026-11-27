import type { MediaServerItemDto } from '#server/types/media-library'
import type { LibraryItem, LibraryStats } from '#shared/library'
import { emptyLibraryStats } from '#shared/library'

// Tick-based runtimes are converted to whole minutes for the UI.
const TICKS_PER_MINUTE = 600_000_000

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : null
}

function yearOf(item: MediaServerItemDto): number | null {
  if (item.ProductionYear !== undefined && Number.isInteger(item.ProductionYear) && item.ProductionYear > 0) {
    return item.ProductionYear
  }
  const match = /^(\d{4})/.exec(item.PremiereDate ?? '')
  if (match?.[1] === undefined) return null
  const year = Number(match[1])
  return Number.isInteger(year) ? year : null
}

function imageUrl(
  id: string,
  type: 'Primary' | 'Backdrop',
  tag: string | undefined,
  index = 0,
  width = type === 'Primary' ? 400 : 1280
): string | null {
  if (tag === undefined || tag.length === 0) return null
  const params = new URLSearchParams({ type, tag, width: String(width) })
  if (type === 'Backdrop') params.set('index', String(index))
  return `/api/library/image/${encodeURIComponent(id)}?${params.toString()}`
}

function countOf(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null
  const count = Math.trunc(value)
  return count > 0 ? count : null
}

/**
 * Turns a media server item into the small, UI-ready shape the Library page uses.
 * Items that are not movies or series (folders, episodes, music) return null.
 */
export function mapMediaLibraryItem(raw: MediaServerItemDto): LibraryItem | null {
  const id = raw.Id?.trim()
  const title = raw.Name?.trim()
  const type = raw.Type === 'Movie' ? 'movie' : raw.Type === 'Series' ? 'series' : null
  if (id === undefined || id.length === 0 || title === undefined || title.length === 0 || type === null) {
    return null
  }

  const originalTitle = trimOrNull(raw.OriginalTitle)
  const runtimeTicks = raw.RunTimeTicks
  const runtimeMinutes =
    runtimeTicks !== undefined && Number.isFinite(runtimeTicks) && runtimeTicks > 0
      ? Math.max(1, Math.round(runtimeTicks / TICKS_PER_MINUTE))
      : null
  const genres = Array.from(
    new Set((raw.Genres ?? []).map((genre) => genre.trim()).filter((genre) => genre.length > 0))
  )

  return {
    id,
    type,
    title,
    originalTitle: originalTitle === title ? null : originalTitle,
    year: yearOf(raw),
    overview: raw.Overview?.trim() ?? '',
    rating: raw.CommunityRating !== undefined && Number.isFinite(raw.CommunityRating) ? raw.CommunityRating : null,
    officialRating: trimOrNull(raw.OfficialRating),
    runtimeMinutes,
    episodeCount: type === 'series' ? countOf(raw.RecursiveItemCount) : null,
    seasonCount: type === 'series' ? countOf(raw.ChildCount) : null,
    genres,
    posterUrl: imageUrl(id, 'Primary', raw.ImageTags?.Primary),
    backdropUrl: imageUrl(id, 'Backdrop', raw.BackdropImageTags?.[0]),
    addedAt: trimOrNull(raw.DateCreated)
  }
}

export function summarizeLibrary(items: LibraryItem[]): LibraryStats {
  const stats = emptyLibraryStats()
  const genres = new Set<string>()

  for (const item of items) {
    if (item.type === 'movie') stats.movies += 1
    else {
      stats.series += 1
      stats.episodes += item.episodeCount ?? 0
    }
    for (const genre of item.genres) genres.add(genre)
  }

  stats.genres = genres.size
  return stats
}
