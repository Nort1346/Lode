import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUserSession = vi.fn()
const mockGetRouterParam = vi.fn()
const mockGetQuery = vi.fn()
const mockSetResponseHeaders = vi.fn()
const mockFormatSize = vi.fn()
const mockGetMovieDetails = vi.hoisted(() => vi.fn())
const mockUseProwlarr = vi.hoisted(() => vi.fn())
const mockRankTorrents = vi.hoisted(() => vi.fn())
const mockCheckDailyLimit = vi.hoisted(() => vi.fn())
const mockGetRankingConfig = vi.hoisted(() => vi.fn())

vi.stubGlobal('getUserSession', mockGetUserSession)
vi.stubGlobal('getRouterParam', mockGetRouterParam)
vi.stubGlobal('getQuery', mockGetQuery)
vi.stubGlobal('setResponseHeaders', mockSetResponseHeaders)
vi.stubGlobal('formatSize', mockFormatSize)

vi.mock('#server/utils/tmdb', () => ({
  getMovieDetails: mockGetMovieDetails
}))

vi.mock('#server/utils/prowlarr', () => ({
  useProwlarr: mockUseProwlarr,
  PROWLARR_CATEGORIES: { MOVIES: 2000, TV: 5000 }
}))

vi.mock('#server/utils/torrents/torrent-ranker', () => ({
  rankTorrents: mockRankTorrents
}))

vi.mock('#server/utils/limits', () => ({
  checkDailyLimit: mockCheckDailyLimit
}))

vi.mock('#server/utils/torrents/ranking-config', () => ({
  getRankingConfig: mockGetRankingConfig
}))

vi.mock('#server/utils/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}))

import handler from '#server/api/browse/movie/[id]/torrents-stream.get'

function ranked() {
  return {
    title: 'Ranked',
    size: 1000,
    seeders: 5,
    leechers: 1,
    indexer: 'Tr',
    magnetLink: 'magnet:x',
    downloadUrl: null,
    guid: null,
    score: 80,
    percentage: 80,
    recommended: true,
    parsed: { resolution: '1080p', source: 'WEB', language: 'EN' },
    isPrivate: false
  }
}

function makeEvent() {
  const writes: string[] = []
  let closeHandler: (() => void) | undefined
  const res = {
    write: vi.fn((chunk: string) => {
      writes.push(chunk)
      return true
    }),
    end: vi.fn()
  }
  const req = {
    on: vi.fn((name: string, cb: () => void) => {
      if (name === 'close') closeHandler = cb
    })
  }
  return {
    event: { node: { res, req } } as never,
    res,
    writes,
    close: () => closeHandler?.()
  }
}

function streamEvents(writes: string[]) {
  return writes.filter((w) => w.startsWith('data: ')).map((w) => JSON.parse(w.slice(6)) as Record<string, unknown>)
}

describe('browse/movie/[id]/torrents-stream.get', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUserSession.mockResolvedValue({ user: { id: 'u1' } })
    mockGetRouterParam.mockReturnValue('123')
    mockGetQuery.mockReturnValue({})
    mockCheckDailyLimit.mockResolvedValue({ reached: false, activeCount: 0, todayCount: 0, limit: 10 })
    mockGetRankingConfig.mockResolvedValue({})
    mockFormatSize.mockImplementation((bytes: number) => `${bytes} B`)
    mockRankTorrents.mockReturnValue([])
    mockUseProwlarr.mockReturnValue(null)
    mockGetMovieDetails.mockResolvedValue({
      id: 123,
      title: 'Movie',
      original_title: 'Movie',
      release_date: '2024-01-01'
    })
  })

  it('throws 401 when not authenticated, before opening the stream', async () => {
    mockGetUserSession.mockResolvedValue({ user: undefined })

    await expect(handler({} as never)).rejects.toThrow('401: Not authenticated')
    expect(mockSetResponseHeaders).not.toHaveBeenCalled()
  })

  it('throws 400 for an invalid movie id', async () => {
    mockGetRouterParam.mockReturnValue('abc')

    await expect(handler({} as never)).rejects.toThrow('400: Invalid movie ID')
  })

  it('streams a terminal limit error and ends the response', async () => {
    mockCheckDailyLimit.mockResolvedValue({ reached: true, activeCount: 3, todayCount: 9, limit: 10 })
    const { event, res, writes } = makeEvent()

    await handler(event)

    expect(mockSetResponseHeaders).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ 'Content-Type': 'text/event-stream' })
    )
    expect(streamEvents(writes)).toEqual([
      { type: 'error', code: 'limit', status: 429, data: { activeCount: 3, todayCount: 9, limit: 10 } }
    ])
    expect(res.end).toHaveBeenCalledTimes(1)
    expect(mockGetMovieDetails).not.toHaveBeenCalled()
  })

  it('streams a details error when TMDB fails', async () => {
    mockGetMovieDetails.mockRejectedValue(new Error('tmdb down'))
    const { event, res, writes } = makeEvent()

    await handler(event)

    expect(streamEvents(writes)).toEqual([{ type: 'error', code: 'details', status: 502 }])
    expect(res.end).toHaveBeenCalledTimes(1)
  })

  it('forwards ladder progress and ends with the ranked payload', async () => {
    const mockClient = {
      searchMovie: vi.fn(async (...args: unknown[]) => {
        const cb = args[5] as (e: Record<string, unknown>) => void
        cb({ kind: 'start', queries: 2 })
        cb({ kind: 'query', state: 'start', index: 1, total: 2, text: 'Movie 2024' })
        cb({ kind: 'query', state: 'done', index: 1, total: 2, text: 'Movie 2024', results: 3 })
        return [{ title: 'raw' }]
      })
    }
    mockUseProwlarr.mockReturnValue(mockClient)
    mockRankTorrents.mockReturnValue([ranked()])
    const { event, res, writes } = makeEvent()

    await handler(event)

    expect(streamEvents(writes)).toEqual([
      { type: 'start', queries: 2 },
      { type: 'query', state: 'start', index: 1, total: 2, text: 'Movie 2024' },
      { type: 'query', state: 'done', index: 1, total: 2, text: 'Movie 2024', results: 3 },
      {
        type: 'done',
        found: 1,
        data: { torrents: [expect.objectContaining({ title: 'Ranked', sizeFormatted: '1000 B' })] }
      }
    ])
    expect(res.end).toHaveBeenCalledTimes(1)
  })

  it('keeps the search running after a client disconnect and does not write to it', async () => {
    let release!: (results: Array<{ title: string }>) => void
    const mockClient = {
      searchMovie: vi.fn(
        () =>
          new Promise<Array<{ title: string }>>((resolve) => {
            release = resolve
          })
      )
    }
    mockUseProwlarr.mockReturnValue(mockClient)
    const { event, res, writes, close } = makeEvent()

    const pending = handler(event)
    await vi.waitFor(() => expect(mockClient.searchMovie).toHaveBeenCalledTimes(1))
    close()
    release([{ title: 'late' }])
    await pending

    expect(mockRankTorrents).toHaveBeenCalled()
    expect(writes.some((w) => w.includes('"done"'))).toBe(false)
    expect(res.end).not.toHaveBeenCalled()
  })
})
