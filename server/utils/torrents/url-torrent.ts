import { computeTorrentInfoHashes, hasUsableHash } from '#server/utils/torrents/info-hash'
import { extractMagnetInfoHashes } from '#server/utils/clients/qbittorrent'
import type { FetchedTorrent, MagnetInfoHashes, TorrentPayload } from '#server/types/torrent'

// Same cap as .torrent file uploads: a valid torrent descriptor is small,
// anything bigger cannot be a torrent file.
export const MAX_URL_TORRENT_BYTES = 5 * 1024 * 1024

/**
 * Reads the bounded torrent body of an already-fetched response and computes
 * its info hashes. Returns null when the body is missing, too large, too slow,
 * not a torrent file, or unparseable.
 */
async function readTorrentPayload(res: Response, timeoutMs: number): Promise<TorrentPayload | null> {
  const declaredLength = Number.parseInt(res.headers.get('content-length') ?? '', 10)
  if (!Number.isNaN(declaredLength) && declaredLength > MAX_URL_TORRENT_BYTES) return null

  const reader = res.body?.getReader()
  if (reader === undefined) return null

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const chunks = await Promise.race([
      readCapped(reader),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs)
      })
    ])
    if (chunks === null) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)))
    if (buffer.length === 0 || buffer[0] !== 0x64) return null
    try {
      return { buffer, hashes: computeTorrentInfoHashes(buffer) }
    } catch {
      return null
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    reader.releaseLock()
  }
}

/**
 * Reads torrent bytes from an already-fetched response (bounded) and computes
 * their info hashes. Purely best-effort: returns null when the body is
 * missing, too large, too slow, not a torrent file, or unparseable, so callers
 * can fall through to the live qBittorrent lookup without hashes (fail-open).
 */
export async function readTorrentHashesFromResponse(
  res: Response,
  timeoutMs = 10_000
): Promise<MagnetInfoHashes | null> {
  const payload = await readTorrentPayload(res, timeoutMs)
  return payload?.hashes ?? null
}

async function readCapped(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array[] | null> {
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    totalBytes += chunk.value.byteLength
    if (totalBytes > MAX_URL_TORRENT_BYTES) return null
    chunks.push(chunk.value)
  }
  return chunks
}

/**
 * Resolves a torrent URL server-side: returns the `.torrent` bytes (or the
 * magnet a redirect points to) plus their info hashes, so the caller can hand
 * the payload to qBittorrent instead of the URL. Returns null on any failure so
 * callers can fall back to passing the URL itself.
 *
 * Never follows redirects: the SSRF policy stays with the caller.
 */
export async function fetchTorrentFromUrl(url: string, timeoutMs = 10_000): Promise<FetchedTorrent | null> {
  let res: Response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      res = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'manual' })
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return null
  }

  try {
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') ?? ''
      if (!location.startsWith('magnet:')) return null
      const hashes = extractMagnetInfoHashes(location)
      // An unusable magnet is worse than the URL: let qBittorrent try itself.
      return hasUsableHash(hashes) ? { kind: 'magnet', magnet: location, hashes } : null
    }
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('text/html')) return null
    const payload = await readTorrentPayload(res, timeoutMs)
    return payload === null ? null : { kind: 'file', buffer: payload.buffer, hashes: payload.hashes }
  } catch {
    return null
  }
}
