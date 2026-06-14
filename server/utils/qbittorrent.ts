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

    let found: QuiTorrent | undefined
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      const torrents = await this.getRecentTorrents()
      found = torrents.find((t) => t.hash !== undefined && t.tags === tags)
      if (found !== undefined) break
    }

    if (found === undefined) return null

    if (found.size === 0) {
      const targetHash = found.hash
      for (let j = 0; j < 10; j++) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        const torrents = await this.getRecentTorrents()
        const refreshed = torrents.find((t) => t.hash === targetHash)
        if (refreshed !== undefined && refreshed.size > 0) return refreshed
      }
    }

    return found
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
