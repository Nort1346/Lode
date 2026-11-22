// How a Prowlarr release title is compared against the TMDB title candidates.
// Movies can be checked against the release year (a remake with the same name
// is a different movie); TV cannot, because a season released years after the
// pilot still belongs to the same show.
export type MatchMediaKind = 'movie' | 'tv'
