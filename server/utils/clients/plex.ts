import type { ServiceStatus } from '#server/types/admin'
import type {
  PlexHomeUser,
  PlexLibraryItem,
  PlexMediaContainer,
  PlexSection,
  PlexShareSettings,
  PlexSharedServer,
  PlexSystemInfo
} from '#server/types/plex'
import { createLogger } from '#server/utils/logger'
import { normalizeUrl } from '#server/utils/url'

const log = createLogger('Plex')

// A stable identifier sent to plex.tv on every call (required by plex.tv). A
// per-installation UUID would be marginally better, but a constant product id is
// sufficient for a single-instance, unattended service and avoids a settings
// round-trip during construction.
const PLEX_CLIENT_IDENTIFIER = 'lode-media-hub'
const PLEX_TV_BASE_URL = 'https://plex.tv'
const LIBRARY_CACHE_TTL = 5 * 60 * 1000
const PAGE_SIZE = 500
// Hard stop for the section walk. A PMS that ignores the X-Plex-Container-*
// headers would otherwise re-send the first page forever.
const MAX_LIBRARY_PAGES = 200
// Every plex.tv/PMS call is bounded: the post-download refresh is awaited from
// the torrent sync loop, so a hung Plex must not stall download status updates.
const REQUEST_TIMEOUT_MS = 10_000
// Error bodies are only a hint for the logs and plex.tv can echo account data,
// so cap what ends up in an Error message.
const ERROR_BODY_LIMIT = 300

function truncateErrorBody(text: string): string {
  return text.length <= ERROR_BODY_LIMIT ? text : `${text.slice(0, ERROR_BODY_LIMIT)}...`
}

// Only movie + show sections matter for TMDB in-library detection. Music/photo
// sections are skipped.
const SECTION_TYPE_TO_PLEX_TYPE: Record<string, number> = {
  movie: 1,
  show: 2
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

// Plex collapses single-element JSON lists into a bare object, so a server with
// exactly one section (or one library folder) must not lose that entry.
function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return value === null || typeof value !== 'object' ? [] : [value]
}

// plex.tv share flags are sent as 0/1; accepts boolean | number | undefined.
function plexFlag(value: boolean | number | undefined): number {
  if (value === undefined || value === false || value === 0) return 0
  return 1
}

// Pulls the numeric id out of a `tmdb://123` guid string (case-insensitive).
export function extractTmdbId(item: PlexLibraryItem): number | null {
  // Prefer the uppercase `Guid` array of external ids.
  if (Array.isArray(item.Guid)) {
    for (const guid of item.Guid) {
      const match = /^tmdb:\/\/(\d+)$/i.exec(guid?.id ?? '')
      if (match?.[1] !== undefined) return Number(match[1])
    }
  }
  // Fall back to a bare `tmdb://` primary guid (rare, non-plex agents).
  if (typeof item.guid === 'string') {
    const match = /^tmdb:\/\/(\d+)$/i.exec(item.guid)
    if (match?.[1] !== undefined) return Number(match[1])
  }
  return null
}

// ===== Plex Media Server (NUXT_PLEX_URL) =====

export class PlexPmsClient {
  private baseUrl: string
  private token: string
  private machineIdentifier: string | null = null
  private tmdbIdSet: Set<number> | null = null
  private tmdbIdSetTs = 0
  private tmdbIdPromise: Promise<Set<number>> | null = null

