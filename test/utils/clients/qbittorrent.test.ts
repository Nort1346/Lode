import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QBittorrentClient, extractMagnetHash, useQBittorrent } from '#server/utils/clients/qbittorrent'

const HASH = 'a'.repeat(40)
const MAGNET = `magnet:?xt=urn:btih:${HASH}`
const SHORT_MAGNET = `magnet:?xt=urn:btih:${'b'.repeat(32)}`

const mockFetch = vi.fn()

function okResponse(body: unknown = []) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => ''
  } as unknown as Response
}

function errorResponse(status: number, text: string) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text
  } as unknown as Response
}

async function settle(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('extractMagnetHash', () => {
  it('extracts and lowercases the btih hash', () => {
    expect(extractMagnetHash(`magnet:?xt=urn:btih:${HASH.toUpperCase()}`)).toBe(HASH)
  })

  it('returns null when no btih is present', () => {
    expect(extractMagnetHash('magnet:?xt=urn:btih:short')).toBeNull()
  })

  it('returns null for a short (non-40-char) hash', () => {
    expect(extractMagnetHash(SHORT_MAGNET)).toBeNull()
  })
})

describe('QBittorrentClient', () => {
  let client: QBittorrentClient

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    client = new QBittorrentClient('http://qb:8080', 'api-key')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('strips trailing slashes from the base url and sends the bearer token', async () => {
    const slashed = new QBittorrentClient('http://qb:8080///', 'secret')
    mockFetch.mockResolvedValueOnce(okResponse())

    await slashed.getRecentTorrents()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://qb:8080/api/v2/torrents/info?sort=added_on&reverse=true&limit=5',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' })
      })
    )
  })

  it('throws a descriptive error on a non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404, 'Not Found'))

    await expect(client.findTorrentByHash(HASH)).rejects.toThrow('qBittorrent API error 404: Not Found')
  })

  describe('addTorrent', () => {
    it('finds the torrent by hash on the first poll', async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse())
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 100, tags: 'u1' }]))

      const pending = client.addTorrent(MAGNET, '/save', 'movies', 'u1')
      await settle(2000)

      await expect(pending).resolves.toEqual({ hash: HASH, size: 100, tags: 'u1' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('returns the existing torrent when the add fails with 409', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(409, 'Conflict'))
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 10, tags: 'u1' }]))

      const result = await client.addTorrent(MAGNET, '/save', 'movies', 'u1')

      expect(result).toEqual({ hash: HASH, size: 10, tags: 'u1' })
    })

    it('throws when the torrent already exists but no hash match is found', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(409, 'Conflict')).mockResolvedValueOnce(okResponse([]))

      await expect(client.addTorrent(MAGNET, '/save', 'movies', 'u1')).rejects.toThrow(
        'Torrent already exists in qBittorrent'
      )
    })

    it('rethrows non-409 errors from the add request', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500, 'boom'))

      await expect(client.addTorrent(MAGNET, '/save', 'movies', 'u1')).rejects.toThrow(
        'qBittorrent API error 500: boom'
      )
    })

    it('returns null when the torrent is not found after all polls', async () => {
      mockFetch.mockResolvedValue(okResponse([]))

      const pending = client.addTorrent(MAGNET, '/save', 'movies', 'u1')
      await settle(6000)

      await expect(pending).resolves.toBeNull()
      expect(mockFetch).toHaveBeenCalledTimes(7)
    })

    it('finds the torrent by tag among recent torrents when the hash is unknown', async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse())
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 5, tags: 'u1' }]))

      const pending = client.addTorrent(SHORT_MAGNET, '/save', 'movies', 'u1')
      await settle(2000)

      await expect(pending).resolves.toEqual({ hash: HASH, size: 5, tags: 'u1' })
    })

    it('waits for the torrent size to become non-zero before returning', async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse())
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 0, tags: 'u1' }]))
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 0, tags: 'u1' }]))
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 500, tags: 'u1' }]))

      const pending = client.addTorrent(MAGNET, '/save', 'movies', 'u1')
      await settle(2000 + 3000 + 3000)

      await expect(pending).resolves.toEqual({ hash: HASH, size: 500, tags: 'u1' })
    })
  })

  describe('addTorrentFile', () => {
    it('adds the file and finds the torrent by tag', async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse())
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 9, tags: 'u2' }]))

      const pending = client.addTorrentFile(Buffer.from([1, 2, 3]), 'file.torrent', '/save', 'movies', 'u2')
      await settle(2000)

      await expect(pending).resolves.toEqual({ hash: HASH, size: 9, tags: 'u2' })
    })

    it('throws when the torrent already exists', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(409, 'Conflict'))

      await expect(client.addTorrentFile(Buffer.from([1]), 'file.torrent', '/save', 'movies', 'u2')).rejects.toThrow(
        'Torrent already exists in qBittorrent'
      )
    })
  })

  it('findTorrentByHash returns the first matching entry', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse([
        { hash: 'h1', size: 1 },
        { hash: 'h2', size: 2 }
      ])
    )

    await expect(client.findTorrentByHash(HASH)).resolves.toEqual({ hash: 'h1', size: 1 })
  })

  it('getUserTorrents encodes the tag in the query string', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([{ hash: 'h1' }]))

    await expect(client.getUserTorrents('user/1')).resolves.toEqual([{ hash: 'h1' }])
    expect(mockFetch).toHaveBeenCalledWith(
      'http://qb:8080/api/v2/torrents/info?tag=user%2F1&sort=added_on&reverse=true',
      expect.anything()
    )
  })

  it('getRecentTorrents limits the result to 5 entries', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([{ hash: 'h1' }]))

    await expect(client.getRecentTorrents()).resolves.toEqual([{ hash: 'h1' }])
    expect(mockFetch.mock.calls[0]?.[0]).toContain('limit=5')
  })

  it('getAllTorrents lists every torrent', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([{ hash: 'h1' }, { hash: 'h2' }]))

    await expect(client.getAllTorrents()).resolves.toEqual([{ hash: 'h1' }, { hash: 'h2' }])
  })

  it('getTorrentFiles returns the file list', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([{ path: '/a.mkv', size: 1 }]))

    await expect(client.getTorrentFiles(HASH)).resolves.toEqual([{ path: '/a.mkv', size: 1 }])
  })

  it('pauseTorrent posts the hash', async () => {
    mockFetch.mockResolvedValue(okResponse())

    await client.pauseTorrent(HASH)

    expect(mockFetch).toHaveBeenCalledWith(
      'http://qb:8080/api/v2/torrents/pause',
      expect.objectContaining({ method: 'POST', body: `hashes=${HASH}` })
    )
  })

  it('resumeTorrent posts the hash', async () => {
    mockFetch.mockResolvedValue(okResponse())

    await client.resumeTorrent(HASH)

    expect(mockFetch).toHaveBeenCalledWith(
      'http://qb:8080/api/v2/torrents/resume',
      expect.objectContaining({ method: 'POST', body: `hashes=${HASH}` })
    )
  })

  it('deleteTorrent posts the hash and the deleteFiles flag', async () => {
    mockFetch.mockResolvedValue(okResponse())

    await client.deleteTorrent(HASH, true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://qb:8080/api/v2/torrents/delete',
      expect.objectContaining({ body: `hashes=${HASH}&deleteFiles=true` })
    )

    await client.deleteTorrent(HASH)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://qb:8080/api/v2/torrents/delete',
      expect.objectContaining({ body: `hashes=${HASH}&deleteFiles=false` })
    )
  })

  it('moveToTop is a no-op for an empty list', async () => {
    await client.moveToTop([])

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('moveToTop joins multiple hashes with a pipe', async () => {
    mockFetch.mockResolvedValue(okResponse())

    await client.moveToTop(['h1', 'h2'])

    expect(mockFetch).toHaveBeenCalledWith(
      'http://qb:8080/api/v2/torrents/topPrio',
      expect.objectContaining({ method: 'POST', body: 'hashes=h1|h2' })
    )
  })
})

describe('useQBittorrent', () => {
  it('returns a cached singleton built from the runtime config', async () => {
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ qbittorrentUrl: 'http://qb:8080/', qbittorrentApiKey: 'secret' }))
    )

    const first = useQBittorrent()
    const second = useQBittorrent()

    expect(first).toBe(second)
    expect(first).toBeInstanceOf(QBittorrentClient)
  })
})
