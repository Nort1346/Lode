import type { TorrentFile, QBitTorrent } from '#server/types/torrent'

function extractMagnetHash(magnetUrl: string): string | null {
  const match = magnetUrl.match(/btih:([a-fA-F0-9]{40})/i)
  const group = match?.[1]
  return group !== undefined ? group.toLowerCase() : null
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

  async addTorrent(magnetLink: string, savePath: string, category: string, tags: string): Promise<QBitTorrent | null> {
    const formData = new URLSearchParams()
    formData.append('urls', magnetLink)
    formData.append('savepath', savePath)
    formData.append('category', category)
    formData.append('tags', tags)
    formData.append('paused', 'false')

    const knownHash = extractMagnetHash(magnetLink)

    try {
      await this.request('/api/v2/torrents/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('409')) throw err
      if (knownHash !== null) {
        const existing = await this.findTorrentByHash(knownHash)
        if (existing !== undefined) return existing
      }
      throw new Error('Torrent already exists in qBittorrent', { cause: err })
    }

    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000))

      if (knownHash !== null) {
        const byHash = await this.findTorrentByHash(knownHash)
        if (byHash !== undefined) {
          if (byHash.size === 0) {
            const waited = await this.waitForSize(byHash.hash, 10, 3000)
            if (waited !== undefined) return waited
          }
          return byHash
        }
      }

      const torrents = await this.getRecentTorrents()
      const found = torrents.find((t) => t.hash !== undefined && t.tags === tags)
      if (found !== undefined) {
        if (found.size === 0) {
          const waited = await this.waitForSize(found.hash, 10, 3000)
          if (waited !== undefined) return waited
        }
        return found
      }
    }

    return null
  }

  async addTorrentFile(
    fileBuffer: ArrayBuffer | Buffer,
    fileName: string,
    savePath: string,
    category: string,
    tags: string
  ): Promise<QBitTorrent | null> {
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
      throw new Error('Torrent already exists in qBittorrent', { cause: err })
    }

    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const torrents = await this.getRecentTorrents()
      const found = torrents.find((t) => t.hash !== undefined && t.tags === tags)
      if (found !== undefined) {
        if (found.size === 0) {
          const waited = await this.waitForSize(found.hash, 10, 3000)
          if (waited !== undefined) return waited
        }
        return found
      }
    }

    return null
  }

  async findTorrentByHash(hash: string): Promise<QBitTorrent | undefined> {
    const response = await this.request(`/api/v2/torrents/info?hashes=${hash}`)
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
}

let _client: QBittorrentClient | null = null

export function useQBittorrent(): QBittorrentClient {
  if (!_client) {
    const config = useRuntimeConfig()
    _client = new QBittorrentClient(config.qbittorrentUrl as string, config.qbittorrentApiKey as string)
  }
  return _client
}
