import { computeTorrentInfoHashes } from '#server/utils/torrents/info-hash'
import { extractMagnetInfoHashes } from '#server/utils/clients/qbittorrent'
import type { MagnetInfoHashes } from '#server/types/torrent'

// Same cap as .torrent file uploads: a valid torrent descriptor is small,
// anything bigger cannot be a torrent file.
export const MAX_URL_TORRENT_BYTES = 5 * 1024 * 1024

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
      return computeTorrentInfoHashes(buffer)
    } catch {
      return null
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    reader.releaseLock()
  }
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
 * Fetches a torrent URL (never following redirects, SSRF policy stays with
 * the caller) and resolves its info hashes. Returns null on any failure.
 */
export async function resolveUrlTorrentHashes(url: string, timeoutMs = 10_000): Promise<MagnetInfoHashes | null> {
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
      if (location.startsWith('magnet:')) return extractMagnetInfoHashes(location)
      return null
    }
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('text/html')) return null
    return await readTorrentHashesFromResponse(res, timeoutMs)
  } catch {
    return null
  }
}
