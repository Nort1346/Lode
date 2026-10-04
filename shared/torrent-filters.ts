// Client-side release-tag filtering for the browse movie/TV pages. Pure and
// DOM-free so it is testable without a browser. Items are the ranked
// torrent/pack payloads (see BaseTorrentInfo in app/types/media.ts).

export type TorrentFilterGroup = 'source' | 'resolution' | 'video' | 'audio'

export interface TorrentFilterItem {
  tags: string[]
  resolution: string | null
}

export interface TorrentFiltersState {
  source: string[]
  resolution: string[]
  video: string[]
  audio: string[]
  // Extra AND condition: hide the "bad tier" capture sources entirely
  hideCapture: boolean
}

// tag -> filter group, covering the display vocabulary of parseTorrentTitle
// (server/utils/torrents/torrent-ranker.ts). Resolution is deliberately NOT
// here: it is a separate item field, not part of `tags`. Tags without a
// group (the parser's "other" tags: Proper, Repack, 3D, Multi, LINE, HC)
// are display-only and not filterable.
export const TAG_GROUP: Record<string, TorrentFilterGroup> = {
  Remux: 'source',
  BluRay: 'source',
  BDRip: 'source',
  BRRip: 'source',
  'WEB-DL': 'source',
  WEBRip: 'source',
  WEB: 'source',
  HDTV: 'source',
  HDRip: 'source',
  DVDRip: 'source',
  DVD: 'source',
  DVDScr: 'source',
  SCR: 'source',
  TC: 'source',
  HDTS: 'source',
  TS: 'source',
  CAM: 'source',
  HDCAM: 'source',
  'HDR10+': 'video',
  HDR10: 'video',
  DV: 'video',
  SDR: 'video',
  x264: 'video',
  x265: 'video',
  AV1: 'video',
  '10-bit': 'video',
  XviD: 'video',
  'DTS-HD': 'audio',
  'DTS:X': 'audio',
  DTS: 'audio',
  TrueHD: 'audio',
  Atmos: 'audio',
  'DD+': 'audio',
  AAC: 'audio'
}

// The capture tier the hide-capture toggle filters out (matches the red
// badge tier in BrowseReleaseTags)
export const CAPTURE_TAGS: readonly string[] = ['CAM', 'HDCAM', 'TS', 'HDTS', 'TC']

export function emptyFilters(): TorrentFiltersState {
  return { source: [], resolution: [], video: [], audio: [], hideCapture: false }
}

export function hasActiveFilters(state: TorrentFiltersState): boolean {
  return (
    state.source.length > 0 ||
    state.resolution.length > 0 ||
    state.video.length > 0 ||
    state.audio.length > 0 ||
    state.hideCapture
  )
}

// Filter semantics:
// - within one group the options are OR: an item passes a group when it
//   carries any of the selected options of that group
// - between groups it is AND: an item must pass every group that has at
//   least one selection
// - the capture toggle is an extra AND condition (item must carry none of
//   CAPTURE_TAGS)
// - an item with no tags at all therefore passes only when no group has a
//   selection and the capture toggle is off
export function matchesFilters(item: TorrentFilterItem, state: TorrentFiltersState): boolean {
  if (state.hideCapture === true && item.tags.some((tag) => CAPTURE_TAGS.includes(tag))) {
    return false
  }

  const groups: Array<{ selected: string[]; available: string[] }> = [
    { selected: state.source, available: item.tags.filter((tag) => TAG_GROUP[tag] === 'source') },
    { selected: state.resolution, available: item.resolution !== null ? [item.resolution] : [] },
    { selected: state.video, available: item.tags.filter((tag) => TAG_GROUP[tag] === 'video') },
    { selected: state.audio, available: item.tags.filter((tag) => TAG_GROUP[tag] === 'audio') }
  ]

  return groups.every(
    (group) => group.selected.length === 0 || group.selected.some((value) => group.available.includes(value))
  )
}

export interface TorrentFilterOption {
  group: TorrentFilterGroup
  tag: string
  count: number
}

// Options + occurrence counts over the FULL loaded list (faceted style: the
// counts do not shrink while the user narrows other groups). Order within a
// group follows first appearance in the (already ranked) list.
export function collectFilterOptions(items: TorrentFilterItem[]): TorrentFilterOption[] {
  const byGroup: Record<TorrentFilterGroup, Map<string, number>> = {
    source: new Map(),
    resolution: new Map(),
    video: new Map(),
    audio: new Map()
  }
  const bump = (group: TorrentFilterGroup, tag: string): void => {
    const map = byGroup[group]
    map.set(tag, (map.get(tag) ?? 0) + 1)
  }
  for (const item of items) {
    for (const tag of item.tags) {
      const group = TAG_GROUP[tag]
      if (group !== undefined) bump(group, tag)
    }
    if (item.resolution !== null) bump('resolution', item.resolution)
  }

  const order: TorrentFilterGroup[] = ['source', 'resolution', 'video', 'audio']
  const result: TorrentFilterOption[] = []
  for (const group of order) {
    for (const [tag, count] of byGroup[group].entries()) {
      result.push({ group, tag, count })
    }
  }
  return result
}
