const ALL_CATEGORIES = ['movies', 'series', 'games', 'music', 'books'] as const

export default defineEventHandler(() => {
  const config = useRuntimeConfig()

  const pathMap: Record<string, string> = {
    movies: config.savePathMovies,
    series: config.savePathSeries,
    games: config.savePathGames,
    books: config.savePathBooks,
    music: config.savePathMusic
  }

  return ALL_CATEGORIES.filter((key) => {
    const path = pathMap[key]
    return typeof path === 'string' && path.length > 0
  })
})
