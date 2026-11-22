// Minimal TMDB API v3 mock for E2E tests.
//
// Implements exactly the endpoints Lode's server calls (see
// server/utils/tmdb.ts and server/utils/health.ts) with a small set of
// deterministic fixtures. Run with: node e2e/mock-tmdb.ts [--port <port>]
// Prints "LISTENING <port>" once the server is ready.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { parseArgs } from 'node:util'

interface TmdbGenre {
  id: number
  name: string
}

interface TmdbMovie {
  id: number
  title: string
  original_title: string
  original_language: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
  vote_count: number
  runtime: number
  genres: TmdbGenre[]
  genre_ids: number[]
}

interface TmdbTvShow {
  id: number
  name: string
  original_name: string
  original_language: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  vote_average: number
  vote_count: number
  genres: TmdbGenre[]
  genre_ids: number[]
}

const MOVIES: TmdbMovie[] = [
  {
    id: 603,
    title: 'E2E Test Movie',
    original_title: 'E2E Test Movie',
    original_language: 'en',
    overview: 'A deterministic movie for end-to-end tests.',
    poster_path: null,
    backdrop_path: null,
    release_date: '2024-05-12',
    vote_average: 8.5,
    vote_count: 1234,
    runtime: 120,
    genres: [
      { id: 28, name: 'Action' },
      { id: 878, name: 'Science Fiction' }
    ],
    genre_ids: [28, 878]
  },
  {
    id: 604,
    title: 'E2E Second Movie',
    original_title: 'E2E Second Movie',
    original_language: 'en',
    overview: 'A second deterministic movie for end-to-end tests.',
    poster_path: null,
    backdrop_path: null,
    release_date: '2023-02-01',
    vote_average: 7.2,
    vote_count: 812,
    runtime: 105,
    genres: [{ id: 18, name: 'Drama' }],
    genre_ids: [18]
  }
]

const TV_SHOWS: TmdbTvShow[] = [
  {
    id: 703,
    name: 'E2E Test Show',
    original_name: 'E2E Test Show',
    original_language: 'en',
    overview: 'A deterministic TV show for end-to-end tests.',
    poster_path: null,
    backdrop_path: null,
    first_air_date: '2022-01-10',
    vote_average: 8.9,
    vote_count: 990,
    genres: [
      { id: 18, name: 'Drama' },
      { id: 10765, name: 'Sci-Fi & Fantasy' }
    ],
    genre_ids: [18, 10765]
  },
  {
    id: 704,
    name: 'E2E Second Show',
    original_name: 'E2E Second Show',
    original_language: 'en',
    overview: 'A second deterministic TV show for end-to-end tests.',
    poster_path: null,
    backdrop_path: null,
    first_air_date: '2021-06-05',
    vote_average: 6.8,
    vote_count: 410,
    genres: [{ id: 35, name: 'Comedy' }],
    genre_ids: [35]
  }
]

function trendingItem(item: TmdbMovie | TmdbTvShow, mediaType: 'movie' | 'tv'): Record<string, unknown> {
  if (mediaType === 'tv') {
    const show = item as TmdbTvShow
    return {
      media_type: 'tv',
      id: show.id,
      name: show.name,
      first_air_date: show.first_air_date,
      overview: show.overview,
      poster_path: null,
      backdrop_path: null,
      vote_average: show.vote_average
    }
  }
  const movie = item as TmdbMovie
  return {
    media_type: 'movie',
    id: movie.id,
    title: movie.title,
    release_date: movie.release_date,
    overview: movie.overview,
    poster_path: null,
    backdrop_path: null,
    vote_average: movie.vote_average
  }
}

function searchMatches<T extends { title?: string; name?: string }>(items: T[], field: 'title' | 'name', q: string): T[] {
  const needle = q.toLowerCase()
  return items.filter((item) => String(item[field] ?? '').toLowerCase().includes(needle))
}

const NOT_FOUND = { status: 404, body: { status_code: 34, status_message: 'The resource you requested could not be found.' } }

interface MockRoute {
  pattern: RegExp
  handler: (searchParams: URLSearchParams, segments: string[]) => unknown
}

