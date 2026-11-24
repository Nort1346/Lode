function cleanSeasons(seasons: number[]): number[] {
  return [...new Set(seasons)].filter((season) => Number.isInteger(season) && season > 0).sort((a, b) => a - b)
}

function isContiguous(seasons: number[]): boolean {
  return seasons.every((season, index) => index === 0 || season === (seasons[index - 1] ?? 0) + 1)
}

/** Human-readable season list: "1", "1-3" or "1, 3" for non-contiguous sets. */
export function seasonRangeLabel(seasons: number[]): string {
  const list = cleanSeasons(seasons)
  if (list.length === 0) return ''
  if (list.length === 1) return String(list[0])
  const first = list[0] ?? 0
  const last = list[list.length - 1] ?? 0
  return isContiguous(list) ? `${first}-${last}` : list.join(', ')
}

/** Placeholders for the localized episode-pack download label. */
export function episodePackLabelParts(
  seasons: number[],
  episodes: number[],
  fallbackSeason: number
): { from: number; to: number; episodeFrom: number; episodeTo: number } {
  const seasonList = cleanSeasons(seasons)
  const from = seasonList[0] ?? fallbackSeason
  const to = seasonList[seasonList.length - 1] ?? fallbackSeason
  const episodeList = [...new Set(episodes)]
    .filter((episode) => Number.isInteger(episode) && episode > 0)
    .sort((a, b) => a - b)
  const episodeFrom = episodeList[0] ?? 1
  const episodeTo = episodeList[episodeList.length - 1] ?? episodeFrom
  return { from, to, episodeFrom, episodeTo }
}

/** Download label for a pack, using the selected season when none is named. */
export function seasonPackDownloadLabel(name: string, seasons: number[], fallbackSeason: number): string {
  const list = cleanSeasons(seasons)
  if (list.length === 0) {
    return `${name} S${String(fallbackSeason).padStart(2, '0')} Season Pack`
  }
  const first = list[0] ?? 0
  const last = list[list.length - 1] ?? 0
  const range =
    list.length === 1
      ? `S${String(first).padStart(2, '0')}`
      : isContiguous(list)
        ? `S${String(first).padStart(2, '0')}-S${String(last).padStart(2, '0')}`
        : list.map((season) => `S${String(season).padStart(2, '0')}`).join('+')
  return `${name} ${range} Season Pack`
}
