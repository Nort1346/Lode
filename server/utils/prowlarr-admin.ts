import type {
  IndexerAppProfile,
  IndexerCaptchaResponse,
  IndexerDefinitionDetail,
  IndexerDefinitionSummary,
  IndexerEditorData,
  IndexerField,
  IndexerFieldValue,
  IndexerPayload,
  IndexerPrivacy,
  IndexerSelectOption,
  IndexerTag,
  IndexerTestResult,
  IndexerValidationFailure
} from '#shared/indexers'
import type {
  ProwlarrAppProfile,
  ProwlarrIndexerDefinition,
  ProwlarrIndexerResource,
  ProwlarrIndexerStatsItem,
  ProwlarrIndexerStatsResponse,
  ProwlarrIndexerStatusItem,
  ProwlarrSystemStatus,
  ProwlarrTag
} from '#server/types/prowlarr-admin'
import { createLogger } from '#server/utils/logger'

const log = createLogger('ProwlarrAdmin')

const ADMIN_REQUEST_TIMEOUT_MS = 30_000
const ADMIN_TEST_TIMEOUT_MS = 120_000
const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface AdminRequestOptions {
  method?: RequestMethod
  body?: unknown
  timeoutMs?: number
}

export class ProwlarrAdminError extends Error {
  readonly status: number
  readonly failures: IndexerValidationFailure[]

  constructor(message: string, status: number, failures: IndexerValidationFailure[] = []) {
    super(message)
    this.name = 'ProwlarrAdminError'
    this.status = status
    this.failures = failures
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
}

function toValidationFailure(value: unknown): IndexerValidationFailure | null {
  if (!isRecord(value) || typeof value.errorMessage !== 'string') return null
  const failure: IndexerValidationFailure = { errorMessage: value.errorMessage }
  if (typeof value.propertyName === 'string') failure.propertyName = value.propertyName
  if (typeof value.severity === 'string') failure.severity = value.severity
  if (typeof value.isWarning === 'boolean') failure.isWarning = value.isWarning
  return failure
}

function parseValidationFailures(text: string): IndexerValidationFailure[] {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => toValidationFailure(item))
      .filter((item): item is IndexerValidationFailure => item !== null)
  } catch {
    return []
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
}

function toSelectOption(value: unknown): IndexerSelectOption | null {
  if (
    !isRecord(value) ||
    (typeof value.value !== 'number' && typeof value.value !== 'string') ||
    typeof value.name !== 'string'
  ) {
    return null
  }
  const option: IndexerSelectOption = { value: value.value, name: value.name }
  if (typeof value.order === 'number') option.order = value.order
  if (typeof value.hint === 'string') option.hint = value.hint
  return option
}

function toField(value: unknown): IndexerField | null {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.type !== 'string') return null

  const field: IndexerField = {
    order: typeof value.order === 'number' ? value.order : 0,
    name: value.name,
    type: value.type
  }

  if (typeof value.label === 'string') field.label = value.label
  if (typeof value.helpText === 'string') field.helpText = value.helpText
  if (typeof value.helpLink === 'string') field.helpLink = value.helpLink
  if (
    value.value === null ||
    typeof value.value === 'string' ||
    typeof value.value === 'number' ||
    typeof value.value === 'boolean'
  ) {
    field.value = value.value
  }
  if (typeof value.advanced === 'boolean') field.advanced = value.advanced
  if (typeof value.hidden === 'string' || value.hidden === null) field.hidden = value.hidden
  if (typeof value.privacy === 'string') field.privacy = value.privacy
  if (typeof value.isFloat === 'boolean') field.isFloat = value.isFloat
  if (typeof value.unit === 'string') field.unit = value.unit
  if (typeof value.selectOptionsProviderAction === 'string') {
    field.selectOptionsProviderAction = value.selectOptionsProviderAction
  }
  if (Array.isArray(value.selectOptions)) {
    field.selectOptions = value.selectOptions
      .map((option) => toSelectOption(option))
      .filter((option): option is IndexerSelectOption => option !== null)
  }

  return field
}

function toFieldArray(value: unknown): IndexerField[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => toField(item)).filter((item): item is IndexerField => item !== null)
}