const routes: MockRoute[] = [
  {
    pattern: /^\/configuration$/,
    handler: () => ({
      images: { poster: { hm_sizes: ['w92'] } },
      change_keys: [],
      primary_locales: ['en'],
      spoken_languages: [],
      genres: {}
    })
  },
  {
    pattern: /^\/trending\/all\/week$/,
    handler: () => ({
      page: 1,
      results: [
        trendingItem(MOVIES[0]!, 'movie'),
        trendingItem(TV_SHOWS[0]!, 'tv'),
        trendingItem(MOVIES[1]!, 'movie'),
        trendingItem(TV_SHOWS[1]!, 'tv')
      ]
    })
  },
  {
    pattern: /^\/movie\/popular$/,
    handler: () => ({ page: 1, results: MOVIES })
  },
  {
    pattern: /^\/tv\/popular$/,
    handler: () => ({ page: 1, results: TV_SHOWS })
  },
  {
    pattern: /^\/movie\/top_rated$/,
    handler: () => ({ page: 1, results: MOVIES })
  },
  {
    pattern: /^\/discover\/movie$/,
    handler: () => ({ page: 1, results: MOVIES })
  },
  {
    pattern: /^\/discover\/tv$/,
    handler: () => ({ page: 1, results: TV_SHOWS })
  },
  {
    pattern: /^\/search\/movie$/,
    handler: (searchParams) => ({ page: 1, results: searchMatches(MOVIES, 'title', searchParams.get('query') ?? '') })
  },
  {
    pattern: /^\/search\/tv$/,
    handler: (searchParams) => ({ page: 1, results: searchMatches(TV_SHOWS, 'name', searchParams.get('query') ?? '') })
  },
  {
    pattern: /^\/movie\/(\d+)$/,
    handler: (_searchParams, segments) => {
      const movie = MOVIES.find((m) => m.id === Number(segments[0]))
      if (!movie) return NOT_FOUND
      return { ...movie, external_ids: { imdb_id: `tt000006${String(movie.id).slice(-1)}` } }
    }
  },
  {
    pattern: /^\/tv\/(\d+)$/,
    handler: (_searchParams, segments) => {
      const show = TV_SHOWS.find((t) => t.id === Number(segments[0]))
      if (!show) return NOT_FOUND
      return {
        ...show,
        // The real /tv/{id} response embeds the season list; the app's
        // details handler iterates it, so it must be present.
        number_of_seasons: 2,
        number_of_episodes: 4,
        seasons: [
          {
            id: 1,
            season_number: 1,
            name: 'Season 1',
            overview: 'First deterministic season.',
            poster_path: null,
            air_date: show.first_air_date,
            episode_count: 2
          },
          {
            id: 2,
            season_number: 2,
            name: 'Season 2',
            overview: 'Second deterministic season.',
            poster_path: null,
            air_date: '2023-01-09',
            episode_count: 2
          }
        ],
        external_ids: { imdb_id: `tt000007${String(show.id).slice(-1)}` }
      }
    }
  },
  {
    pattern: /^\/tv\/(\d+)\/season\/(\d+)$/,
    handler: (_searchParams, segments) => {
      const showId = Number(segments[0])
      const seasonNumber = Number(segments[1])
      return {
        id: showId,
        season_number: seasonNumber,
        episode_count: 2,
        episodes: [
          {
            id: 1,
            season_number: seasonNumber,
            episode_number: 1,
            name: 'E2E Episode One',
            overview: 'First deterministic episode.',
            vote_average: 8.0,
            air_date: '2022-01-10',
            still_path: null
          },
          {
            id: 2,
            season_number: seasonNumber,
            episode_number: 2,
            name: 'E2E Episode Two',
            overview: 'Second deterministic episode.',
            vote_average: 7.5,
            air_date: '2022-01-17',
            still_path: null
          }
        ]
      }
    }
  },
  {
    pattern: /^\/(movie|tv)\/(\d+)\/images$/,
    handler: () => ({ posters: [], logos: [] })
  }
]

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')

  // The app's NUXT_TMDB_BASE_URL may or may not include the "/3" API prefix
  // (the real default is https://api.themoviedb.org/3), so accept both.
  const path = url.pathname.startsWith('/3/') ? url.pathname.slice(2) : url.pathname

  if (!path.startsWith('/')) {
    sendJson(res, 404, NOT_FOUND.body)
    return
  }

  for (const route of routes) {
    const match = route.pattern.exec(path)
    if (!match) continue

    const result = route.handler(url.searchParams, match.slice(1))
    const isNotFound = result === NOT_FOUND
    sendJson(res, isNotFound ? 404 : 200, isNotFound ? NOT_FOUND.body : result)
    console.log(`[mock-tmdb] ${req.method} ${url.pathname} -> ${isNotFound ? 404 : 200}`)
    return
  }

  sendJson(res, 404, NOT_FOUND.body)
  console.log(`[mock-tmdb] ${req.method} ${url.pathname} -> 404`)
})

const { values } = parseArgs({
  options: { port: { type: 'string', default: '0' } },
  allowPositionals: false
})

server.listen(Number(values.port), '127.0.0.1', () => {
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  console.log(`LISTENING ${port}`)
})
