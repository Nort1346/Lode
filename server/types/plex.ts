// Types for the Plex integration. Two hosts are involved:
// - The Plex Media Server (PMS) itself (NUXT_PLEX_URL), which returns JSON when
//   `Accept: application/json` is sent (default is XML).
// - plex.tv (https://plex.tv), which owns user/home management. The v2 endpoints
//   return JSON; shapes are community-documented and isolated in PlexTvClient.

// ===== PMS host (NUXT_PLEX_URL) =====

// Response of `GET /` - system identity + claim state.
export interface PlexSystemInfo {
  version?: string
  machineIdentifier?: string
  friendlyName?: string
  claimed?: boolean
  myPlex?: boolean
  myPlexSigninState?: string
  myPlexUsername?: string
  myPlexSubscription?: boolean
}

// A library section as returned by `GET /library/sections`.
export interface PlexSection {
  key: string
  type: string
  title: string
  Location?: Array<{ id?: number; path: string }>
}

// A single external-guid entry on a metadata item, e.g. `{ id: 'tmdb://812' }`.
export interface PlexGuid {
  id: string
}

// A metadata item as returned by `GET /library/sections/{id}/all?includeGuids=1`.
// Responses contain a lowercase string `guid` (the primary/plex guid) AND an
// uppercase `Guid` array of external ids - both are preserved as-is.
export interface PlexLibraryItem {
  type?: string
  title?: string
  guid?: string
  Guid?: PlexGuid[]
}

// Generic PMS list envelope (paginated via X-Plex-Container-* headers).
export interface PlexMediaContainer<T> {
  size?: number
  offset?: number
  totalSize?: number
  Metadata?: T[]
  Directory?: T[]
}

// Body for `POST /api/v2/shared_servers` (plex.tv). `machineIdentifier` must be
// the server's ProcessedMachineIdentifier for reliable share creation - see the
// client for how it is sourced and the caveat.
export interface PlexShareBody {
  machineIdentifier: string
  librarySectionIds: number[]
  settings: PlexShareSettings
  invitedId: number
}

export interface PlexShareSettings {
  allowSync?: boolean | number
  allowTuners?: boolean | number
}

// ===== plex.tv host (https://plex.tv) =====

// A Plex Home user as returned by `GET /api/v2/home/users`.
export interface PlexHomeUser {
  id: number
  uuid?: string
  title?: string
  username?: string
  email?: string
  thumb?: string
  friendlyName?: string
  restricted?: boolean | number
  admin?: boolean | number
  protected?: boolean | number
  hasPassword?: boolean | number
  restrictionProfile?: string
}
