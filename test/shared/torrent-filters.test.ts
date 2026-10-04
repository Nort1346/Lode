import { describe, it, expect } from 'vitest'
import {
  emptyFilters,
  hasActiveFilters,
  matchesFilters,
  collectFilterOptions,
  torrentKey,
  CAPTURE_TAGS,
  TAG_GROUP
} from '#shared/torrent-filters'
import type { TorrentFilterItem, TorrentFiltersState, TorrentIdentity } from '#shared/torrent-filters'

const item = (tags: string[], resolution: string | null = null): TorrentFilterItem => ({ tags, resolution })

const webDl1080 = item(['WEB-DL', 'x264'], '1080p')
const bluRay720 = item(['BluRay', 'x264'], '720p')
const cam720 = item(['CAM', 'x264'], '720p')
const noTags = item([])

describe('matchesFilters', () => {
  it('empty state matches everything, including capture sources', () => {
    const state = emptyFilters()
    expect(matchesFilters(webDl1080, state)).toBe(true)
    expect(matchesFilters(cam720, state)).toBe(true)
    expect(matchesFilters(noTags, state)).toBe(true)
  })

  it('OR within one group', () => {
    const state: TorrentFiltersState = { ...emptyFilters(), source: ['WEB-DL', 'BluRay'] }
    expect(matchesFilters(webDl1080, state)).toBe(true)
    expect(matchesFilters(bluRay720, state)).toBe(true)
    expect(matchesFilters(item(['HDTV']), state)).toBe(false)
  })

  it('AND between groups', () => {
    const state: TorrentFiltersState = { ...emptyFilters(), source: ['WEB-DL'], resolution: ['1080p'] }
    expect(matchesFilters(webDl1080, state)).toBe(true)
    // right source, wrong resolution
    expect(matchesFilters(item(['WEB-DL'], '720p'), state)).toBe(false)
    // right resolution, wrong source
    expect(matchesFilters(bluRay720, state)).toBe(false)
  })

  it('resolution group uses the item.resolution field, not tags', () => {
    const state: TorrentFiltersState = { ...emptyFilters(), resolution: ['1080p'] }
    expect(matchesFilters(webDl1080, state)).toBe(true)
    expect(matchesFilters(item([], '1080p'), state)).toBe(true)
    expect(matchesFilters(bluRay720, state)).toBe(false)
  })

  it('video and audio groups match their tags only', () => {
    const video: TorrentFiltersState = { ...emptyFilters(), video: ['HDR10'] }
    expect(matchesFilters(item(['WEB-DL', 'HDR10', 'x265']), video)).toBe(true)
    expect(matchesFilters(webDl1080, video)).toBe(false)

    const audio: TorrentFiltersState = { ...emptyFilters(), audio: ['DTS:X', 'Atmos'] }
    expect(matchesFilters(item(['WEB-DL', 'DTS:X']), audio)).toBe(true)
    expect(matchesFilters(item(['WEB-DL', 'Atmos']), audio)).toBe(true)
    expect(matchesFilters(webDl1080, audio)).toBe(false)
  })

  it('hide-capture toggle hides every capture tag', () => {
    const state: TorrentFiltersState = { ...emptyFilters(), hideCapture: true }
    for (const tag of CAPTURE_TAGS) {
      expect(matchesFilters(item([tag]), state)).toBe(false)
    }
    expect(matchesFilters(webDl1080, state)).toBe(true)
    expect(matchesFilters(bluRay720, state)).toBe(true)
  })

  it('capture toggle is an AND with group selections (item with both tags is hidden)', () => {
    const state: TorrentFiltersState = { ...emptyFilters(), source: ['BluRay'], hideCapture: true }
    expect(matchesFilters(item(['BluRay', 'CAM']), state)).toBe(false)
    expect(matchesFilters(bluRay720, state)).toBe(true)
  })

  it('tagless items only pass with no positive selections', () => {
    expect(matchesFilters(noTags, { ...emptyFilters(), source: ['WEB-DL'] })).toBe(false)
    expect(matchesFilters(noTags, { ...emptyFilters(), resolution: ['1080p'] })).toBe(false)
    expect(matchesFilters(noTags, emptyFilters())).toBe(true)
  })

  it('unknown/custom tags never satisfy a group', () => {
    const state: TorrentFiltersState = { ...emptyFilters(), source: ['WEB-DL'] }
    // "Proper" is an ungrouped "other" tag and must not match the source group
    expect(matchesFilters(item(['Proper']), state)).toBe(false)
  })

  it('filtering a list preserves the ranked order', () => {
    const list = [cam720, webDl1080, bluRay720, item(['WEB-DL']), noTags]
    const state: TorrentFiltersState = { ...emptyFilters(), source: ['WEB-DL'] }
    const filtered = list.filter((t) => matchesFilters(t, state))
    expect(filtered.map((t) => t.tags[0])).toEqual(['WEB-DL', 'WEB-DL'])
  })
})

