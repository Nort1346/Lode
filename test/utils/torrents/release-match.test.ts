import { describe, it, expect } from 'vitest'
import { titleMatchDetails, titleMatchStrength } from '#server/utils/torrents/release-match'

describe('release-match/titleMatchStrength', () => {
  const movieCases: Array<{ release: string; titles: string[]; expected: number }> = [
    // The exact bug report: a short movie title used to pull in three totally
    // different films because Prowlarr matched any word in the query.
    {
      release: 'Brygada lalki / The Doll Squad (1973) [1080p] [BDRip] [h264] [AC3-wasik] [Lektor PL]',
      titles: ['The Doll', 'Lalka'],
      expected: 0
    },
    {
      release:
        "Koci domek Gabi: Film / Gabby's Dollhouse: The Movie (2025) [1080p] [WEB-DL] [x264] [AC3-KiT] [Dubbing PL]",
      titles: ['The Doll', 'Lalka'],
      expected: 0
    },
    {
      release: 'Lalkarz / The Dollmaker / Encantador (2025) [1080p] [WEB-DL] [H264] [AAC-FOX] [Lektor PL]',
      titles: ['The Doll', 'Lalka'],
      expected: 0
    },
    { release: 'The.Doll.2025.1080p.WEB-DL.x264-GROUP', titles: ['The Doll', 'Lalka'], expected: 2 },
    { release: 'The Doll (2025) [1080p] [BDRip] [Lektor PL]', titles: ['The Doll', 'Lalka'], expected: 2 },
    { release: 'Lalka / The Doll (2025) 1080p', titles: ['The Doll', 'Lalka'], expected: 2 },
    { release: 'The Doll 2 (2026) 1080p', titles: ['The Doll', 'Lalka'], expected: 0 },
    { release: 'The Doll 2027 1080p', titles: ['The Doll', 'Lalka'], expected: 0 },
    { release: 'Doll.2025.1080p.WEB-DL', titles: ['The Doll', 'Lalka'], expected: 1 },
    { release: 'Step.Up.2006.1080p', titles: ['The Doll', 'Lalka'], expected: 0 },
    { release: 'Dune.Part.Two.2024.1080p', titles: ['Dune: Part Two'], expected: 2 },
    { release: 'Dune.2021.2160p.BluRay', titles: ['Dune'], expected: 0 }
  ]

  for (const c of movieCases) {
    it(`rates "${c.release}" against "${c.titles.join('" / "')}" as ${c.expected}`, () => {
      expect(titleMatchStrength(c.release, c.titles, '2025', 'movie')).toBe(c.expected)
    })
  }

  it('accepts a release year one year off from TMDB', () => {
    expect(titleMatchStrength('The.Doll.2024.1080p', ['The Doll'], '2025', 'movie')).toBe(2)
  })

  it('handles diacritics, ampersands and apostrophes', () => {
    expect(titleMatchStrength('Mezczyzna.2025.1080p', ['Mężczyzna'], '2025', 'movie')).toBe(2)
    expect(titleMatchStrength('Fast.And.Furious.2025.1080p', ['Fast & Furious'], '2025', 'movie')).toBe(2)
    expect(titleMatchStrength('Gabbys.Dollhouse.2025.1080p', ["Gabby's Dollhouse"], '2025', 'movie')).toBe(2)
  })

  it('keeps single-word titles from matching inside longer words', () => {
    expect(titleMatchStrength('Up.2009.1080p', ['Up'], '2009', 'movie')).toBe(2)
    expect(titleMatchStrength('Backup.2009.1080p', ['Up'], '2009', 'movie')).toBe(0)
    expect(titleMatchStrength('It.2017.1080p', ['It'], '2017', 'movie')).toBe(2)
    expect(titleMatchStrength('It.Chapter.Two.2019.1080p', ['It'], '2017', 'movie')).toBe(0)
  })

  it('accepts both the pilot year and the season year for TV', () => {
    expect(titleMatchStrength('Show.S05E03.1080p', ['Show'], '2019', 'tv')).toBe(2)
    expect(titleMatchStrength('Show.1978.S01E01', ['Show'], '2005', 'tv')).toBe(0)
    // The 2005 revival is a different show from the 1963 original.
    expect(titleMatchStrength('Doctor.Who.2005.S01E01.1080p', ['Doctor Who'], '1963', 'tv')).toBe(0)
    expect(titleMatchStrength('Doctor.Who.2005.S01E01.1080p', ['Doctor Who'], '1963', 'tv', ['2005'])).toBe(2)
    // Polish trackers often keep the pilot year in every season's name.
    expect(titleMatchStrength('Show.2010.S05E01.1080p', ['Show'], '2012', 'tv', ['2012'])).toBe(0)
    expect(titleMatchStrength('Show.2010.S05E01.1080p', ['Show'], '2012', 'tv', ['2012', '2010'])).toBe(2)
  })

  it('does not read a year that is part of the title as the release year', () => {
    expect(titleMatchStrength('1917.2019.1080p.BluRay', ['1917'], '2019', 'movie')).toBe(2)
    expect(titleMatchStrength('2001.A.Space.Odyssey.1968.1080p', ['2001: A Space Odyssey'], '1968', 'movie')).toBe(2)
    expect(titleMatchDetails('1917.2019.1080p', ['1917'], '2019', 'movie')).toEqual({
      strength: 2,
      yearMatches: true
    })
    expect(titleMatchDetails('1917.2024.1080p', ['1917'], '2019', 'movie').yearMatches).toBe(false)
  })

  it('accepts TV naming with season words, locale tags and absolute numbers', () => {
    expect(titleMatchStrength('Show.Sezon.1.Odcinek.5.1080p', ['Show'], '2019', 'tv')).toBe(2)
    expect(titleMatchStrength('The.Office.US.S01E01.1080p', ['The Office'], '2005', 'tv')).toBe(2)
    expect(titleMatchStrength('[SubsPlease] One Piece - 1090 (1080p)', ['One Piece'], '1999', 'tv')).toBe(2)
    expect(titleMatchStrength('9-1-1.S01E01.1080p', ['9-1-1'], '2018', 'tv')).toBe(2)
    expect(titleMatchStrength('24.S01E01.1080p', ['24'], '2001', 'tv')).toBe(2)
  })

  it('does not confuse another show with the same episode number', () => {
    expect(titleMatchStrength('Other.Show.S01E01.1080p', ['Show'], '2019', 'tv')).toBe(0)
    expect(titleMatchStrength('Show.Clone.S01E01.1080p', ['Show'], '2019', 'tv')).toBe(0)
  })
})

describe('release-match/titleMatchDetails', () => {
  it('reports a year match only when the year is not part of the title', () => {
    expect(titleMatchDetails('Doll.2025.1080p', ['The Doll'], '2025', 'movie').yearMatches).toBe(true)
    expect(titleMatchDetails('The.Doll.Squad.1973', ['The Doll'], '2025', 'movie')).toEqual({
      strength: 0,
      yearMatches: false
    })
  })
})
