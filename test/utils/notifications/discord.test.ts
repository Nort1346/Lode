import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetMovieDetails, mockGetTvShowDetails, mockGetImageUrl, mockReadFile, mockRestCtor, mockRestPost } =
  vi.hoisted(() => ({
    mockGetMovieDetails: vi.fn(),
    mockGetTvShowDetails: vi.fn(),
    mockGetImageUrl: vi.fn((path: string | null, size: string) =>
      path ? `https://image.tmdb.org/t/p/${size}${path}` : null
    ),
    mockReadFile: vi.fn(async () => Buffer.from('fallback-poster')),
    mockRestPost: vi.fn(async (..._args: unknown[]) => ({})),
    mockRestCtor: vi.fn(function () {
      return { setToken: vi.fn(() => ({ post: mockRestPost })) }
    })
  }))

vi.mock('#server/utils/tmdb', () => ({
  getMovieDetails: mockGetMovieDetails,
  getTvShowDetails: mockGetTvShowDetails,
  getImageUrl: mockGetImageUrl
}))

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile
}))

vi.mock('@discordjs/rest', () => ({
  REST: mockRestCtor
}))

vi.mock('#server/database/schema', () => ({
  settings: { key: 'key', value: 'value' }
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ key: val }))
}))

vi.mock('#server/utils/i18n-server', () => ({
  createT: () => (key: string) => key,
  DISCORD_LOCALE_OPTIONS: ['pl', 'en', 'de', 'fr', 'es', 'pt-BR']
}))

import {
  isDiscordMentionsEnabled,
  getDiscordLocale,
  fetchTmdbMeta,
  sendDownloadCompleteWebhook,
  notifyRequestPending
} from '#server/utils/notifications/discord'
import type { DownloadCompleteData, RequestPendingData } from '#server/types/discord'

const WEBHOOK_URL = 'https://discord.com/api/webhooks/12345/abcdef'

function stubSettingsDb(rows: Record<string, string | undefined>) {
  vi.stubGlobal('useDb', () => ({
    select: () => ({
      from: () => ({
        where: (cond: { key: string }) => ({
          get: async () => (cond.key in rows ? { key: cond.key, value: rows[cond.key] } : undefined)
        })
      })
    })
  }))
}

function stubConfig(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal(
    'useRuntimeConfig',
    vi.fn(() => ({ discordWebhookUrl: WEBHOOK_URL, ...overrides }))
  )
}

function makeDownloadData(overrides: Partial<DownloadCompleteData> = {}): DownloadCompleteData {
  return {
    id: 'dl-1',
    label: 'My Movie',
    torrentName: 'My.Movie.2024.1080p.WEB-DL.x264-GROUP',
    savePath: 'movies',
    sizeBytes: 1_500_000_000,
    completedAt: '2026-01-01T00:00:00.000Z',
    username: 'user1',
    tmdbId: null,
    mediaType: null,
    discordId: null,
    ...overrides
  }
}