function toIndexerResource(value: unknown): ProwlarrIndexerResource | null {
  if (!isRecord(value) || typeof value.id !== 'number' || typeof value.name !== 'string') return null

  return {
    id: value.id,
    name: value.name,
    definitionName: typeof value.definitionName === 'string' ? value.definitionName : '',
    implementation: typeof value.implementation === 'string' ? value.implementation : '',
    implementationName: typeof value.implementationName === 'string' ? value.implementationName : '',
    configContract: typeof value.configContract === 'string' ? value.configContract : '',
    protocol: typeof value.protocol === 'string' ? value.protocol : 'torrent',
    privacy: typeof value.privacy === 'string' ? value.privacy : 'private',
    language: typeof value.language === 'string' ? value.language : undefined,
    enable: value.enable === true,
    priority: typeof value.priority === 'number' ? value.priority : 25,
    appProfileId: typeof value.appProfileId === 'number' ? value.appProfileId : 0,
    tags: toNumberArray(value.tags),
    fields: toFieldArray(value.fields),
    indexerUrls: toStringArray(value.indexerUrls),
    added: typeof value.added === 'string' ? value.added : undefined,
    sortName: typeof value.sortName === 'string' ? value.sortName : undefined,
    downloadClientId: typeof value.downloadClientId === 'number' ? value.downloadClientId : undefined,
    capabilities: value.capabilities
  }
}

function toDefinition(value: unknown): ProwlarrIndexerDefinition | null {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.definitionName !== 'string') return null
  if (!Array.isArray(value.fields)) return null

  return {
    name: value.name,
    definitionName: value.definitionName,
    description: typeof value.description === 'string' ? value.description : undefined,
    language: typeof value.language === 'string' ? value.language : undefined,
    encoding: typeof value.encoding === 'string' ? value.encoding : undefined,
    privacy: typeof value.privacy === 'string' ? value.privacy : undefined,
    protocol: typeof value.protocol === 'string' ? value.protocol : undefined,
    implementation: typeof value.implementation === 'string' ? value.implementation : 'Cardigann',
    implementationName: typeof value.implementationName === 'string' ? value.implementationName : 'Cardigann',
    configContract: typeof value.configContract === 'string' ? value.configContract : 'CardigannSettings',
    indexerUrls: toStringArray(value.indexerUrls),
    legacyUrls: toStringArray(value.legacyUrls),
    supportsSearch: value.supportsSearch === true,
    supportsRss: value.supportsRss === true,
    infoLink: typeof value.infoLink === 'string' ? value.infoLink : undefined,
    enable: value.enable === true,
    priority: typeof value.priority === 'number' ? value.priority : 25,
    appProfileId: typeof value.appProfileId === 'number' ? value.appProfileId : 0,
    tags: toNumberArray(value.tags),
    fields: toFieldArray(value.fields),
    capabilities: value.capabilities
  }
}

function toAppProfile(value: unknown): ProwlarrAppProfile | null {
  if (!isRecord(value) || typeof value.id !== 'number' || typeof value.name !== 'string') return null
  return {
    id: value.id,
    name: value.name,
    enableRss: value.enableRss === true,
    enableAutomaticSearch: value.enableAutomaticSearch === true,
    enableInteractiveSearch: value.enableInteractiveSearch === true,
    minimumSeeders: typeof value.minimumSeeders === 'number' ? value.minimumSeeders : 0
  }
}

function toTag(value: unknown): ProwlarrTag | null {
  if (!isRecord(value) || typeof value.id !== 'number' || typeof value.label !== 'string') return null
  return { id: value.id, label: value.label }
}

function toStatsItem(value: unknown): ProwlarrIndexerStatsItem | null {
  if (!isRecord(value) || typeof value.indexerId !== 'number' || typeof value.indexerName !== 'string') return null
  return {
    indexerId: value.indexerId,
    indexerName: value.indexerName,
    averageResponseTime: typeof value.averageResponseTime === 'number' ? value.averageResponseTime : 0,
    averageGrabResponseTime: typeof value.averageGrabResponseTime === 'number' ? value.averageGrabResponseTime : 0,
    numberOfQueries: typeof value.numberOfQueries === 'number' ? value.numberOfQueries : 0,
    numberOfGrabs: typeof value.numberOfGrabs === 'number' ? value.numberOfGrabs : 0,
    numberOfRssQueries: typeof value.numberOfRssQueries === 'number' ? value.numberOfRssQueries : 0,
    numberOfAuthQueries: typeof value.numberOfAuthQueries === 'number' ? value.numberOfAuthQueries : 0,
    numberOfFailedQueries: typeof value.numberOfFailedQueries === 'number' ? value.numberOfFailedQueries : 0,
    numberOfFailedGrabs: typeof value.numberOfFailedGrabs === 'number' ? value.numberOfFailedGrabs : 0,
    numberOfFailedRssQueries: typeof value.numberOfFailedRssQueries === 'number' ? value.numberOfFailedRssQueries : 0,
    numberOfFailedAuthQueries: typeof value.numberOfFailedAuthQueries === 'number' ? value.numberOfFailedAuthQueries : 0
  }
}

