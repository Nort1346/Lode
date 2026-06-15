export interface QuiTorrent {
  hash: string
  name: string
  progress: number
  eta: number
  dlspeed: number
  upspeed: number
  size: number
  downloaded: number
  num_seeds: number
  num_leechs: number
  state: string
  save_path: string
  category: string
  tags: string
  added_on: number
  completion_on: number
}

function extractMagnetHash(magnetUrl: string): string | null {
  const match = magnetUrl.match(/btih:([a-fA-F0-9]{40})/i)
  const group = match?.[1]
  return group !== undefined ? group.toLowerCase() : null
}

export class QuiClient {
  private proxyUrl: string

  constructor(proxyUrl: string) {
    this.proxyUrl = proxyUrl.replace(/\/+$/, '')
  }

  private async request(path: string, options: RequestInit = {}) {
    const url = `${this.proxyUrl}${path}`

    const response = await fetch(url, {
      ...options,
      headers: options.headers as Record<string, string> | undefined
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`qBittorrent API error ${response.status}: ${text}`)
    }

    return response
  }

  async addTorrent(magnetLink: string, savePath: string, category: string, tags: string): Promise<QuiTorrent | null> {
    const formData = new URLSearchParams()
    formData.append('urls', magnetLink)
    formData.append('savepath', savePath)
    formData.append('category', category)
    formData.append('tags', tags)
    formData.append('paused', 'false')

    await this.request('/api/v2/torrents/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    })

    const knownHash = extractMagnetHash(magnetLink)

    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000))

      if (knownHash !== null) {
        const byHash = await this.findByHash(knownHash)
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

  private async findByHash(hash: string): Promise<QuiTorrent | undefined> {
    const response = await this.request(`/api/v2/torrents/info?hashes=${hash}`)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Response.json() returns any
    const data: QuiTorrent[] = await response.json()
    return data[0]
  }

  private async waitForSize(hash: string, maxAttempts: number, delayMs: number): Promise<QuiTorrent | undefined> {
    for (let j = 0; j < maxAttempts; j++) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const byHash = await this.findByHash(hash)
      if (byHash !== undefined && byHash.size > 0) return byHash
    }
    return undefined
  }

  async getUserTorrents(tag: string): Promise<QuiTorrent[]> {
    const response = await this.request(
      `/api/v2/torrents/info?tag=${encodeURIComponent(tag)}&sort=added_on&reverse=true`
    )
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Response.json() returns any
    const data: QuiTorrent[] = await response.json()
    return data
  }

  async getRecentTorrents(): Promise<QuiTorrent[]> {
    const response = await this.request('/api/v2/torrents/info?sort=added_on&reverse=true&limit=5')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Response.json() returns any
    const data: QuiTorrent[] = await response.json()
    return data
  }

  async getAllTorrents(): Promise<QuiTorrent[]> {
    const response = await this.request('/api/v2/torrents/info?sort=added_on&reverse=true')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Response.json() returns any
    const data: QuiTorrent[] = await response.json()
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
}

let _client: QuiClient | null = null

export function useQui(): QuiClient {
  if (!_client) {
    const config = useRuntimeConfig()
    _client = new QuiClient(config.quiProxyUrl)
  }
  return _client
}
