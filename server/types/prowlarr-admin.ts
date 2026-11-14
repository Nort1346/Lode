import type { IndexerCaptchaRequest, IndexerField } from '#shared/indexers'

export interface ProwlarrIndexerDefinition {
  name: string
  definitionName: string
  description?: string
  language?: string
  encoding?: string
  privacy?: string
  protocol?: string
  implementation: string
  implementationName: string
  configContract: string
  indexerUrls?: string[]
  legacyUrls?: string[]
  supportsSearch?: boolean
  supportsRss?: boolean
  infoLink?: string
  enable?: boolean
  priority?: number
  appProfileId?: number
  tags?: number[]
  fields: IndexerField[]
  capabilities?: unknown
  [key: string]: unknown
}

export interface ProwlarrIndexerResource {
  id: number
  name: string
  definitionName: string
  implementation: string
  implementationName: string
  configContract: string
  protocol: string
  privacy: string
  language?: string
  enable: boolean
  priority: number
  appProfileId: number
  tags: number[]
  fields: IndexerField[]
  indexerUrls?: string[]
  added?: string
  sortName?: string
  downloadClientId?: number
  capabilities?: unknown
  [key: string]: unknown
}

export interface ProwlarrIndexerStatsItem {
  indexerId: number
  indexerName: string
  averageResponseTime: number
  averageGrabResponseTime: number
  numberOfQueries: number
  numberOfGrabs: number
  numberOfRssQueries: number
  numberOfAuthQueries: number
  numberOfFailedQueries: number
  numberOfFailedGrabs: number
  numberOfFailedRssQueries: number
  numberOfFailedAuthQueries: number
}

export interface ProwlarrIndexerStatsResponse {
  indexers: ProwlarrIndexerStatsItem[]
  userAgents?: unknown[]
  hosts?: unknown[]
}

export interface ProwlarrIndexerStatusItem {
  indexerId: number
  disabledTill?: string | null
  mostRecentFailure?: string | null
  initialFailure?: string | null
  escalationLevel?: number
}

export interface ProwlarrAppProfile {
  id: number
  name: string
  enableRss?: boolean
  enableAutomaticSearch?: boolean
  enableInteractiveSearch?: boolean
  minimumSeeders?: number
}

export interface ProwlarrTag {
  id: number
  label: string
}

export interface ProwlarrSystemStatus {
  appName?: string
  version?: string
  branch?: string
}

export interface ProwlarrCaptchaResponse {
  captchaRequest?: IndexerCaptchaRequest | null
}

export interface ProwlarrBulkIndexerBody {
  ids: number[]
  enable?: boolean
}