function toStatusItem(value: unknown): ProwlarrIndexerStatusItem | null {
  if (!isRecord(value) || typeof value.indexerId !== 'number') return null
  const item: ProwlarrIndexerStatusItem = { indexerId: value.indexerId }
  if (typeof value.disabledTill === 'string' || value.disabledTill === null) item.disabledTill = value.disabledTill
  if (typeof value.mostRecentFailure === 'string' || value.mostRecentFailure === null) {
    item.mostRecentFailure = value.mostRecentFailure
  }
  if (typeof value.initialFailure === 'string' || value.initialFailure === null)
    item.initialFailure = value.initialFailure
  if (typeof value.escalationLevel === 'number') item.escalationLevel = value.escalationLevel
  return item
}

function toTestResult(value: unknown): IndexerTestResult | null {
  if (!isRecord(value) || typeof value.isValid !== 'boolean') return null
  const failures = Array.isArray(value.validationFailures)
    ? value.validationFailures
        .map((failure) => toValidationFailure(failure))
        .filter((failure): failure is IndexerValidationFailure => failure !== null)
    : []
  const result: IndexerTestResult = { isValid: value.isValid, validationFailures: failures }
  if (typeof value.id === 'number') result.id = value.id
  return result
}

export class ProwlarrAdminClient {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey
  }

  private async request<T>(path: string, options: AdminRequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET'
    const timeoutMs = options.timeoutMs ?? ADMIN_REQUEST_TIMEOUT_MS
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Api-Key': this.apiKey
    }
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(options.body)
    }

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, init)
    } catch (err) {
      const message = isAbortError(err) ? `Prowlarr request timed out after ${timeoutMs}ms` : 'Prowlarr is unreachable'
      throw new ProwlarrAdminError(message, isAbortError(err) ? 504 : 502)
    }

    const text = await response.text()
    if (!response.ok) {
      const failures = parseValidationFailures(text)
      const message =
        failures.length > 0
          ? failures.map((failure) => failure.errorMessage).join('; ')
          : text.trim().slice(0, 300) || `Prowlarr HTTP ${response.status}`
      if (response.status === 401 || response.status === 403) {
        throw new ProwlarrAdminError('Prowlarr rejected the API key', 502)
      }
      throw new ProwlarrAdminError(message, response.status, failures)
    }

    if (text.trim().length === 0) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new ProwlarrAdminError('Prowlarr returned an invalid JSON response', 502)
    }
  }

  async getSystemStatus(): Promise<ProwlarrSystemStatus> {
    const raw = await this.request<unknown>('/api/v1/system/status')
    if (!isRecord(raw)) return {}
    return {
      appName: typeof raw.appName === 'string' ? raw.appName : undefined,
      version: typeof raw.version === 'string' ? raw.version : undefined,
      branch: typeof raw.branch === 'string' ? raw.branch : undefined
    }
  }

  async listIndexers(): Promise<ProwlarrIndexerResource[]> {
    const raw = await this.request<unknown>('/api/v1/indexer')
    if (!Array.isArray(raw)) throw new ProwlarrAdminError('Prowlarr returned an invalid indexer list', 502)
    return raw.map((item) => toIndexerResource(item)).filter((item): item is ProwlarrIndexerResource => item !== null)
  }

  async getIndexer(id: number): Promise<ProwlarrIndexerResource> {
    const raw = await this.getIndexerRaw(id)
    const resource = toIndexerResource(raw)
    if (resource === null) throw new ProwlarrAdminError('Prowlarr returned an invalid indexer payload', 502)
    return resource
  }

  async getIndexerRaw(id: number): Promise<Record<string, unknown>> {
    const raw = await this.request<unknown>(`/api/v1/indexer/${id}`)
    if (!isRecord(raw)) throw new ProwlarrAdminError('Prowlarr returned an invalid indexer payload', 502)
    return raw
  }

  async createIndexer(resource: Record<string, unknown>): Promise<ProwlarrIndexerResource> {
    const raw = await this.request<unknown>('/api/v1/indexer', { method: 'POST', body: resource })
    const created = toIndexerResource(raw)
    if (created === null) throw new ProwlarrAdminError('Prowlarr returned an invalid indexer payload', 502)
    return created
  }

  async updateIndexer(id: number, resource: Record<string, unknown>): Promise<ProwlarrIndexerResource> {
    const raw = await this.request<unknown>(`/api/v1/indexer/${id}`, { method: 'PUT', body: resource })
    const updated = toIndexerResource(raw)
    if (updated === null) throw new ProwlarrAdminError('Prowlarr returned an invalid indexer payload', 502)
    return updated
  }

  async deleteIndexer(id: number): Promise<void> {
    await this.request<unknown>(`/api/v1/indexer/${id}`, { method: 'DELETE', timeoutMs: ADMIN_TEST_TIMEOUT_MS })
  }

  async testIndexer(resource: Record<string, unknown>): Promise<IndexerTestResult> {
    try {
      await this.request<unknown>('/api/v1/indexer/test', {
        method: 'POST',
        body: resource,
        timeoutMs: ADMIN_TEST_TIMEOUT_MS
      })
      return { isValid: true, validationFailures: [] }
    } catch (err) {
      if (err instanceof ProwlarrAdminError && err.status === 400) {
        const failures =
          err.failures.length > 0 ? err.failures : [{ errorMessage: err.message } satisfies IndexerValidationFailure]
        return { isValid: false, validationFailures: failures }
      }
      throw err
    }
  }

  async testAllIndexers(): Promise<IndexerTestResult[]> {
    const raw = await this.request<unknown>('/api/v1/indexer/testall', {
      method: 'POST',
      body: {},
      timeoutMs: ADMIN_TEST_TIMEOUT_MS
    })
    if (!Array.isArray(raw)) return []
    return raw.map((item) => toTestResult(item)).filter((item): item is IndexerTestResult => item !== null)
  }

  async bulkUpdateIndexers(ids: number[], enable: boolean): Promise<void> {
    await this.request<unknown>('/api/v1/indexer/bulk', {
      method: 'PUT',
      body: { ids, enable },
      timeoutMs: ADMIN_TEST_TIMEOUT_MS
    })
  }

  async bulkDeleteIndexers(ids: number[]): Promise<void> {
    await this.request<unknown>('/api/v1/indexer/bulk', {
      method: 'DELETE',
      body: { ids },
      timeoutMs: ADMIN_TEST_TIMEOUT_MS
    })
  }

  async getSchema(): Promise<ProwlarrIndexerDefinition[]> {
    const raw = await this.request<unknown>('/api/v1/indexer/schema', { timeoutMs: ADMIN_TEST_TIMEOUT_MS })
    if (!Array.isArray(raw)) throw new ProwlarrAdminError('Prowlarr returned an invalid indexer schema', 502)
    return raw.map((item) => toDefinition(item)).filter((item): item is ProwlarrIndexerDefinition => item !== null)
  }

  async getAppProfiles(): Promise<ProwlarrAppProfile[]> {
    const raw = await this.request<unknown>('/api/v1/appprofile')
    if (!Array.isArray(raw)) return []
    return raw.map((item) => toAppProfile(item)).filter((item): item is ProwlarrAppProfile => item !== null)
  }

  async getTags(): Promise<ProwlarrTag[]> {
    const raw = await this.request<unknown>('/api/v1/tag')
    if (!Array.isArray(raw)) return []
    return raw.map((item) => toTag(item)).filter((item): item is ProwlarrTag => item !== null)
  }

  async getIndexerStatuses(): Promise<ProwlarrIndexerStatusItem[]> {
    const raw = await this.request<unknown>('/api/v1/indexerstatus')
    if (!Array.isArray(raw)) return []
    return raw.map((item) => toStatusItem(item)).filter((item): item is ProwlarrIndexerStatusItem => item !== null)
  }

  async getIndexerStats(): Promise<ProwlarrIndexerStatsResponse> {
    const raw = await this.request<unknown>('/api/v1/indexerstats')
    if (!isRecord(raw)) return { indexers: [] }
    const indexers = Array.isArray(raw.indexers)
      ? raw.indexers.map((item) => toStatsItem(item)).filter((item): item is ProwlarrIndexerStatsItem => item !== null)
      : []
    return { indexers }
  }

  async checkCaptcha(resource: Record<string, unknown>): Promise<IndexerCaptchaResponse> {
    const raw = await this.request<unknown>('/api/v1/indexer/action/checkCaptcha', {
      method: 'POST',
      body: resource,
      timeoutMs: ADMIN_TEST_TIMEOUT_MS
    })
    if (!isRecord(raw)) return { captchaRequest: null }
    const captcha = raw.captchaRequest
    if (!isRecord(captcha) || typeof captcha.contentType !== 'string' || typeof captcha.imageData !== 'string') {
      return { captchaRequest: null }
    }
    return {
      captchaRequest: {
        type: typeof captcha.type === 'string' ? captcha.type : 'image',
        contentType: captcha.contentType,
        imageData: captcha.imageData
      }
    }
  }
}

