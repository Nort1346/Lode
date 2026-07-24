import { searchMovies, searchTvShows, getImageUrl } from '#server/utils/tmdb'
import type { AutocompleteSuggestion } from '#server/types/browse'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const type = typeof query.type === 'string' ? query.type : 'all'
  const locale = typeof query.locale === 'string' ? query.locale : 'en'

  if (q.length < 2) {
    return { suggestions: [] }
  }

  const candidates: AutocompleteSuggestion[] = []

  try {
    if (type === 'all' || type === 'movie') {
      const movieResults = await searchMovies(q, 1, locale)
      for (const m of movieResults.results.slice(0, 5)) {
        if (m.title.toLowerCase() === q.toLowerCase()) continue
        candidates.push({
          id: m.id,
          title: m.title,
          type: 'movie',
          posterUrl: getImageUrl(m.poster_path, 'w92'),
          year: m.release_date?.slice(0, 4) ?? ''
        })
      }
    }

    if (type === 'all' || type === 'tv') {
      const tvResults = await searchTvShows(q, 1, locale)
      for (const t of tvResults.results.slice(0, 5)) {
        if (t.name.toLowerCase() === q.toLowerCase()) continue
        candidates.push({
          id: t.id,
          title: t.name,
          type: 'tv',
          posterUrl: getImageUrl(t.poster_path, 'w92'),
          year: t.first_air_date?.slice(0, 4) ?? ''
        })
      }
    }
  } catch {
    return { suggestions: [] }
  }

  candidates.sort((a, b) => b.year.localeCompare(a.year))

  return { suggestions: candidates.slice(0, 5) }
})