describe('notifications/discord', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ discordWebhookUrl: WEBHOOK_URL }))
    )
    stubSettingsDb({})
    mockGetMovieDetails.mockReset()
    mockGetTvShowDetails.mockReset()
    mockGetImageUrl.mockReset()
    mockGetImageUrl.mockImplementation((path: string | null, size: string) =>
      path ? `https://image.tmdb.org/t/p/${size}${path}` : null
    )
    mockReadFile.mockReset()
    mockReadFile.mockResolvedValue(Buffer.from('fallback-poster'))
    mockRestCtor.mockClear()
    mockRestPost.mockReset()
    mockRestPost.mockResolvedValue({})
  })

  describe('isDiscordMentionsEnabled', () => {
    it('returns true when the setting is "true"', async () => {
      stubSettingsDb({ discord_mentions_enabled: 'true' })

      await expect(isDiscordMentionsEnabled()).resolves.toBe(true)
    })

    it('returns false when the setting is missing or false', async () => {
      stubSettingsDb({})
      await expect(isDiscordMentionsEnabled()).resolves.toBe(false)

      stubSettingsDb({ discord_mentions_enabled: 'false' })
      await expect(isDiscordMentionsEnabled()).resolves.toBe(false)
    })
  })

  describe('getDiscordLocale', () => {
    it('returns the stored locale when it is valid', async () => {
      stubSettingsDb({ discord_locale: 'pl' })

      await expect(getDiscordLocale()).resolves.toBe('pl')
    })

    it('falls back to en for invalid or missing values', async () => {
      stubSettingsDb({ discord_locale: 'xx' })
      await expect(getDiscordLocale()).resolves.toBe('en')

      stubSettingsDb({})
      await expect(getDiscordLocale()).resolves.toBe('en')
    })
  })

  describe('fetchTmdbMeta', () => {
    it('builds metadata for a movie', async () => {
      stubSettingsDb({})
      mockGetMovieDetails.mockResolvedValue({
        title: 'Movie',
        overview: 'A movie',
        poster_path: '/p.jpg',
        backdrop_path: '/b.jpg',
        runtime: 120,
        genres: [{ id: 1, name: 'Drama' }],
        vote_average: 7.5,
        release_date: '2024-01-01'
      })

      const meta = await fetchTmdbMeta(42, 'movie')

      expect(meta).toEqual({
        title: 'Movie',
        overview: 'A movie',
        posterUrl: 'https://image.tmdb.org/t/p/w500/p.jpg',
        backdropUrl: 'https://image.tmdb.org/t/p/w1280/b.jpg',
        runtime: 120,
        genres: ['Drama'],
        voteAverage: 7.5,
        releaseDate: '2024-01-01'
      })
      expect(mockGetMovieDetails).toHaveBeenCalledWith(42, 'en')
    })

    it('builds metadata for a tv show with null runtime', async () => {
      stubSettingsDb({ discord_locale: 'pl' })
      mockGetTvShowDetails.mockResolvedValue({
        name: 'Show',
        overview: 'A show',
        poster_path: '/p.jpg',
        backdrop_path: null,
        genres: [{ id: 2, name: 'Comedy' }],
        vote_average: 8,
        first_air_date: '2023-05-05'
      })

      const meta = await fetchTmdbMeta(7, 'tv')

      expect(meta).toMatchObject({ title: 'Show', runtime: null, genres: ['Comedy'], releaseDate: '2023-05-05' })
      expect(mockGetTvShowDetails).toHaveBeenCalledWith(7, 'pl')
    })

    it('returns null for an unknown media type', async () => {
      stubSettingsDb({})

      await expect(fetchTmdbMeta(1, 'other')).resolves.toBeNull()
      expect(mockGetMovieDetails).not.toHaveBeenCalled()
      expect(mockGetTvShowDetails).not.toHaveBeenCalled()
    })

    it('returns null when the TMDB call fails', async () => {
      stubSettingsDb({})
      mockGetMovieDetails.mockRejectedValue(new Error('tmdb down'))

      await expect(fetchTmdbMeta(1, 'movie')).resolves.toBeNull()
    })
  })

  describe('sendDownloadCompleteWebhook', () => {
    it('returns early when the webhook URL is not configured', async () => {
      stubConfig({ discordWebhookUrl: '' })

      await expect(sendDownloadCompleteWebhook(makeDownloadData())).resolves.toBeUndefined()
      expect(mockRestPost).not.toHaveBeenCalled()
    })

    it('returns early when the webhook URL format is invalid', async () => {
      stubConfig({ discordWebhookUrl: 'https://discord.com/api/bad-format' })

      await expect(sendDownloadCompleteWebhook(makeDownloadData())).resolves.toBeUndefined()
      expect(mockRestCtor).not.toHaveBeenCalled()
    })

    it('posts the container and attaches the fallback poster when there is no TMDB metadata', async () => {
      stubSettingsDb({})

      await sendDownloadCompleteWebhook(makeDownloadData())

      expect(mockGetMovieDetails).not.toHaveBeenCalled()
      expect(mockReadFile).toHaveBeenCalled()
      expect(mockRestCtor).toHaveBeenCalledTimes(1)
      expect(mockRestPost).toHaveBeenCalledTimes(1)
      const [route, body] = mockRestPost.mock.calls[0] as unknown as [string, { files: unknown[] }]
      expect(route).toContain('webhooks/12345/')
      expect(body.files).toHaveLength(1)
    })

    it('uses the TMDB poster and metadata when available', async () => {
      stubSettingsDb({})
      mockGetMovieDetails.mockResolvedValue({
        title: 'Movie',
        overview: 'A movie',
        poster_path: '/p.jpg',
        backdrop_path: null,
        runtime: 120,
        genres: [{ id: 1, name: 'Drama' }],
        vote_average: 7.5,
        release_date: '2024-01-01'
      })

      await sendDownloadCompleteWebhook(makeDownloadData({ tmdbId: 42, mediaType: 'movie' }))

      expect(mockGetMovieDetails).toHaveBeenCalled()
      expect(mockReadFile).not.toHaveBeenCalled()
      const [, options] = mockRestPost.mock.calls[0] as unknown as [string, { files: unknown[] }]
      expect(options.files).toEqual([])
    })

    it('includes a user mention when mentions are enabled and a discordId exists', async () => {
      stubSettingsDb({ discord_mentions_enabled: 'true' })

      await sendDownloadCompleteWebhook(makeDownloadData({ discordId: '999' }))

      const [, options] = mockRestPost.mock.calls[0] as unknown as [string, { body: { components: unknown[] } }]
      expect(options.body.components.length).toBeGreaterThanOrEqual(2)
      const serialized = JSON.stringify(options.body.components[0])
      expect(serialized).toContain('<@999>')
    })

    it('skips the mention when mentions are disabled', async () => {
      stubSettingsDb({ discord_mentions_enabled: 'false' })

      await sendDownloadCompleteWebhook(makeDownloadData({ discordId: '999' }))

      const [, options] = mockRestPost.mock.calls[0] as unknown as [string, { body: { components: unknown[] } }]
      const serialized = JSON.stringify(options.body.components)
      expect(serialized).not.toContain('<@999>')
    })

    it('truncates very long descriptions', async () => {
      stubSettingsDb({})
      mockGetMovieDetails.mockResolvedValue({
        title: 'Movie',
        overview: 'x'.repeat(2500),
        poster_path: '/p.jpg',
        backdrop_path: null,
        runtime: null,
        genres: [],
        vote_average: null,
        release_date: null
      })

      await sendDownloadCompleteWebhook(makeDownloadData({ tmdbId: 42, mediaType: 'movie' }))

      const [, options] = mockRestPost.mock.calls[0] as unknown as [string, { body: { components: unknown[] } }]
      const serialized = JSON.stringify(options.body.components)
      expect(serialized).toContain('...')
      expect(serialized).not.toContain('x'.repeat(2500))
    })

    it('swallows webhook post failures', async () => {
      stubSettingsDb({})
      mockRestPost.mockRejectedValue(new Error('discord down'))

      await expect(sendDownloadCompleteWebhook(makeDownloadData())).resolves.toBeUndefined()
    })
  })

  describe('notifyRequestPending', () => {
    function makeRequestData(overrides: Partial<RequestPendingData> = {}): RequestPendingData {
      return {
        id: 'req-1',
        mediaType: 'movie',
        mediaId: 42,
        mediaTitle: 'Requested Movie',
        mediaPoster: null,
        username: 'user1',
        userNote: 'Please pick the best release',
        ...overrides
      }
    }

    it('returns early when the webhook URL is not configured', async () => {
      stubConfig({ discordWebhookUrl: '' })

      await expect(notifyRequestPending(makeRequestData())).resolves.toBeUndefined()
      expect(mockRestPost).not.toHaveBeenCalled()
    })

    it('returns early when the webhook URL format is invalid', async () => {
      stubConfig({ discordWebhookUrl: 'https://discord.com/api/bad' })

      await expect(notifyRequestPending(makeRequestData())).resolves.toBeUndefined()
      expect(mockRestCtor).not.toHaveBeenCalled()
    })

    it('posts the request with the user note', async () => {
      stubSettingsDb({})

      await notifyRequestPending(makeRequestData())

      expect(mockRestPost).toHaveBeenCalledTimes(1)
      const [, options] = mockRestPost.mock.calls[0] as unknown as [string, { body: { components: unknown[] } }]
      const serialized = JSON.stringify(options.body.components)
      expect(serialized).toContain('Requested Movie')
      expect(serialized).toContain('Please pick the best release')
    })

    it('omits the note line when userNote is empty', async () => {
      stubSettingsDb({})

      await notifyRequestPending(makeRequestData({ userNote: null }))

      const [, options] = mockRestPost.mock.calls[0] as unknown as [string, { body: { components: unknown[] } }]
      const serialized = JSON.stringify(options.body.components)
      expect(serialized).not.toContain('Please pick')
    })

    it('uses the TMDB title and poster when available', async () => {
      stubSettingsDb({})
      mockGetMovieDetails.mockResolvedValue({
        title: 'TMDB Title',
        overview: 'A movie',
        poster_path: '/p.jpg',
        backdrop_path: null,
        runtime: null,
        genres: [],
        vote_average: null,
        release_date: null
      })

      await notifyRequestPending(makeRequestData())

      const [, options] = mockRestPost.mock.calls[0] as unknown as [string, { body: { components: unknown[] } }]
      const serialized = JSON.stringify(options.body.components)
      expect(serialized).toContain('TMDB Title')
      expect(serialized).toContain('https://image.tmdb.org/t/p/w500/p.jpg')
    })

    it('swallows webhook post failures', async () => {
      stubSettingsDb({})
      mockRestPost.mockRejectedValue(new Error('discord down'))

      await expect(notifyRequestPending(makeRequestData())).resolves.toBeUndefined()
    })
  })
})
