// Shared between the watch API, the watch button and their tests.

export type WatchPlatform = 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'other'

export type WatchServer = 'jellyfin' | 'plex' | 'emby'

export type WatchTargetId =
  'moonfin' | 'swiftfin' | 'findroid' | 'jellyfin-web' | 'plex' | 'plex-web' | 'emby' | 'emby-web'

export interface WatchTarget {
  id: WatchTargetId
  server: WatchServer
  kind: 'native' | 'web'
  url?: string
  urls?: Partial<Record<WatchPlatform, string>>
}

export interface WatchSource {
  jellyfin?: {
    itemId: string
    serverId?: string
    userId?: string
    externalUrl?: string
  }
  plex?: {
    machineId: string
    ratingKey: string
    mediaType: 'movie' | 'tv'
    webAppUrl?: string
  }
  emby?: {
    serverId: string
    itemId: string
    externalUrl?: string
  }
}

export interface WatchLinksPayload {
  available: boolean
  targets: WatchTarget[]
}

export const WATCH_NATIVE_PRIORITY: Record<WatchPlatform, WatchTargetId[]> = {
  android: ['moonfin', 'findroid', 'plex', 'emby'],
  ios: ['moonfin', 'swiftfin', 'plex', 'emby'],
  macos: ['moonfin', 'emby'],
  windows: ['moonfin'],
  linux: ['moonfin'],
  other: ['moonfin']
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function jellyfinWebUrl(externalUrl: string | undefined, itemId: string, serverId?: string): string {
  const base = withoutTrailingSlash(externalUrl ?? '')
  const params = new URLSearchParams({ id: itemId, context: 'home' })
  if (serverId !== undefined) params.set('serverId', serverId)
  return `${base}/web/index.html#!/details?${params.toString()}`
}

export function buildWatchTargets(source: WatchSource): WatchTarget[] {
  const targets: WatchTarget[] = []

  const jellyfin = source.jellyfin
  if (jellyfin) {
    targets.push({
      id: 'moonfin',
      server: 'jellyfin',
      kind: 'native',
      url: `moonfin://item?id=${encodeURIComponent(jellyfin.itemId)}`
    })
    targets.push({
      id: 'findroid',
      server: 'jellyfin',
      kind: 'native',
      url: `jellyfin://item/${encodeURIComponent(jellyfin.itemId)}`
    })
    if (jellyfin.serverId !== undefined && jellyfin.userId !== undefined) {
      targets.push({
        id: 'swiftfin',
        server: 'jellyfin',
        kind: 'native',
        url: `jellyfin://${encodeURIComponent(jellyfin.serverId)}/${encodeURIComponent(jellyfin.userId)}/item/${encodeURIComponent(jellyfin.itemId)}`
      })
    }
    if (jellyfin.externalUrl !== undefined) {
      targets.push({
        id: 'jellyfin-web',
        server: 'jellyfin',
        kind: 'web',
        url: jellyfinWebUrl(jellyfin.externalUrl, jellyfin.itemId, jellyfin.serverId)
      })
    }
  }

  const plex = source.plex
  if (plex) {
    const metadataKey = encodeURIComponent(`/library/metadata/${plex.ratingKey}`)
    const showPath = plex.mediaType === 'tv' ? 'tv/' : ''
    targets.push({
      id: 'plex',
      server: 'plex',
      kind: 'native',
      urls: {
        ios: `plex://preplay/?metadataKey=${metadataKey}&server=${encodeURIComponent(plex.machineId)}`,
        android: `plex://libraries/${encodeURIComponent(plex.machineId)}/unmatched/${showPath}${metadataKey}`
      }
    })
    const webAppUrl = withoutTrailingSlash(plex.webAppUrl ?? 'https://app.plex.tv/desktop')
    targets.push({
      id: 'plex-web',
      server: 'plex',
      kind: 'web',
      url: `${webAppUrl}#!/server/${encodeURIComponent(plex.machineId)}/details?key=${metadataKey}`
    })
  }

  const emby = source.emby
  if (emby) {
    targets.push({
      id: 'emby',
      server: 'emby',
      kind: 'native',
      urls: {
        android: `emby://items/${encodeURIComponent(emby.serverId)}/${encodeURIComponent(emby.itemId)}`,
        ios: `emby://items?serverId=${encodeURIComponent(emby.serverId)}&itemId=${encodeURIComponent(emby.itemId)}`
      }
    })
    if (emby.externalUrl !== undefined) {
      const base = withoutTrailingSlash(emby.externalUrl)
      targets.push({
        id: 'emby-web',
        server: 'emby',
        kind: 'web',
        url: `${base}/web/index.html#!/item?id=${encodeURIComponent(emby.itemId)}&serverId=${encodeURIComponent(emby.serverId)}`
      })
    }
  }

  return targets
}

export function detectWatchPlatform(userAgent: string, isTouchMac = false): WatchPlatform {
  if (/android/i.test(userAgent)) return 'android'
  if (/iphone|ipad|ipod/i.test(userAgent) || (isTouchMac && /macintosh|mac os x/i.test(userAgent))) return 'ios'
  if (/windows/i.test(userAgent)) return 'windows'
  if (/macintosh|mac os x/i.test(userAgent)) return 'macos'
  if (/linux/i.test(userAgent)) return 'linux'
  return 'other'
}

export function resolveWatchUrl(target: WatchTarget, platform: WatchPlatform): string | null {
  return target.urls?.[platform] ?? target.url ?? null
}

export function findWebFallback(targets: WatchTarget[], server: WatchServer): WatchTarget | undefined {
  return targets.find((target) => target.kind === 'web' && target.server === server)
}

export function rankWatchTargets(targets: WatchTarget[], platform: WatchPlatform): WatchTarget[] {
  const priority = WATCH_NATIVE_PRIORITY[platform]
  const rank = (id: WatchTargetId): number => {
    const index = priority.indexOf(id)
    return index === -1 ? priority.length : index
  }

  return [...targets].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'native' ? -1 : 1
    return rank(a.id) - rank(b.id)
  })
}
