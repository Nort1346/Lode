import type {
  TorrentFile,
  QBitTorrent,
  MagnetInfoHashes,
  TorrentAddOutcome,
  ShareLimitAction
} from '#server/types/torrent'
import { COMPLETED_STATES } from '#server/types/torrent'
import { createLogger } from '#server/utils/logger'

const log = createLogger('QBittorrent')

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// Decodes an unpadded RFC 4648 base32 string (32 chars = 20-byte v1 hash,
// 52 chars = 32-byte v2 hash) to lowercase hex. Returns null when invalid.
function base32ToHex(input: string): string | null {
  const chars = input.toUpperCase().replace(/=+$/, '')
  if (chars.length !== 32 && chars.length !== 52) return null
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of chars) {
    const index = BASE32_ALPHABET.indexOf(ch)
    if (index === -1) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((value >> bits) & 0xff)
    }
  }
  // 52-char encodings leave 4 unused trailing bits, which must be zero
  if (bits !== 0 && (bits > 4 || (value & ((1 << bits) - 1)) !== 0)) return null
  return Buffer.from(bytes).toString('hex')
}

// Extracts all info hashes from a magnet link's xt=urn:btih: entries.
// Accepts 40-char hex (v1), 64-char hex (v2) and base32 (32 chars = v1, 52 = v2).
export function extractMagnetInfoHashes(magnetUrl: string): MagnetInfoHashes {
  const result: MagnetInfoHashes = { v1: null, v2: null }
  for (const match of magnetUrl.matchAll(/urn:btih:([a-zA-Z0-9]+)/g)) {
    const raw = match[1]
    if (raw === undefined) continue
    const lowered = raw.toLowerCase()
    if (result.v1 === null && /^[a-f0-9]{40}$/.test(lowered)) {
      result.v1 = lowered
      continue
    }
    if (result.v2 === null && /^[a-f0-9]{64}$/.test(lowered)) {
      result.v2 = lowered
      continue
    }
    const hex = base32ToHex(raw)
    if (hex === null) continue
    if (hex.length === 40 && result.v1 === null) result.v1 = hex
    if (hex.length === 64 && result.v2 === null) result.v2 = hex
  }
  return result
}

// The primary torrent identifier as qBittorrent 5.0 reports it in `hash`:
// the v2 hash truncated to 20 bytes for v2/hybrid torrents, the v1 hash otherwise.
export function primaryTorrentHash(hashes: MagnetInfoHashes): string | null {
  if (hashes.v2 !== null) return hashes.v2.slice(0, 40)
  return hashes.v1
}
export function extractMagnetHash(magnetUrl: string): string | null {
  return primaryTorrentHash(extractMagnetInfoHashes(magnetUrl))
}

// Candidate torrent IDs for a /torrents/info?hashes= query. qBittorrent 5.0
// only matches 40-char hex IDs (v1 hash, or v2 hash truncated to 20 bytes);
// the full 64-char v2 hash is kept as an extra candidate for 4.x instances.
// Entries a given version cannot parse are simply ignored by it.
export function buildHashQueryCandidates(v1: string | null, v2: string | null): string[] {
  const candidates: string[] = []
  if (v1 !== null) candidates.push(v1)
  if (v2 !== null) {
    candidates.push(v2.slice(0, 40))
    if (v2.length === 64) candidates.push(v2)
  }
  return [...new Set(candidates)]
}

// A torrent is complete when nothing is left to download, regardless of state
// name (v5.0 renamed pausedUP/pausedDL to stoppedUP/stoppedDL), covering
// uploading, stalledUP, queuedUP, forcedUP, stoppedUP, checkingUP, etc.
export function isTorrentComplete(torrent: QBitTorrent): boolean {
  if (torrent.amount_left === 0) return true
  if (torrent.progress >= 1) return true
  if (COMPLETED_STATES.has(torrent.state)) return true
  return torrent.state === 'checkingUP'
}

