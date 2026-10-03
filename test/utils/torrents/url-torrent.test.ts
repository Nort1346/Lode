import { describe, it, expect, vi } from 'vitest'

import {
  MAX_URL_TORRENT_BYTES,
  readTorrentHashesFromResponse,
  resolveUrlTorrentHashes
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

describe('resolveUrlTorrentHashes', () => {
  it('returns null when the fetch fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveUrlTorrentHashes('https://example.com/file.torrent')).resolves.toBeNull()

    vi.unstubAllGlobals()
  })

  it('returns null for a garbage response instead of throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveUrlTorrentHashes('https://example.com/file.torrent')).resolves.toBeNull()

    vi.unstubAllGlobals()
  })
  it('returns null for HTML responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('<!DOCTYPE html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveUrlTorrentHashes('https://example.com/page')).resolves.toBeNull()

    vi.unstubAllGlobals()
  })

  it('resolves hashes from torrent bytes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(torrentResponse(TINY_TORRENT))
    vi.stubGlobal('fetch', fetchMock)

    const hashes = await resolveUrlTorrentHashes('https://example.com/file.torrent')

    expect(hashes?.v1).toMatch(/^[a-f0-9]{40}$/)

    vi.unstubAllGlobals()
  })
})
