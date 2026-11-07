import type { IndexerTrackerType } from '#shared/indexers'

export type IndexerFieldFormValue = string | number | boolean | null

export interface IndexerFormState {
  name: string
  enable: boolean
  priority: number
  appProfileId: number
  tags: number[]
  fields: Record<string, IndexerFieldFormValue>
}

export interface IndexerTrackerFormState {
  enabled: boolean
  trackerType: IndexerTrackerType
  authMethod: 'cookie' | 'login'
  cookie: string
  loginUrl: string
  loginUsername: string
  loginPassword: string
  hasStoredPassword: boolean
}

export interface IndexerFormDefaults {
  appProfileId: number
}
