const JELLYFIN_AUTH_HEADER_PREFIX = 'MediaBrowser Token'
const LIBRARY_CACHE_TTL = 5 * 60 * 1000

interface JellyfinItemDto {
  Id: string
  ProviderIds?: Record<string, string>
}

export class JellyfinClient {
  private baseUrl: string
  private apiKey: string
  private tmdbIdSet: Set<number> | null = null
  private tmdbIdSetTs = 0
  private tmdbIdPromise: Promise<Set<number>> | null = null

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `${JELLYFIN_AUTH_HEADER_PREFIX}="${this.apiKey}"`
    }
  }

  private async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
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

  // ===== Library =====

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

  async getLibraries(): Promise<Array<{ Id: string; Name: string; CollectionType: string; Path: string }>> {
    const res = await this.request('/Library/MediaFolders')
    const data = (await res.json()) as {
      Items: Array<{
        Id: string
        Name: string
        CollectionType: string
        Locations: string[]
      }>
    }
    return data.Items.map((item) => ({
      Id: item.Id,
      Name: item.Name,
      CollectionType: item.CollectionType,
      Path: item.Locations?.[0] ?? ''
    }))
  }

  private async fetchAllTmdbIds(): Promise<Set<number>> {
    const now = Date.now()
    if (this.tmdbIdSet && now - this.tmdbIdSetTs < LIBRARY_CACHE_TTL) {
      return this.tmdbIdSet
    }
    if (this.tmdbIdPromise) return this.tmdbIdPromise

    this.tmdbIdPromise = this.doFetchAllTmdbIds()
    try {
      return await this.tmdbIdPromise
    } finally {
      this.tmdbIdPromise = null
    }
  }

  private async doFetchAllTmdbIds(): Promise<Set<number>> {
    const tmdbIds = new Set<number>()
    const includeItemTypes = ['Movie', 'Series']
    const fields = ['ProviderIds']
    const limit = 500

    for (const itemType of includeItemTypes) {
      let startIndex = 0
      let hasMore = true

      while (hasMore) {
        const path = `/Items?includeItemTypes=${itemType}&fields=${fields.join(',')}&recursive=true&limit=${limit}&startIndex=${startIndex}&enableTotalRecordCount=false`
        const res = await this.request(path)
        const data = (await res.json()) as {
          Items: JellyfinItemDto[]
        }

        for (const item of data.Items) {
          const tmdbStr = item.ProviderIds?.Tmdb
          if (tmdbStr !== undefined && tmdbStr !== null && tmdbStr.length > 0) {
            const id = Number(tmdbStr)
            if (!Number.isNaN(id)) {
              tmdbIds.add(id)
            }
          }
        }

        hasMore = data.Items.length === limit
        startIndex += limit
      }
    }

    this.tmdbIdSet = tmdbIds
    this.tmdbIdSetTs = Date.now()
    return tmdbIds
  }

  async isItemInLibrary(tmdbId: number): Promise<boolean> {
    try {
      const tmdbIds = await this.fetchAllTmdbIds()
      return tmdbIds.has(tmdbId)
    } catch {
      return false
    }
  }

  invalidateLibraryCache() {
    this.tmdbIdSet = null
    this.tmdbIdSetTs = 0
    this.tmdbIdPromise = null
  }

  // ===== User Management =====

  async getUsers(): Promise<Array<{ Id: string; Name: string }>> {
    const res = await this.request('/Users')
    return (await res.json()) as Array<{ Id: string; Name: string }>
  }

  async getUserByName(name: string): Promise<{ Id: string; Name: string } | null> {
    const users = await this.getUsers()
    return users.find((u) => u.Name.toLowerCase() === name.toLowerCase()) ?? null
  }

  async createUser(name: string, password: string): Promise<{ Id: string; Name: string }> {
    const res = await this.request('/Users/New', {
      method: 'POST',
      body: JSON.stringify({ Name: name, Password: password })
    })
    return (await res.json()) as { Id: string; Name: string }
  }

  async updateUser(userId: string, data: { Name: string }): Promise<void> {
    await this.request(`/Users?userId=${userId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  async deleteUser(userId: string): Promise<void> {
    await this.request(`/Users/${userId}`, { method: 'DELETE' })
  }

  async disableUser(userId: string): Promise<void> {
    const user = await this.getUser(userId)
    const policy = (user.Policy ?? {}) as Record<string, unknown>
    await this.updateUserPolicy(userId, { ...policy, IsDisabled: true })
  }

  async enableUser(userId: string): Promise<void> {
    const user = await this.getUser(userId)
    const policy = (user.Policy ?? {}) as Record<string, unknown>
    await this.updateUserPolicy(userId, { ...policy, IsDisabled: false })
  }

  async getUser(userId: string): Promise<Record<string, unknown>> {
    const res = await this.request(`/Users/${userId}`)
    return (await res.json()) as Record<string, unknown>
  }

  async updateUserPolicy(userId: string, policy: Record<string, unknown>): Promise<void> {
    await this.request(`/Users/${userId}/Policy`, {
      method: 'POST',
      body: JSON.stringify(policy)
    })
  }

  async updateUserPassword(userId: string, newPassword: string): Promise<void> {
    await this.request(`/Users/Password?userId=${userId}`, {
      method: 'POST',
      body: JSON.stringify({
        CurrentPw: '',
        NewPw: newPassword,
        ResetPassword: false
      })
    })
  }

  // ===== User Image =====

  async setUserImage(userId: string, imageBuffer: Buffer, contentType: string): Promise<void> {
    const base64 = imageBuffer.toString('base64')
    await this.request(`/UserImage?userId=${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: base64
    })
  }

  async deleteUserImage(userId: string): Promise<void> {
    await this.request(`/UserImage?userId=${userId}`, { method: 'DELETE' })
  }

  async getUserImage(userId: string): Promise<Buffer | null> {
    try {
      const url = `${this.baseUrl}/Users/${userId}/Images/Primary`
      const response = await fetch(url, {
        headers: this.getAuthHeaders()
      })
      if (!response.ok) return null
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch {
      return null
    }
  }
}

let _client: JellyfinClient | null = null
let _lastUrl = ''
let _lastKey = ''

export function useJellyfin(): JellyfinClient | null {
  const config = useRuntimeConfig()
  const url = config.jellyfinUrl as string
  const key = config.jellyfinApiKey as string

  if (!url || !key) return null

  if (_client && (url !== _lastUrl || key !== _lastKey)) {
    _client = null
  }

  if (!_client) {
    _client = new JellyfinClient(url, key)
    _lastUrl = url
    _lastKey = key
  }

  return _client
}