let _client: ProwlarrAdminClient | null = null
let _schemaCache: { fetchedAt: number; definitions: ProwlarrIndexerDefinition[] } | null = null

export function useProwlarrAdminClient(): ProwlarrAdminClient | null {
  const config = useRuntimeConfig()
  const url = config.prowlarrUrl as string
  const apiKey = config.prowlarrApiKey as string
  if (!url || !apiKey) return null
  if (_client === null) {
    _client = new ProwlarrAdminClient(url, apiKey)
  }
  return _client
}

export function requireProwlarrAdminClient(): ProwlarrAdminClient {
  const client = useProwlarrAdminClient()
  if (client === null) {
    throw createError({ statusCode: 503, statusMessage: 'Prowlarr is not configured' })
  }
  return client
}

export async function getProwlarrIndexerSchema(force = false): Promise<ProwlarrIndexerDefinition[]> {
  if (!force && _schemaCache !== null && Date.now() - _schemaCache.fetchedAt < SCHEMA_CACHE_TTL_MS) {
    return _schemaCache.definitions
  }
  const client = requireProwlarrAdminClient()
  const definitions = await client.getSchema()
  _schemaCache = { fetchedAt: Date.now(), definitions }
  return definitions
}

export function clearProwlarrIndexerSchemaCache(): void {
  _schemaCache = null
}

