import { describe, it, expect, vi } from 'vitest'

import {
  MAX_URL_TORRENT_BYTES,
  fetchTorrentFromUrl,
  readTorrentHashesFromResponse
} from '#server/utils/torrents/url-torrent'

// Minimal valid bencoded torrent (single empty file) for hash computation.
const TINY_TORRENT = Buffer.from('d4:infod6:lengthi0e4:name3:fooe8:announce4:teste', 'utf-8')

function torrentResponse(body: BodyInit, headers: Record<string, string> = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/x-bittorrent', ...headers }
  })
}

describe('readTorrentHashesFromResponse', () => {
  it('computes hashes from valid torrent bytes', async () => {
    const hashes = await readTorrentHashesFromResponse(torrentResponse(TINY_TORRENT))

    expect(hashes).not.toBeNull()
    expect(hashes?.v1).toMatch(/^[a-f0-9]{40}$/)
  })

  it('returns null for a non-torrent first byte', async () => {
    await expect(
      readTorrentHashesFromResponse(torrentResponse(Buffer.from('<!DOCTYPE html>', 'utf-8')))
    ).resolves.toBeNull()
  })

  it('returns null for an empty body', async () => {
    await expect(readTorrentHashesFromResponse(torrentResponse(Buffer.alloc(0)))).resolves.toBeNull()
  })

  it('returns null without reading when content-length exceeds the cap', async () => {
    const res = torrentResponse(TINY_TORRENT, { 'content-length': String(MAX_URL_TORRENT_BYTES + 1) })

    await expect(readTorrentHashesFromResponse(res)).resolves.toBeNull()
  })

  it('returns null when the stream exceeds the cap mid-read', async () => {
    const big = Buffer.concat([Buffer.from('d'), Buffer.alloc(MAX_URL_TORRENT_BYTES, 0x61)])
    await expect(readTorrentHashesFromResponse(torrentResponse(big))).resolves.toBeNull()
  })

  it('returns null on timeout instead of hanging', async () => {
    const hanging = new Response(
      new ReadableStream({
        start() {
          // never enqueues, never closes
        }
      }),
      { status: 200, headers: { 'content-type': 'application/x-bittorrent' } }
    )

    await expect(readTorrentHashesFromResponse(hanging, 50)).resolves.toBeNull()
  }, 5000)
})

describe('fetchTorrentFromUrl', () => {
  const MAGNET = `magnet:?xt=urn:btih:${'b'.repeat(40)}&dn=Test`

  it('returns the .torrent bytes and hashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(torrentResponse(TINY_TORRENT))
    vi.stubGlobal('fetch', fetchMock)

    const fetched = await fetchTorrentFromUrl('https://example.com/file.torrent')

    expect(fetched?.kind).toBe('file')
    if (fetched?.kind !== 'file') throw new Error('expected a torrent file')
    expect(fetched.buffer.equals(TINY_TORRENT)).toBe(true)
    expect(fetched.hashes.v1).toMatch(/^[a-f0-9]{40}$/)

    vi.unstubAllGlobals()
  })

  it('returns the magnet a redirect points to', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: MAGNET } }))
    )

    const fetched = await fetchTorrentFromUrl('https://example.com/file.torrent')

    expect(fetched).toMatchObject({ kind: 'magnet', magnet: MAGNET, hashes: { v1: 'b'.repeat(40), v2: null } })

    vi.unstubAllGlobals()
  })

  it('returns null for a redirect to a non-magnet location', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://cdn.example/x' } }))
    )

    await expect(fetchTorrentFromUrl('https://example.com/file.torrent')).resolves.toBeNull()

    vi.unstubAllGlobals()
  })

  it('returns null for an unusable magnet redirect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'magnet:?dn=Test' } }))
    )

    await expect(fetchTorrentFromUrl('https://example.com/file.torrent')).resolves.toBeNull()

    vi.unstubAllGlobals()
  })

  it('returns null for HTML responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('<!DOCTYPE html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    )

    await expect(fetchTorrentFromUrl('https://example.com/page')).resolves.toBeNull()

    vi.unstubAllGlobals()
  })

  it('returns null for an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })))

    await expect(fetchTorrentFromUrl('https://example.com/file.torrent')).resolves.toBeNull()

    vi.unstubAllGlobals()
  })

  it('returns null when the fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    await expect(fetchTorrentFromUrl('https://example.com/file.torrent')).resolves.toBeNull()

    vi.unstubAllGlobals()
  })
})
