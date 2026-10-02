import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  QBittorrentClient,
  buildHashQueryCandidates,
  extractMagnetHash,
  extractMagnetInfoHashes,
  isTorrentComplete,
  primaryTorrentHash,
  useQBittorrent
} from '#server/utils/clients/qbittorrent'
import type { QBitTorrent } from '#server/types/torrent'

const HASH = 'a'.repeat(40)
const V2_HASH = 'c'.repeat(64)
const MAGNET = `magnet:?xt=urn:btih:${HASH}`
const BASE32_MAGNET = `magnet:?xt=urn:btih:${'VKVKVKVK'.repeat(4)}`
const BASE32_V2_MAGNET = 'magnet:?xt=urn:btih:WCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWCYA'
const SHORT_MAGNET = `magnet:?xt=urn:btih:${'b'.repeat(32)}`
const NO_HASH_MAGNET = 'magnet:?xt=urn:btih:invalid'

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

  it('returns null when the btih value is neither hex nor base32', () => {
    expect(extractMagnetHash('magnet:?xt=urn:btih:zz')).toBeNull()
  })
})

describe('extractMagnetInfoHashes', () => {
  it('extracts a v1 hex hash', () => {
    expect(extractMagnetInfoHashes(MAGNET)).toEqual({ v1: HASH, v2: null })
  })

  it('extracts a v2 hex hash', () => {
    expect(extractMagnetInfoHashes(`magnet:?xt=urn:btih:${V2_HASH}`)).toEqual({ v1: null, v2: V2_HASH })
  })

  it('extracts both hashes from a hybrid magnet', () => {
    expect(extractMagnetInfoHashes(`magnet:?xt=urn:btih:${V2_HASH}&tr=foo&xt=urn:btih:${HASH}`)).toEqual({
      v1: HASH,
      v2: V2_HASH
    })
  })

  it('decodes a 32-char base32 v1 hash', () => {
    expect(extractMagnetInfoHashes(BASE32_MAGNET)).toEqual({ v1: HASH, v2: null })
  })

  it('decodes a 52-char base32 v2 hash', () => {
    const result = extractMagnetInfoHashes(BASE32_V2_MAGNET)
    expect(result.v1).toBeNull()
    expect(result.v2).toMatch(/^[a-f0-9]{64}$/)
  })

  it('decodes a base32-encoded short magnet hash', () => {
    expect(extractMagnetInfoHashes(SHORT_MAGNET).v1).toMatch(/^[a-f0-9]{40}$/)
  })

  it('keeps the first occurrence per version', () => {
    const magnet = `magnet:?xt=urn:btih:${HASH}&xt=urn:btih:${'b'.repeat(32)}&xt=urn:btih:${'d'.repeat(40)}`
    expect(extractMagnetInfoHashes(magnet).v1).toBe(HASH)
  })
})

describe('primaryTorrentHash', () => {
  it('returns the truncated v2 hash when present', () => {
    expect(primaryTorrentHash({ v1: HASH, v2: V2_HASH })).toBe(V2_HASH.slice(0, 40))
  })

  it('falls back to the v1 hash', () => {
    expect(primaryTorrentHash({ v1: HASH, v2: null })).toBe(HASH)
  })

  it('returns null when no hash is present', () => {
    expect(primaryTorrentHash({ v1: null, v2: null })).toBeNull()
  })
})

describe('buildHashQueryCandidates', () => {
  it('returns only the v1 hash for v1 torrents', () => {
    expect(buildHashQueryCandidates(HASH, null)).toEqual([HASH])
  })

  it('returns no candidates when no hash is known', () => {
    expect(buildHashQueryCandidates(null, null)).toEqual([])
  })

  it('returns the truncated and full v2 hash for v2 torrents', () => {
    expect(buildHashQueryCandidates(null, V2_HASH)).toEqual([V2_HASH.slice(0, 40), V2_HASH])
  })

  it('deduplicates candidates', () => {
    const v2 = `${HASH}${'f'.repeat(24)}`
    expect(buildHashQueryCandidates(HASH, v2)).toEqual([HASH, v2])
  })
})

