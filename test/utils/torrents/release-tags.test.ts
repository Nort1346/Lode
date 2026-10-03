import { describe, it, expect } from 'vitest'
import { parseTorrentTitle, SOURCE_TAGS, CODEC_TAGS } from '#server/utils/torrents/torrent-ranker'

interface TagCase {
  title: string
  tags: string[]
  resolution?: string | null
  source?: string | null
}

// Table of real-looking release names. Covers: separator variants (". _ - :"),
// alias forms (WEB.DL / WEB-DL / WEB DL / WEBDL), false positives (titles like
// "Cam", "Webster", "24K", groups like YTS, DTS audio vs TS source), the
// best-source-wins conflict rule, and the year/resolution anchor for
// ambiguous capture tags (CAM/TS/TC/SCR).
const cases: TagCase[] = [
  // Basic sources
  { title: 'Movie.2024.1080p.BluRay.x264-GROUP', tags: ['BluRay', 'x264'], resolution: '1080p', source: 'bluray' },
  { title: 'Movie.2024.2160p.BluRay.Remux.DV.HDR10+.TrueHD.Atmos-GRP', tags: ['Remux', 'BluRay', 'HDR10+', 'DV', 'TrueHD', 'Atmos'], resolution: '2160p', source: 'remux' },
  { title: 'Movie.2024.1080p.BDRip.x264-GRP', tags: ['BDRip', 'x264'], resolution: '1080p', source: 'bdrip' },
  { title: 'Movie.2024.1080p.BRRip.x264-GRP', tags: ['BRRip', 'x264'], resolution: '1080p', source: 'brrip' },
  { title: 'Movie.2024.1080p.WEBRip.AAC-GROUP', tags: ['WEBRip', 'AAC'], resolution: '1080p', source: 'webrip' },
  { title: 'Movie.2024.720p.HDTV.x264-GROUP', tags: ['HDTV', 'x264'], resolution: '720p', source: 'hdtv' },
  { title: 'Movie.2003.576p.DVDRip.x264-GRP', tags: ['DVDRip', 'x264'], resolution: '576p', source: 'dvdrip' },
  { title: 'Movie.2005.480p.DVD.xvid-GRP', tags: ['DVD', 'XviD'], resolution: '480p', source: 'dvd' },
  { title: 'Movie.2024.1080p.HDCAM.x264-GRP', tags: ['HDCAM', 'x264'], resolution: '1080p', source: 'hdcam' },
  { title: 'Movie.2024.1080p.HDTS.x264-GRP', tags: ['HDTS', 'x264'], resolution: '1080p', source: 'hdts' },
  { title: 'Show.S02E01.720p.TELESYNC.x264-GROUP', tags: ['TS', 'x264'], resolution: '720p', source: 'ts' },
  { title: 'Movie.2024.1080p.SCREENER.x264-GRP', tags: ['SCR', 'x264'], resolution: '1080p', source: 'scr' },
  { title: 'Movie.2024.720p.DVD.SCR.x264-GRP', tags: ['DVDScr', 'x264'], resolution: '720p', source: 'dvdscr' },
  { title: 'Movie.2024.720p.TC.x264-GROUP', tags: ['TC', 'x264'], resolution: '720p', source: 'tc' },
  { title: 'Movie.2024.1080p.WEB.x264-GRP', tags: ['WEB', 'x264'], resolution: '1080p', source: 'web' },

  // WEB-DL separator and alias variants
  { title: 'Movie.2024.2160p.WEB-DL.x265.DV.10bit.Atmos-GRP', tags: ['WEB-DL', 'DV', 'x265', '10-bit', 'Atmos'], resolution: '2160p', source: 'web-dl' },
  { title: 'Movie 2024 WEB DL 1080p x264 GROUP', tags: ['WEB-DL', 'x264'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.WEBDL.1080p.x264-GRP', tags: ['WEB-DL', 'x264'], resolution: '1080p', source: 'webdl' },
  { title: 'Movie.2024.UHD.WEB-DL.x265-GRP', tags: ['WEB-DL', 'x265'], resolution: '2160p', source: 'web-dl' },
  { title: 'Movie.2024.8K.WEB-DL.AV1-GRP', tags: ['WEB-DL', 'AV1'], resolution: '8k', source: 'web-dl' },

  // False positives that must NOT be detected
  { title: 'Cam.2018.1080p.BluRay.x264-GROUP', tags: ['BluRay', 'x264'], resolution: '1080p', source: 'bluray' },
  { title: 'The.WEBSTER.2021.1080p.WEBRip.AAC-GROUP', tags: ['WEBRip', 'AAC'], resolution: '1080p', source: 'webrip' },
  { title: '24K.Gold.2023.720p.HDTV-GROUP', tags: ['HDTV'], resolution: '720p', source: 'hdtv' },
  { title: 'Movie.2024.1080p.WEB-DL.x264-YTS', tags: ['WEB-DL', 'x264'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.1080p.WEB-DL.x264-TS', tags: ['WEB-DL', 'x264'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.1080p.WEB-DL.x264-CAMRIP', tags: ['WEB-DL', 'x264'], resolution: '1080p', source: 'web-dl' },
  // DTS audio must not parse as a TS/TC capture source
  { title: 'Movie.2024.1080p.DTS-HD.MA.TrueHD.Atmos-GROUP', tags: ['DTS-HD', 'TrueHD', 'Atmos'], resolution: '1080p', source: null },

  // Capture tags after the year/resolution anchor (legit), without anchor (episodes)
  { title: 'Show.S01E05.720p.CAM.x264-GROUP', tags: ['CAM', 'x264'], resolution: '720p', source: 'cam' },
  { title: 'Show.S01E05.CAM-GROUP', tags: ['CAM'], resolution: null, source: 'cam' },
  { title: 'Movie.2024.720p.CAM.x264-GROUP', tags: ['CAM', 'x264'], resolution: '720p', source: 'cam' },

  // Conflict: best source wins for scoring, both tags stay visible
  { title: 'Movie.2024.1080p.BluRay.CAM.x264-GROUP', tags: ['BluRay', 'CAM', 'x264'], resolution: '1080p', source: 'bluray' },

  // Video tags
  { title: 'Movie.2024.1080p.WEB-DL.HDR10.x264-GRP', tags: ['WEB-DL', 'HDR10', 'x264'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.1080p.WEB-DL.SDR.x264-GRP', tags: ['WEB-DL', 'SDR', 'x264'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.1080p.WEB-DL.HEVC.10bit-GRP', tags: ['WEB-DL', 'x265', '10-bit'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.1080p.WEB-DL.10-Bit.x264-GRP', tags: ['WEB-DL', 'x264', '10-bit'], resolution: '1080p', source: 'web-dl' },

  // Audio tags
  { title: 'Movie.2024.1080p.WEB-DL.DDP5.1.x264-GRP', tags: ['WEB-DL', 'x264', 'DD+'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.1080p.WEB-DL.EAC3.x264-GRP', tags: ['WEB-DL', 'x264', 'DD+'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.1080p.WEB-DL.DTS.X.x264-GRP', tags: ['WEB-DL', 'x264', 'DTS:X'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.1080p.WEB-DL.DTS.HD.MA-GRP', tags: ['WEB-DL', 'DTS-HD'], resolution: '1080p', source: 'web-dl' },

  // Other tags
  { title: 'Movie.2024.1080p.WEBRip.x264.PROPER-GRP', tags: ['WEBRip', 'x264', 'Proper'], resolution: '1080p', source: 'webrip' },
  { title: 'Movie.2024.1080p.WEB-DL.x264.REPACK-GRP', tags: ['WEB-DL', 'x264', 'Repack'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.1080p.BluRay.3D.x264-GRP', tags: ['BluRay', 'x264', '3D'], resolution: '1080p', source: 'bluray' },
  { title: 'Movie.2024.1080p.WEB-DL.MULTI.x264-GRP', tags: ['WEB-DL', 'x264', 'Multi'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.1080p.WEB-DL.LINE.x264-GRP', tags: ['WEB-DL', 'x264', 'LINE'], resolution: '1080p', source: 'web-dl' },
  { title: 'Movie.2024.720p.WEBRip.HC.x264-GRP', tags: ['WEBRip', 'x264', 'HC'], resolution: '720p', source: 'webrip' },

  // No tags at all
  { title: 'Some Random Movie Title', tags: [], resolution: null, source: null }
]

describe('release tag detection', () => {
  for (const c of cases) {
    it(`parses "${c.title}"`, () => {
      const parsed = parseTorrentTitle(c.title)
      expect(parsed.tags).toEqual(c.tags)
      expect(parsed.resolution).toBe(c.resolution ?? null)
      expect(parsed.source).toBe(c.source ?? null)
    })
  }
})

describe('tag vocabulary', () => {
  it('SOURCE_TAGS covers every source display tag', () => {
    expect(SOURCE_TAGS).toEqual([
      'Remux', 'BluRay', 'BDRip', 'BRRip', 'WEB-DL', 'WEBRip', 'WEB', 'HDTV', 'HDRip', 'DVDRip', 'DVDScr',
      'DVD', 'SCR', 'TC', 'HDTS', 'TS', 'CAM', 'HDCAM'
    ])
  })

  it('CODEC_TAGS covers the video codecs', () => {
    expect(CODEC_TAGS).toEqual(['x264', 'x265', 'AV1', 'XviD'])
  })
})

describe('custom config keys', () => {
  it('still matches admin-added resolution keys as whole tokens', () => {
    const config = {
      resolutions: { '2160p': 20, '4k': 20, '1080p': 40, '720p': 20, '480p': 5, '576p': 5, uhd: 15 },
      sources: { 'web-dl': 8 },
      languageProfiles: [],
      knownGroups: [],
      sizeThresholds: { movie: [], series: [], seasonPack: [] },
      titleRelevance: { wordWeight: 15, yearWeight: 10, fullTitleWeight: 10, penalty: -20 },
      recommendedCount: 3,
      weights: { resolution: 40, language: 30, seeders: 100, size: 20, source: 10, group: 5 }
    }
    const parsed = parseTorrentTitle('Movie.2024.UHD.WEB-DL.x265-GRP', config)
    // uhd is fixed vocabulary now, but a custom key must also work
    expect(parsed.resolution).toBe('2160p')
    const custom = parseTorrentTitle('Movie.2024.1080p.WEB-DL.x265-GRP', {
      ...config,
      resolutions: { '1080p': 40, qhd: 25 }
    })
    expect(custom.resolution).toBe('1080p')
    const qhd = parseTorrentTitle('Movie.2024.QHD.WEB-DL-GRP', {
      ...config,
      resolutions: { '1080p': 40, qhd: 25 }
    })
    expect(qhd.resolution).toBe('qhd')
  })
})
