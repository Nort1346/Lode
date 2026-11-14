export type IndexerPrivacy = 'public' | 'semiPrivate' | 'private'

export type IndexerTrackerType = 'guid' | 'counting'

export interface IndexerSelectOption {
  value: number | string
  name: string
  order?: number
  hint?: string
}

export interface IndexerField {
  order: number
  name: string
  label?: string
  helpText?: string
  helpLink?: string
  value?: string | number | boolean | null
  type: string
  advanced?: boolean
  hidden?: string | null
  privacy?: string
  isFloat?: boolean
  unit?: string
  selectOptions?: IndexerSelectOption[]
  selectOptionsProviderAction?: string | null
}

export interface IndexerFieldValue {
  name: string
  value: string | number | boolean | null
}

export interface IndexerDefinitionSummary {
  name: string
  definitionName: string
  description: string
  language: string
  privacy: IndexerPrivacy
  protocol: string
  implementation: string
  implementationName: string
  supportsSearch: boolean
  indexerUrl: string | null
}

export interface IndexerDefinitionDetail extends IndexerDefinitionSummary {
  configContract: string
  encoding: string | null
  indexerUrls: string[]
  legacyUrls: string[]
  infoLink: string | null
  fields: IndexerField[]
}

export interface IndexerSchemaPage {
  items: IndexerDefinitionSummary[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface IndexerDefinitionResponse {
  definition: IndexerDefinitionDetail
}

export interface IndexerPayload {
  name: string
  enable: boolean
  priority: number
  appProfileId: number
  tags: number[]
  fields: IndexerFieldValue[]
  definitionName?: string
  implementation?: string
  implementationName?: string
  configContract?: string
  protocol?: string
  privacy?: string
}

export interface IndexerEditorData {
  id: number
  name: string
  definitionName: string
  implementation: string
  implementationName: string
  configContract: string
  protocol: string
  privacy: string
  language: string | null
  enable: boolean
  priority: number
  appProfileId: number
  tags: number[]
  fields: IndexerField[]
  indexerUrls: string[]
}

export interface IndexerStatsSummary {
  queries: number
  grabs: number
  failedQueries: number
  failedGrabs: number
  averageResponseTime: number
}

export interface IndexerTrackerBadge {
  id: string
  trackerType: IndexerTrackerType
  enabled: boolean
}

export interface IndexerSummary {
  id: number
  name: string
  definitionName: string
  implementation: string
  implementationName: string
  protocol: string
  privacy: IndexerPrivacy
  language: string | null
  enable: boolean
  priority: number
  appProfileId: number
  added: string | null
  tags: number[]
  tracker: IndexerTrackerBadge | null
  stats: IndexerStatsSummary | null
  disabledByProwlarr: boolean
}

export interface IndexerListSummary {
  total: number
  enabled: number
  private: number
  disabledByProwlarr: number
  linkedTrackers: number
}

export interface IndexerListResponse {
  indexers: IndexerSummary[]
  summary: IndexerListSummary
}

export interface IndexerAppProfile {
  id: number
  name: string
  enableRss: boolean
  enableAutomaticSearch: boolean
  enableInteractiveSearch: boolean
  minimumSeeders: number
}

export interface IndexerTag {
  id: number
  label: string
}

export interface IndexerMetaResponse {
  appProfiles: IndexerAppProfile[]
  tags: IndexerTag[]
  version: string | null
}

export interface IndexerTrackerLinkInput {
  enabled: boolean
  trackerType: IndexerTrackerType
  cookie?: string
  loginUrl?: string
  loginUsername?: string
  loginPassword?: string
}

export interface IndexerTrackerLinkView {
  id: string
  indexerName: string
  trackerType: IndexerTrackerType
  cookie: string
  loginUrl: string | null
  loginUsername: string | null
  hasPassword: boolean
  enabled: boolean
}

export interface IndexerDetailResponse {
  indexer: IndexerEditorData
  tracker: IndexerTrackerLinkView | null
}

export interface IndexerSaveBody {
  indexer: IndexerPayload
  tracker?: IndexerTrackerLinkInput | null
}

export interface IndexerTestBody {
  id?: number
  indexer?: IndexerPayload
}

export interface IndexerValidationFailure {
  propertyName?: string
  errorMessage: string
  severity?: string
  isWarning?: boolean
}

export interface IndexerTestResult {
  id?: number
  isValid: boolean
  validationFailures: IndexerValidationFailure[]
}

export interface IndexerTestAllResponse {
  results: IndexerTestResult[]
}

export interface IndexerCaptchaRequest {
  type: string
  contentType: string
  imageData: string
}

export interface IndexerCaptchaResponse {
  captchaRequest: IndexerCaptchaRequest | null
}

export interface IndexerBulkUpdateBody {
  ids: number[]
  enable: boolean
}

export interface IndexerBulkDeleteBody {
  ids: number[]
}

export interface IndexerQuickUpdateBody {
  enable?: boolean
  priority?: number
  appProfileId?: number
}

export interface IndexerConfigStatus {
  configured: boolean
}