describe('isTorrentComplete', () => {
  const base: QBitTorrent = {
    hash: HASH,
    name: 'test',
    progress: 0,
    eta: 0,
    dlspeed: 0,
    dlspeed_avg: 0,
    upspeed: 0,
    size: 100,
    amount_left: 100,
    downloaded: 0,
    num_seeds: 0,
    num_complete: 0,
    num_leechs: 0,
    state: 'downloading',
    save_path: '/s',
    category: 'c',
    tags: '',
    added_on: 0,
    completion_on: 0
  }

  it('is complete when amount_left is 0', () => {
    expect(isTorrentComplete({ ...base, state: 'downloading', progress: 0.5, amount_left: 0 })).toBe(true)
  })

  it('is complete when progress reached 1', () => {
    expect(isTorrentComplete({ ...base, state: 'downloading', progress: 1, amount_left: 5 })).toBe(true)
  })

  it.each(['uploading', 'stalledUP', 'pausedUP', 'stoppedUP', 'queuedUP', 'forcedUP'])(
    'is complete in state %s',
    (state) => {
      expect(isTorrentComplete({ ...base, state })).toBe(true)
    }
  )

  it('is complete while checking an already-downloaded torrent', () => {
    expect(isTorrentComplete({ ...base, state: 'checkingUP' })).toBe(true)
  })

  it('is not complete while downloading', () => {
    expect(isTorrentComplete({ ...base, state: 'downloading', progress: 0.4, amount_left: 60 })).toBe(false)
  })

  it('is not complete while checking for download', () => {
    expect(isTorrentComplete({ ...base, state: 'checkingDL' })).toBe(false)
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
    it('returns the existing complete torrent from the pre-check without adding', async () => {
      const existing = { hash: HASH, size: 100, state: 'stoppedUP', progress: 1, amount_left: 0 }
      mockFetch.mockResolvedValueOnce(okResponse([existing]))

      const result = await client.addTorrent(MAGNET, '/save', 'movies', 'u1')

      expect(result).toEqual({ status: 'existing', complete: true, torrent: existing })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('returns the existing downloading torrent from the pre-check with complete=false', async () => {
      const existing = { hash: HASH, size: 100, state: 'downloading', progress: 0.4, amount_left: 60 }
      mockFetch.mockResolvedValueOnce(okResponse([existing]))

      const result = await client.addTorrent(MAGNET, '/save', 'movies', 'u1')

      expect(result).toEqual({ status: 'existing', complete: false, torrent: existing })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('skips the pre-check when no hash can be extracted and falls back to tag matching', async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse())
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 5, tags: 'u1' }]))

      const pending = client.addTorrent(NO_HASH_MAGNET, '/save', 'movies', 'u1')
      await settle(2000)

      await expect(pending).resolves.toEqual({ status: 'added', torrent: { hash: HASH, size: 5, tags: 'u1' } })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('finds the torrent by hash on the first poll', async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse([]))
        .mockResolvedValueOnce(okResponse())
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 100, tags: 'u1' }]))

      const pending = client.addTorrent(MAGNET, '/save', 'movies', 'u1')
      await settle(2000)

      await expect(pending).resolves.toEqual({ status: 'added', torrent: { hash: HASH, size: 100, tags: 'u1' } })
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('reports the existing torrent when the add fails with 409', async () => {
      const existing = { hash: HASH, size: 10, state: 'downloading', progress: 0.1, amount_left: 90 }
      mockFetch
        .mockResolvedValueOnce(okResponse([]))
        .mockResolvedValueOnce(errorResponse(409, 'Conflict'))
        .mockResolvedValueOnce(okResponse([existing]))

      const result = await client.addTorrent(MAGNET, '/save', 'movies', 'u1')

      expect(result).toEqual({ status: 'existing', complete: false, torrent: existing })
    })

    it('resolves the existing torrent by known hashes on 409 when the magnet has no extractable hash', async () => {
      const existing = { hash: HASH, size: 7, state: 'uploading', progress: 1, amount_left: 0 }
      mockFetch
        .mockResolvedValueOnce(okResponse([]))
        .mockResolvedValueOnce(errorResponse(409, 'Conflict'))
        .mockResolvedValueOnce(okResponse([existing]))

      const result = await client.addTorrent(NO_HASH_MAGNET, '/save', 'movies', 'u1', { v1: HASH, v2: null })

      expect(result).toEqual({ status: 'existing', complete: true, torrent: existing })
    })

    it('throws when the add fails with 409 but no hash match is found', async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse([]))
        .mockResolvedValueOnce(errorResponse(409, 'Conflict'))
        .mockResolvedValueOnce(okResponse([]))

      await expect(client.addTorrent(MAGNET, '/save', 'movies', 'u1')).rejects.toThrow(
        'Torrent already exists in qBittorrent'
      )
    })

    it('proceeds with the add when the pre-check itself fails', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500, 'pre-check down'))
        .mockResolvedValueOnce(okResponse())
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 100, tags: 'u1' }]))

      const pending = client.addTorrent(MAGNET, '/save', 'movies', 'u1')
      await settle(2000)

      await expect(pending).resolves.toEqual({ status: 'added', torrent: { hash: HASH, size: 100, tags: 'u1' } })
    })

    it('rethrows non-409 errors from the add request', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([])).mockResolvedValueOnce(errorResponse(500, 'boom'))

      await expect(client.addTorrent(MAGNET, '/save', 'movies', 'u1')).rejects.toThrow(
        'qBittorrent API error 500: boom'
      )
    })

    it('returns a null torrent when the torrent is not found after all polls', async () => {
      mockFetch.mockResolvedValue(okResponse([]))

      const pending = client.addTorrent(MAGNET, '/save', 'movies', 'u1')
      await settle(6000)

      await expect(pending).resolves.toEqual({ status: 'added', torrent: null })
      expect(mockFetch).toHaveBeenCalledTimes(8)
    })

    it('waits for the torrent size to become non-zero before returning', async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse([]))
        .mockResolvedValueOnce(okResponse())
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 0, tags: 'u1' }]))
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 0, tags: 'u1' }]))
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 500, tags: 'u1' }]))

      const pending = client.addTorrent(MAGNET, '/save', 'movies', 'u1')
      await settle(2000 + 3000 + 3000)

      await expect(pending).resolves.toEqual({ status: 'added', torrent: { hash: HASH, size: 500, tags: 'u1' } })
    })
  })

  describe('addTorrentFile', () => {
    it('adds the file and finds the torrent by tag', async () => {
      mockFetch
        .mockResolvedValueOnce(okResponse())
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 9, tags: 'u2' }]))

      const pending = client.addTorrentFile(Buffer.from([1, 2, 3]), 'file.torrent', '/save', 'movies', 'u2')
      await settle(2000)

      await expect(pending).resolves.toEqual({ status: 'added', torrent: { hash: HASH, size: 9, tags: 'u2' } })
    })

    it('returns the existing torrent from the pre-check when the hash is known', async () => {
      const existing = { hash: HASH, size: 9, state: 'stalledUP', progress: 1, amount_left: 0 }
      mockFetch.mockResolvedValueOnce(okResponse([existing]))

      const result = await client.addTorrentFile(Buffer.from([1, 2, 3]), 'file.torrent', '/save', 'movies', 'u2', {
        v1: HASH,
        v2: null
      })

      expect(result).toEqual({ status: 'existing', complete: true, torrent: existing })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('proceeds with the add when the pre-check fails', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500, 'pre-check down'))
        .mockResolvedValueOnce(okResponse())
        .mockResolvedValueOnce(okResponse([{ hash: HASH, size: 9, tags: 'u2' }]))

      const pending = client.addTorrentFile(Buffer.from([1, 2, 3]), 'file.torrent', '/save', 'movies', 'u2', {
        v1: HASH,
        v2: null
      })
      await settle(2000)

      await expect(pending).resolves.toEqual({ status: 'added', torrent: { hash: HASH, size: 9, tags: 'u2' } })
    })

    it('throws when the torrent already exists and no hash is known', async () => {
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

  it('findTorrentByHashes joins multiple hashes with a pipe', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([{ hash: 'h1' }]))

    await client.findTorrentByHashes(['h1', 'h2'])

    expect(mockFetch.mock.calls[0]?.[0]).toBe('http://qb:8080/api/v2/torrents/info?hashes=h1|h2')
  })

  it('findTorrentByHashes does not fetch for an empty list', async () => {
    await expect(client.findTorrentByHashes([])).resolves.toBeUndefined()

    expect(mockFetch).not.toHaveBeenCalled()
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

  it('setShareLimits posts zero limits with the Stop action to disable seeding', async () => {
    mockFetch.mockResolvedValue(okResponse())

    await client.setShareLimits(HASH, 0, 0, 0)

    expect(mockFetch).toHaveBeenCalledWith(
      'http://qb:8080/api/v2/torrents/setShareLimits',
      expect.objectContaining({
        method: 'POST',
        body: `hashes=${HASH}&ratioLimit=0&seedingTimeLimit=0&inactiveSeedingTimeLimit=0&shareLimitAction=Stop`
      })
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