export function normalizePrivacy(value: unknown): IndexerPrivacy {
  if (value === 'public') return 'public'
  if (value === 'semiPrivate') return 'semiPrivate'
  return 'private'
}

export function toDefinitionSummary(definition: ProwlarrIndexerDefinition): IndexerDefinitionSummary {
  const urls = definition.indexerUrls ?? []
  return {
    name: definition.name,
    definitionName: definition.definitionName,
    description: definition.description ?? '',
    language: definition.language ?? '',
    privacy: normalizePrivacy(definition.privacy),
    protocol: definition.protocol ?? 'torrent',
    implementation: definition.implementation,
    implementationName: definition.implementationName,
    supportsSearch: definition.supportsSearch === true,
    indexerUrl: urls[0] ?? null
  }
}

export function toDefinitionDetail(definition: ProwlarrIndexerDefinition): IndexerDefinitionDetail {
  return {
    ...toDefinitionSummary(definition),
    configContract: definition.configContract,
    encoding: definition.encoding ?? null,
    indexerUrls: definition.indexerUrls ?? [],
    legacyUrls: definition.legacyUrls ?? [],
    infoLink: definition.infoLink ?? null,
    fields: definition.fields
  }
}

export function toEditorData(resource: ProwlarrIndexerResource): IndexerEditorData {
  return {
    id: resource.id,
    name: resource.name,
    definitionName: resource.definitionName,
    implementation: resource.implementation,
    implementationName: resource.implementationName,
    configContract: resource.configContract,
    protocol: resource.protocol,
    privacy: resource.privacy,
    language: resource.language ?? null,
    enable: resource.enable,
    priority: resource.priority,
    appProfileId: resource.appProfileId,
    tags: resource.tags,
    fields: resource.fields,
    indexerUrls: resource.indexerUrls ?? []
  }
}