export class QBittorrentClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey
  }

  private async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers as Record<string, string>),
        Authorization: `Bearer ${this.apiKey}`
      }
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`qBittorrent API error ${response.status}: ${text}`)
    }

    return response
  }

  // Best-effort lookup of an existing torrent. A failed lookup is not fatal:
  // it must not silently block downloads, the subsequent add will surface
  // any real error (and re-check on a 409 race).
  private async findExistingByHashes(hashes: MagnetInfoHashes): Promise<QBitTorrent | undefined> {
    const candidates = buildHashQueryCandidates(hashes.v1, hashes.v2)
    if (candidates.length === 0) return undefined
    try {
      return await this.findTorrentByHashes(candidates)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn(`torrent pre-check failed, proceeding with add: ${msg}`)
      return undefined
    }
  }

  async addTorrent(
    magnetLink: string,
    savePath: string,
    category: string,
    tags: string,
    knownHashes: MagnetInfoHashes | null = null
  ): Promise<TorrentAddOutcome> {
    const hashes = knownHashes ?? extractMagnetInfoHashes(magnetLink)

    // Pre-check: if the torrent is already in qBittorrent (seeding, complete
    // or still downloading) report it instead of starting a new download.
    const existing = await this.findExistingByHashes(hashes)
    if (existing !== undefined) {
      log.info(
        `pre-check: torrent already in qBittorrent: hash=${existing.hash} state=${existing.state} progress=${existing.progress}`
      )
      return { status: 'existing', complete: isTorrentComplete(existing), torrent: existing }
    }

    const formData = new URLSearchParams()
    formData.append('urls', magnetLink)
    formData.append('savepath', savePath)
    formData.append('category', category)
    formData.append('tags', tags)
    formData.append('paused', 'false')

    try {
      await this.request('/api/v2/torrents/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('409')) throw err
      // Race: the torrent appeared between the pre-check and the add
      const raced = await this.findExistingByHashes(hashes)
      if (raced !== undefined) {
        log.info(`add returned 409, torrent already in qBittorrent: hash=${raced.hash} state=${raced.state}`)
        return { status: 'existing', complete: isTorrentComplete(raced), torrent: raced }
      }
      throw new Error('Torrent already exists in qBittorrent', { cause: err })
    }

    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const byHash = await this.findExistingByHashes(hashes)
      if (byHash !== undefined) {
        if (byHash.size === 0) {
          const waited = await this.waitForSize(byHash.hash, 10, 3000)
          if (waited !== undefined) return { status: 'added', torrent: waited }
        }
        return { status: 'added', torrent: byHash }
      }

      const torrents = await this.getRecentTorrents()
      const found = torrents.find((t) => t.hash !== undefined && t.tags === tags)
      if (found !== undefined) {
        if (found.size === 0) {
          const waited = await this.waitForSize(found.hash, 10, 3000)
          if (waited !== undefined) return { status: 'added', torrent: waited }
        }
        return { status: 'added', torrent: found }
      }
    }

    return { status: 'added', torrent: null }
  }

  async addTorrentFile(
    fileBuffer: ArrayBuffer | Buffer,
    fileName: string,
    savePath: string,
    category: string,
    tags: string,
    knownHashes: MagnetInfoHashes | null = null
  ): Promise<TorrentAddOutcome> {
    const existing = knownHashes !== null ? await this.findExistingByHashes(knownHashes) : undefined
    if (existing !== undefined) {
      log.info(
        `pre-check: torrent already in qBittorrent: hash=${existing.hash} state=${existing.state} progress=${existing.progress}`
      )
      return { status: 'existing', complete: isTorrentComplete(existing), torrent: existing }
    }

    const formData = new FormData()
    const arrayBuf =
      fileBuffer instanceof Buffer
        ? (fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as ArrayBuffer)
        : (fileBuffer as ArrayBuffer)
    formData.append('torrents', new Blob([arrayBuf]), fileName)
    formData.append('savepath', savePath)
    formData.append('category', category)
    formData.append('tags', tags)
    formData.append('paused', 'false')

    try {
      await this.request('/api/v2/torrents/add', {
        method: 'POST',
        body: formData
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('409')) throw err
      const raced = knownHashes !== null ? await this.findExistingByHashes(knownHashes) : undefined
      if (raced !== undefined) {
        log.info(`add returned 409, torrent already in qBittorrent: hash=${raced.hash} state=${raced.state}`)
        return { status: 'existing', complete: isTorrentComplete(raced), torrent: raced }
      }
      throw new Error('Torrent already exists in qBittorrent', { cause: err })
    }

    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const torrents = await this.getRecentTorrents()
      const found = torrents.find((t) => t.hash !== undefined && t.tags === tags)
      if (found !== undefined) {
        if (found.size === 0) {
          const waited = await this.waitForSize(found.hash, 10, 3000)
          if (waited !== undefined) return { status: 'added', torrent: waited }
        }
        return { status: 'added', torrent: found }
      }
    }

    return { status: 'added', torrent: null }
  }

  async findTorrentByHash(hash: string): Promise<QBitTorrent | undefined> {
    return this.findTorrentByHashes([hash])
  }

  async findTorrentByHashes(hashes: string[]): Promise<QBitTorrent | undefined> {
    if (hashes.length === 0) return undefined
    const response = await this.request(`/api/v2/torrents/info?hashes=${hashes.join('|')}`)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Response.json() returns any
    const data: QBitTorrent[] = await response.json()
    return data[0]
  }

  private async waitForSize(hash: string, maxAttempts: number, delayMs: number): Promise<QBitTorrent | undefined> {
    for (let j = 0; j < maxAttempts; j++) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const byHash = await this.findTorrentByHash(hash)
      if (byHash !== undefined && byHash.size > 0) return byHash
    }
    return undefined
  }

  async getUserTorrents(tag: string): Promise<QBitTorrent[]> {
    const response = await this.request(
      `/api/v2/torrents/info?tag=${encodeURIComponent(tag)}&sort=added_on&reverse=true`
    )
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Response.json() returns any
    const data: QBitTorrent[] = await response.json()
    return data
  }

  async getRecentTorrents(): Promise<QBitTorrent[]> {
    const response = await this.request('/api/v2/torrents/info?sort=added_on&reverse=true&limit=5')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Response.json() returns any
    const data: QBitTorrent[] = await response.json()
    return data
  }

  async getAllTorrents(): Promise<QBitTorrent[]> {
    const response = await this.request('/api/v2/torrents/info?sort=added_on&reverse=true')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Response.json() returns any
    const data: QBitTorrent[] = await response.json()
    return data
  }

  async pauseTorrent(hash: string) {
    await this.request('/api/v2/torrents/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${hash}`
    })
  }

  async resumeTorrent(hash: string) {
    await this.request('/api/v2/torrents/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${hash}`
    })
  }

  async deleteTorrent(hash: string, deleteFiles = false) {
    await this.request('/api/v2/torrents/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${hash}&deleteFiles=${deleteFiles}`
    })
  }

  async getTorrentFiles(hash: string): Promise<TorrentFile[]> {
    const response = await this.request(`/api/v2/torrents/files?hash=${hash}`)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Response.json() returns any
    const data: TorrentFile[] = await response.json()
    return data
  }

  async moveToTop(hashes: string[]): Promise<void> {
    if (hashes.length === 0) return
    await this.request('/api/v2/torrents/topPrio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${hashes.join('|')}`
    })
  }

  async setShareLimits(
    hash: string,
    ratioLimit: number,
    seedingTimeLimit: number,
    inactiveSeedingTimeLimit = 0,
    shareLimitAction: ShareLimitAction = 'Stop'
  ) {
    const body = new URLSearchParams()
    body.append('hashes', hash)
    body.append('ratioLimit', String(ratioLimit))
    body.append('seedingTimeLimit', String(seedingTimeLimit))
    body.append('inactiveSeedingTimeLimit', String(inactiveSeedingTimeLimit))
    body.append('shareLimitAction', shareLimitAction)
    await this.request('/api/v2/torrents/setShareLimits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })
  }
}

let _client: QBittorrentClient | null = null

export function useQBittorrent(): QBittorrentClient {
  if (!_client) {
    const config = useRuntimeConfig()
    _client = new QBittorrentClient(config.qbittorrentUrl as string, config.qbittorrentApiKey as string)
  }
  return _client
}