describe('hasActiveFilters', () => {
  it('false for empty state, true for any selection or the toggle', () => {
    expect(hasActiveFilters(emptyFilters())).toBe(false)
    expect(hasActiveFilters({ ...emptyFilters(), source: ['WEB-DL'] })).toBe(true)
    expect(hasActiveFilters({ ...emptyFilters(), hideCapture: true })).toBe(true)
  })
})

describe('collectFilterOptions', () => {
  it('counts each option over the full list, grouped correctly', () => {
    const options = collectFilterOptions([
      item(['WEB-DL', 'x264', 'Atmos'], '1080p'),
      item(['WEB-DL', 'x265'], '1080p'),
      item(['BluRay', 'x264'], '720p'),
      item(['CAM'], null)
    ])
    const get = (group: string, tag: string) => options.find((o) => o.group === group && o.tag === tag)
    expect(get('source', 'WEB-DL')?.count).toBe(2)
    expect(get('source', 'BluRay')?.count).toBe(1)
    expect(get('source', 'CAM')?.count).toBe(1)
    expect(get('resolution', '1080p')?.count).toBe(2)
    expect(get('resolution', '720p')?.count).toBe(1)
    expect(get('video', 'x264')?.count).toBe(2)
    expect(get('video', 'x265')?.count).toBe(1)
    expect(get('audio', 'Atmos')?.count).toBe(1)
  })

  it('omits groups and tags that do not occur', () => {
    const options = collectFilterOptions([item(['WEB-DL'], '1080p')])
    expect(options.some((o) => o.group === 'audio')).toBe(false)
    expect(options.some((o) => o.group === 'video')).toBe(false)
    expect(options.map((o) => o.group)).toEqual(['source', 'resolution'])
  })

  it('ignores ungrouped "other" tags', () => {
    const options = collectFilterOptions([item(['WEB-DL', 'Proper', 'Repack'], '1080p')])
    expect(options.find((o) => o.tag === 'Proper')).toBeUndefined()
    expect(options.find((o) => o.tag === 'Repack')).toBeUndefined()
  })
})

describe('torrentKey', () => {
  const base: TorrentIdentity = {
    guid: null,
    magnetLink: null,
    downloadUrl: null,
    indexer: 'IndexerA',
    title: 'Some.Release.2024.1080p'
  }

  it('prefers guid, then magnet, then download url', () => {
    expect(torrentKey({ ...base, guid: 'g1', magnetLink: 'm1', downloadUrl: 'd1' })).toBe('g1')
    expect(torrentKey({ ...base, magnetLink: 'm1', downloadUrl: 'd1' })).toBe('m1')
    expect(torrentKey({ ...base, downloadUrl: 'd1' })).toBe('d1')
  })

  it('falls back to indexer + title when no identifier exists', () => {
    expect(torrentKey(base)).toBe('IndexerA:Some.Release.2024.1080p')
  })

  it('differs between indexers for the same title', () => {
    expect(torrentKey(base)).not.toBe(torrentKey({ ...base, indexer: 'IndexerB' }))
  })
})

describe('tag vocabulary', () => {
  it('every capture tag is mapped to the source group', () => {
    for (const tag of CAPTURE_TAGS) {
      expect(TAG_GROUP[tag]).toBe('source')
    }
  })

  it('covers the full parser display vocabulary (sources, video, audio)', () => {
    expect(Object.keys(TAG_GROUP).sort()).toEqual(
      [
        'Remux',
        'BluRay',
        'BDRip',
        'BRRip',
        'WEB-DL',
        'WEBRip',
        'WEB',
        'HDTV',
        'HDRip',
        'DVDRip',
        'DVD',
        'DVDScr',
        'SCR',
        'TC',
        'HDTS',
        'TS',
        'CAM',
        'HDCAM',
        'HDR10+',
        'HDR10',
        'DV',
        'SDR',
        'x264',
        'x265',
        'AV1',
        '10-bit',
        'XviD',
        'DTS-HD',
        'DTS:X',
        'DTS',
        'TrueHD',
        'Atmos',
        'DD+',
        'AAC'
      ].sort()
    )
  })
})
