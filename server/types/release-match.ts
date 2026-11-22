// How a Prowlarr release title is compared against the TMDB title candidates.
// Movies can be checked against the release year (a remake with the same name
// is a different movie); TV cannot rely on the pilot year alone, because a
// season can air years later - the caller passes the season's year as an extra
// acceptable year instead.
export type MatchMediaKind = 'movie' | 'tv'

export interface TitleMatchDetail {
  // 2 = the title starts the release name, 1 = it matches without the leading
  // article, 0 = it is not this work.
  strength: number
  // Whether the release year matched one of the acceptable years. Used by the
  // ranker to award (and only award) the year relevance weight.
  yearMatches: boolean
}
