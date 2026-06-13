export class JellyfinClient {
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
        'X-Emby-Token': this.apiKey,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>)
      }
    })

    if (!response.ok && response.status !== 204) {
      const text = await response.text().catch(() => '')
      throw new Error(`Jellyfin API error ${response.status}: ${text}`)
    }

    return response
  }

  async notifyMediaUpdated(paths: string[]) {
    const updates = paths.map((path) => ({
      Path: path,
      UpdateType: 'scan'
    }))

    await this.request('/Library/Media/Updated', {
      method: 'POST',
      body: JSON.stringify({ Updates: updates })
    })
  }

  async refreshLibrary() {
    await this.request('/Library/Refresh', {
      method: 'POST'
    })
  }
}

let _client: JellyfinClient | null = null

export function useJellyfin(): JellyfinClient | null {
  const config = useRuntimeConfig()

  if (!config.jellyfinUrl || !config.jellyfinApiKey) {
    return null
  }

  if (!_client) {
    _client = new JellyfinClient(config.jellyfinUrl, config.jellyfinApiKey)
  }

  return _client
}