  constructor(baseUrl: string, token: string) {
    this.baseUrl = normalizeUrl(baseUrl)
    this.token = token
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      'X-Plex-Token': this.token,
      'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
      Accept: 'application/json'
    }
  }

  private async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        ...this.getAuthHeaders(),
        ...(options.headers as Record<string, string>)
      }
    })

    if (!response.ok && response.status !== 204) {
      const text = await response.text().catch(() => '')
      throw new Error(`Plex API error ${response.status}: ${truncateErrorBody(text)}`)
    }

    return response
  }

  // ===== System =====

  async getSystemInfo(): Promise<PlexSystemInfo> {
    const res = await this.request('/')
    const raw = (await res.json()) as unknown
    const container = asRecord(asRecord(raw)?.MediaContainer) ?? asRecord(raw) ?? {}
    return container as PlexSystemInfo
  }

  // Cached machineIdentifier from `GET /`. Used as the `machineIdentifier` when
  // creating/updating plex.tv shares. NOTE: plex.tv's shared_servers endpoint is
  // documented (community) to expect the ProcessedMachineIdentifier; the raw id
  // works in most setups but share-creation failures should be investigated here
  // first (the processed id is obtainable from plex.tv /api/v2/resources or the
  // Plex Web advanced settings).
  async getMachineIdentifier(): Promise<string> {
    if (this.machineIdentifier !== null) return this.machineIdentifier
    const info = await this.getSystemInfo()
    const id = info.machineIdentifier
    if (id === undefined || id === '') {
      throw new Error('Plex: could not read machineIdentifier from the server')
    }
    this.machineIdentifier = id
    return id
  }

  // ===== Library =====

  async getSections(): Promise<PlexSection[]> {
    const res = await this.request('/library/sections')
    const raw = (await res.json()) as unknown
    const container = asRecord(asRecord(raw)?.MediaContainer) ?? {}
    const sections: PlexSection[] = []
    for (const dir of asList(container.Directory)) {
      const rec = asRecord(dir)
      if (!rec) continue
      const locations: Array<{ id?: number; path: string }> = []
      for (const rawLocation of asList(rec.Location)) {
        const loc = asRecord(rawLocation)
        if (!loc) continue
        locations.push({
          id: typeof loc.id === 'number' ? loc.id : undefined,
          path: typeof loc.path === 'string' ? loc.path : ''
        })
      }
      sections.push({
        key: String(rec.key ?? ''),
        type: String(rec.type ?? ''),
        title: String(rec.title ?? ''),
        Location: locations.length > 0 ? locations : undefined
      })
    }
    return sections
  }

  // Fetches every item in a section with external guids, paginated via the
  // X-Plex-Container-* headers. `type` narrows to a numeric Plex type (1 movie,
  // 2 show) to avoid pulling episodes for show libraries.
  async getLibraryItems(sectionKey: string, type?: number): Promise<PlexLibraryItem[]> {
    const items: PlexLibraryItem[] = []
    const seen = new Set<string>()
    let start = 0

    for (let page = 0; page < MAX_LIBRARY_PAGES; page++) {
      const typeParam = type !== undefined ? `&type=${type}` : ''
      const path = `/library/sections/${sectionKey}/all?includeGuids=1${typeParam}`
      const res = await this.request(path, {
        headers: {
          'X-Plex-Container-Start': String(start),
          'X-Plex-Container-Size': String(PAGE_SIZE)
        }
      })
      const data = (await res.json()) as { MediaContainer?: PlexMediaContainer<PlexLibraryItem> }
      const container = data.MediaContainer ?? {}
      const batch = asList(container.Metadata) as PlexLibraryItem[]

      if (batch.length === 0) break

      // Guard against a server that ignores the offset headers and keeps
      // returning the same page: anything already seen ends the walk.
      const fresh = batch.filter((item) => item.ratingKey === undefined || !seen.has(item.ratingKey))
      for (const item of fresh) {
        if (item.ratingKey !== undefined) seen.add(item.ratingKey)
        items.push(item)
      }
      if (fresh.length < batch.length) {
        log.warn(`Plex section ${sectionKey} repeated a page at offset ${start}; stopping pagination`)
        break
      }

      start += batch.length
      if (batch.length < PAGE_SIZE) break
      if (container.totalSize !== undefined && start >= container.totalSize) break
    }

    return items
  }

  async refreshSection(sectionKey: string): Promise<void> {
    await this.request(`/library/sections/${sectionKey}/refresh`, { method: 'POST' })
  }

  async refreshAll(): Promise<void> {
    await this.request('/library/sections/refresh', { method: 'POST' })
  }

  // ===== TMDB in-library set (5-min TTL + in-flight dedupe, mirrors Jellyfin) =====

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
    const sections = await this.getSections()

    for (const section of sections) {
      const plexType = SECTION_TYPE_TO_PLEX_TYPE[section.type]
      if (plexType === undefined) continue

      const items = await this.getLibraryItems(section.key, plexType)
      for (const item of items) {
        const tmdbId = extractTmdbId(item)
        if (tmdbId !== null) tmdbIds.add(tmdbId)
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
}

// ===== plex.tv (https://plex.tv) =====

// plex.tv owns user/home management. Its v2 endpoints return JSON; shapes are
// community-documented, so every parse is defensive. Isolating all plex.tv
// knowledge here means a live-shape change only touches this class.
export class PlexTvClient {
  private baseUrl: string
  private token: string
  private clientIdentifier: string

  constructor(token: string, clientIdentifier: string = PLEX_CLIENT_IDENTIFIER, baseUrl: string = PLEX_TV_BASE_URL) {
    this.token = token
    this.clientIdentifier = clientIdentifier
    this.baseUrl = normalizeUrl(baseUrl)
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      'X-Plex-Token': this.token,
      'X-Plex-Client-Identifier': this.clientIdentifier,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  }

  private async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        ...this.getAuthHeaders(),
        ...(options.headers as Record<string, string>)
      }
    })

    if (!response.ok && response.status !== 204) {
      const text = await response.text().catch(() => '')
      throw new Error(`Plex.tv API error ${response.status}: ${truncateErrorBody(text)}`)
    }

    return response
  }

  // Handles the shapes plex.tv may return for a user list: a bare array, a
  // `{ users: [...] }` object, or a `{ home: { users: [...] } }` envelope.
  async getHomeUsers(): Promise<PlexHomeUser[]> {
    const res = await this.request('/api/v2/home/users')
    const data = (await res.json()) as unknown
    return extractHomeUsers(data)
  }

  async createManagedUser(params: {
    title: string
    allowSync?: boolean
    allowTuners?: boolean
    restrictionProfile?: string
  }): Promise<PlexHomeUser> {
    const search = new URLSearchParams()
    search.set('friendlyName', params.title)
    if (params.restrictionProfile !== undefined && params.restrictionProfile !== '') {
      search.set('restrictionProfile', params.restrictionProfile)
    }
    if (params.allowSync !== undefined) search.set('sharingSettings[allowSync]', params.allowSync ? '1' : '0')
    if (params.allowTuners !== undefined) search.set('sharingSettings[allowTuners]', params.allowTuners ? '1' : '0')

    const res = await this.request(`/api/v2/home/users/restricted?${search.toString()}`, { method: 'POST' })
    const data = (await res.json()) as unknown
    const user = extractHomeUser(data)
    if (!user || !Number.isFinite(user.id)) {
      throw new Error('Plex.tv: could not parse the created managed user')
    }
    return user
  }

  // Existing server shares. Used to decide between updating a share and
  // creating a new one - plex.tv rejects a create when one already exists.
  async getSharedServers(): Promise<PlexSharedServer[]> {
    const res = await this.request('/api/v2/shared_servers')
    const data = (await res.json()) as unknown
    return extractSharedServers(data)
  }

  // Finds the share id plex.tv assigned to `userId` on `machineIdentifier`, or
  // null when the user has no share there yet. Keys are matched defensively:
  // the v2 shape is community-documented and differs between plex.tv builds.
  async findShareId(machineIdentifier: string, userId: number): Promise<number | null> {
    const shares = await this.getSharedServers()
    const match = shares.find((share) => {
      const machine = share.machineIdentifier ?? share.machineId
      if (machine !== undefined && machine !== '' && machine !== machineIdentifier) return false
      const invited = share.invitedId ?? share.userId ?? share.userID
      return invited === userId
    })
    return match?.id ?? null
  }

  async updateHomeUser(userId: number, friendlyName: string): Promise<void> {
    const search = new URLSearchParams()
    search.set('friendlyName', friendlyName)
    await this.request(`/api/v2/home/users/restricted/${userId}?${search.toString()}`, { method: 'PUT' })
  }

  async deleteHomeUser(userId: number): Promise<void> {
    await this.request(`/api/v2/home/users/${userId}`, { method: 'DELETE' })
  }

  async createShare(
    machineIdentifier: string,
    invitedId: number,
    sectionIds: number[],
    settings: PlexShareSettings
  ): Promise<void> {
    const body = {
      machineIdentifier,
      librarySectionIds: sectionIds,
      settings: {
        allowSync: plexFlag(settings.allowSync),
        allowTuners: plexFlag(settings.allowTuners)
      },
      invitedId
    }
    await this.request('/api/v2/shared_servers', {
      method: 'POST',
      body: JSON.stringify(body)
    })
  }

  async updateShare(
    shareId: number,
    machineIdentifier: string,
    sectionIds: number[],
    settings: PlexShareSettings
  ): Promise<void> {
    const body = {
      machineIdentifier,
      librarySectionIds: sectionIds,
      settings: {
        allowSync: plexFlag(settings.allowSync),
        allowTuners: plexFlag(settings.allowTuners)
      }
    }
    await this.request(`/api/v2/shared_servers/${shareId}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    })
  }

  async removeShare(userId: number): Promise<void> {
    await this.request(`/api/v2/sharings/${userId}`, { method: 'DELETE' })
  }
}

// Defensive extraction helpers for plex.tv JSON shapes.

function extractHomeUsers(data: unknown): PlexHomeUser[] {
  if (Array.isArray(data)) return data as PlexHomeUser[]
  const rec = asRecord(data)
  if (!rec) return []
  const users = asList(rec.users)
  if (users.length > 0) return users as PlexHomeUser[]
  const home = asRecord(rec.home)
  if (home) {
    const homeUsers = asList(home.users)
    if (homeUsers.length > 0) return homeUsers as PlexHomeUser[]
  }
  return []
}

function extractHomeUser(data: unknown): PlexHomeUser | null {
  const rec = asRecord(data)
  if (!rec) return null
  const direct = asRecord(rec.user)
  if (direct) return direct as unknown as PlexHomeUser
  const home = asRecord(rec.home)
  if (home && Array.isArray(home.users) && home.users.length > 0) {
    const first = asRecord(home.users[0])
    if (first) return first as unknown as PlexHomeUser
  }
  return rec as unknown as PlexHomeUser
}

// `GET /api/v2/shared_servers` has been observed as a bare array and wrapped in
// a `{ shared_servers: [...] }` object depending on the plex.tv build.
function extractSharedServers(data: unknown): PlexSharedServer[] {
  if (Array.isArray(data)) return data as PlexSharedServer[]
  const rec = asRecord(data)
  if (!rec) return []
  const snake = asList(rec.shared_servers)
  if (snake.length > 0) return snake as PlexSharedServer[]
  return asList(rec.sharedServers) as PlexSharedServer[]
}

// ===== Singleton + health check =====

export interface PlexClients {
  pms: PlexPmsClient
  tv: PlexTvClient
}

let _clients: PlexClients | null = null
let _lastUrl = ''
let _lastToken = ''

export function usePlex(): PlexClients | null {
  const config = useRuntimeConfig()
  const url = typeof config.plexUrl === 'string' ? config.plexUrl : ''
  const token = typeof config.plexToken === 'string' ? config.plexToken : ''

  if (!url || !token) return null

  if (_clients && (url !== _lastUrl || token !== _lastToken)) {
    _clients = null
  }

  if (!_clients) {
    _clients = {
      pms: new PlexPmsClient(url, token),
      tv: new PlexTvClient(token)
    }
    _lastUrl = url
    _lastToken = token
  }

  return _clients
}

function describeSystem(info: PlexSystemInfo): string | undefined {
  const parts: string[] = []
  if (info.version !== undefined && info.version !== '') parts.push(info.version)
  if (info.myPlexSigninState !== undefined && info.myPlexSigninState !== '' && info.myPlexSigninState !== 'ok') {
    parts.push('server not claimed')
  }
  return parts.length > 0 ? parts.join(' - ') : undefined
}

export async function checkPlexStatus(): Promise<ServiceStatus> {
  const config = useRuntimeConfig()
  const url = typeof config.plexUrl === 'string' ? config.plexUrl : ''
  const token = typeof config.plexToken === 'string' ? config.plexToken : ''
  if (!url || !token) {
    return { name: 'Plex', configured: false, status: 'not_configured' }
  }

  const start = Date.now()
  try {
    // `GET /` needs only the token and returns the server version + claim state.
    const res = await fetch(`${normalizeUrl(url)}/`, {
      headers: {
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': PLEX_CLIENT_IDENTIFIER,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    })
    if (res.status === 401 || res.status === 403) {
      return {
        name: 'Plex',
        configured: true,
        status: 'invalid',
        latencyMs: Date.now() - start,
        details: 'Token rejected'
      }
    }
    if (!res.ok) {
      log.error(`Plex status check failed with HTTP ${res.status}`)
      return {
        name: 'Plex',
        configured: true,
        status: 'error',
        latencyMs: Date.now() - start,
        details: `HTTP ${res.status}`
      }
    }
    let info: PlexSystemInfo
    try {
      const raw = (await res.json()) as unknown
      const container = asRecord(asRecord(raw)?.MediaContainer) ?? asRecord(raw) ?? {}
      info = container as PlexSystemInfo
    } catch {
      log.error('Plex status check returned an unreadable response body')
      return {
        name: 'Plex',
        configured: true,
        status: 'error',
        latencyMs: Date.now() - start,
        details: 'Malformed response'
      }
    }
    return {
      name: 'Plex',
      configured: true,
      status: 'up',
      latencyMs: Date.now() - start,
      details: describeSystem(info)
    }
  } catch {
    return {
      name: 'Plex',
      configured: true,
      status: 'down',
      latencyMs: Date.now() - start
    }
  }
}

// ===== Post-download refresh (D6) =====

// Debounces refreshes per section key: at most one refresh per section every
// REFRESH_DEBOUNCE_MS, so a burst of completed downloads does not hammer PMS.
const REFRESH_DEBOUNCE_MS = 60 * 1000
const lastRefreshAt = new Map<string, number>()

function shouldRefresh(sectionKey: string, now: number): boolean {
  const last = lastRefreshAt.get(sectionKey)
  if (last !== undefined && now - last < REFRESH_DEBOUNCE_MS) return false
  lastRefreshAt.set(sectionKey, now)
  return true
}

// Clears the post-download refresh debounce state. For tests only - mirrors
// resetSyncDiagnostics so a fresh test suite starts without stale timestamps.
export function resetPlexRefreshDebounce(): void {
  lastRefreshAt.clear()
}

// Maps a finished download's target path to a Plex section by prefix-matching the
// section's `Location[].path`, then triggers that section's refresh (or refresh-all
// when no section matches). Fire-and-forget: failures are swallowed exactly like the
// Jellyfin `notifyMediaUpdated(...).catch(() => {})` call so a Plex hiccup never
// affects the download flow.
export async function notifyPlexDownloaded(targetPath: string): Promise<void> {
  const clients = usePlex()
  if (clients === null) return

  const now = Date.now()
  try {
    const sections = await clients.pms.getSections()
    const match = sections.find((section) =>
      (section.Location ?? []).some((loc) => loc.path !== '' && targetPath.startsWith(loc.path))
    )

    if (match !== undefined) {
      if (!shouldRefresh(match.key, now)) return
      await clients.pms.refreshSection(match.key)
    } else {
      if (!shouldRefresh('*', now)) return
      await clients.pms.refreshAll()
    }
  } catch (error) {
    log.debug('Plex post-download refresh failed (ignored):', error)
  }
}