function isValidFieldValue(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function normalizeFieldValues(fields: IndexerFieldValue[]): IndexerFieldValue[] {
  const normalized: IndexerFieldValue[] = []
  const seen = new Set<string>()
  for (const field of fields) {
    const name = typeof field.name === 'string' ? field.name.trim() : ''
    if (name.length === 0 || !isValidFieldValue(field.value)) continue
    if (seen.has(name)) continue
    seen.add(name)
    normalized.push({ name, value: field.value })
  }
  return normalized
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: `${field} is required` })
  }
  return value.trim()
}

export function validateIndexerPayload(payload: IndexerPayload, mode: 'create' | 'update'): void {
  requireString(payload.name, 'indexer.name')
  if (!Number.isInteger(payload.appProfileId) || payload.appProfileId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'indexer.appProfileId must be greater than 0' })
  }
  if (!Number.isInteger(payload.priority) || payload.priority < 1 || payload.priority > 50) {
    throw createError({ statusCode: 400, statusMessage: 'indexer.priority must be between 1 and 50' })
  }
  if (!Array.isArray(payload.fields)) {
    throw createError({ statusCode: 400, statusMessage: 'indexer.fields must be an array' })
  }
  if (mode === 'create') {
    requireString(payload.definitionName, 'indexer.definitionName')
    requireString(payload.implementation, 'indexer.implementation')
    requireString(payload.implementationName, 'indexer.implementationName')
    requireString(payload.configContract, 'indexer.configContract')
    requireString(payload.protocol, 'indexer.protocol')
    requireString(payload.privacy, 'indexer.privacy')
  }
}

export function buildIndexerResource(payload: IndexerPayload, base?: Record<string, unknown>): Record<string, unknown> {
  validateIndexerPayload(payload, base === undefined ? 'create' : 'update')

  const definitionName =
    typeof base?.definitionName === 'string' ? base.definitionName : (payload.definitionName ?? '').trim()
  const fields = normalizeFieldValues(payload.fields)
  if (!fields.some((field) => field.name === 'definitionFile') && definitionName.length > 0) {
    fields.unshift({ name: 'definitionFile', value: definitionName })
  }

  const resource: Record<string, unknown> = base === undefined ? {} : { ...base }
  resource.name = payload.name.trim()
  resource.enable = payload.enable
  resource.priority = payload.priority
  resource.appProfileId = payload.appProfileId
  resource.tags = Array.isArray(payload.tags)
    ? [...new Set(payload.tags.filter((tag) => typeof tag === 'number' && Number.isInteger(tag)))]
    : []
  resource.fields = fields

  if (base === undefined) {
    resource.definitionName = definitionName
    resource.implementation = payload.implementation
    resource.implementationName = payload.implementationName
    resource.configContract = payload.configContract
    resource.protocol = payload.protocol
    resource.privacy = payload.privacy
    resource.downloadClientId = 0
  }

  return resource
}

export function parseIndexerId(value: string | undefined): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Indexer ID is required' })
  }
  return id
}

export function parseIndexerIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'ids must be an array' })
  }
  const ids = value.filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0)
  if (ids.length !== value.length || ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'ids must contain positive integers' })
  }
  return [...new Set(ids)]
}

export function throwProwlarrAdminError(err: unknown): never {
  if (err instanceof ProwlarrAdminError) {
    const statusCode =
      err.status === 400 || err.status === 404 || err.status === 409 ? err.status : err.status === 504 ? 504 : 502
    log.warn(`Prowlarr admin error (${err.status}): ${err.message}`)
    throw createError({
      statusCode,
      statusMessage: err.message,
      data: err.failures.length > 0 ? { failures: err.failures } : undefined
    })
  }
  const message = err instanceof Error ? err.message : String(err)
  log.error(`Unexpected Prowlarr admin error: ${message}`)
  throw createError({ statusCode: 502, statusMessage: 'Prowlarr request failed' })
}

export async function runProwlarrAdmin<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throwProwlarrAdminError(err)
  }
}

export function toAppProfileView(profile: ProwlarrAppProfile): IndexerAppProfile {
  return {
    id: profile.id,
    name: profile.name,
    enableRss: profile.enableRss === true,
    enableAutomaticSearch: profile.enableAutomaticSearch === true,
    enableInteractiveSearch: profile.enableInteractiveSearch === true,
    minimumSeeders: profile.minimumSeeders ?? 0
  }
}

export function toTagView(tag: ProwlarrTag): IndexerTag {
  return { id: tag.id, label: tag.label }
}
