import type {
  IndexerDefinitionDetail,
  IndexerEditorData,
  IndexerField,
  IndexerFieldValue,
  IndexerPayload,
  IndexerTrackerLinkInput,
  IndexerTrackerLinkView
} from '#shared/indexers'
import type { IndexerFormState, IndexerTrackerFormState } from '~/types/indexers'

export function emptyIndexerForm(): IndexerFormState {
  return {
    name: '',
    enable: true,
    priority: 25,
    appProfileId: 0,
    tags: [],
    fields: {}
  }
}

export function emptyTrackerForm(): IndexerTrackerFormState {
  return {
    enabled: false,
    trackerType: 'counting',
    authMethod: 'cookie',
    cookie: '',
    loginUrl: '',
    loginUsername: '',
    loginPassword: '',
    hasStoredPassword: false
  }
}

function isVisible(field: IndexerField): boolean {
  if (field.hidden === 'hidden' && field.name !== 'definitionFile') return false
  return true
}

function isStorable(field: IndexerField): boolean {
  return field.name !== 'definitionFile' && field.type !== 'info'
}

function defaultValue(field: IndexerField): string | number | boolean | null {
  if (field.value !== undefined) return field.value
  if (field.type === 'checkbox') return false
  if (field.type === 'number') return null
  if (field.type === 'select') return field.selectOptions?.[0]?.value ?? null
  return ''
}

function baseUrlOptions(field: IndexerField, indexerUrls: string[]): IndexerField[] {
  const options =
    field.selectOptions !== undefined && field.selectOptions.length > 0
      ? field.selectOptions
      : indexerUrls.map((url, index) => ({ value: url, name: url, order: index }))

  return [
    {
      ...field,
      type: 'select',
      selectOptions: options
    }
  ]
}

function resolveFields(fields: IndexerField[], indexerUrls: string[]): IndexerField[] {
  const resolved: IndexerField[] = []
  for (const field of fields) {
    if (!isVisible(field)) continue
    if (field.name === 'definitionFile') continue
    if (field.type === 'select' && field.selectOptionsProviderAction === 'getUrls') {
      resolved.push(...baseUrlOptions(field, indexerUrls))
      continue
    }
    resolved.push(field)
  }
  return resolved
}

export function buildCreateForm(definition: IndexerDefinitionDetail, appProfileId: number): IndexerFormState {
  const fields: Record<string, string | number | boolean | null> = {}
  for (const field of resolveFields(definition.fields, definition.indexerUrls)) {
    if (!isStorable(field)) continue
    fields[field.name] = defaultValue(field)
  }

  return {
    name: definition.name,
    enable: true,
    priority: 25,
    appProfileId,
    tags: [],
    fields
  }
}

export function buildEditForm(indexer: IndexerEditorData): IndexerFormState {
  const fields: Record<string, string | number | boolean | null> = {}
  for (const field of indexer.fields) {
    if (!isStorable(field)) continue
    fields[field.name] = field.value !== undefined ? field.value : defaultValue(field)
  }

  return {
    name: indexer.name,
    enable: indexer.enable,
    priority: indexer.priority,
    appProfileId: indexer.appProfileId,
    tags: [...indexer.tags],
    fields
  }
}

export function toFieldValues(fields: Record<string, string | number | boolean | null>): IndexerFieldValue[] {
  return Object.entries(fields).map(([name, value]) => ({ name, value }))
}

export function buildIndexerPayload(
  form: IndexerFormState,
  definition?: IndexerDefinitionDetail | null
): IndexerPayload {
  const payload: IndexerPayload = {
    name: form.name.trim(),
    enable: form.enable,
    priority: form.priority,
    appProfileId: form.appProfileId,
    tags: [...form.tags],
    fields: toFieldValues(form.fields)
  }

  if (definition !== undefined && definition !== null) {
    payload.definitionName = definition.definitionName
    payload.implementation = definition.implementation
    payload.implementationName = definition.implementationName
    payload.configContract = definition.configContract
    payload.protocol = definition.protocol
    payload.privacy = definition.privacy
  }

  return payload
}

export function buildTrackerLink(form: IndexerTrackerFormState): IndexerTrackerLinkInput | null {
  if (!form.enabled) return null

  const link: IndexerTrackerLinkInput = {
    enabled: true,
    trackerType: form.trackerType
  }

  if (form.trackerType === 'guid') {
    if (form.authMethod === 'cookie') {
      link.cookie = form.cookie.trim()
    } else {
      link.loginUrl = form.loginUrl.trim()
      link.loginUsername = form.loginUsername.trim()
      if (form.loginPassword.trim().length > 0) {
        link.loginPassword = form.loginPassword.trim()
      }
    }
  }

  return link
}

export function toTrackerForm(tracker: IndexerTrackerLinkView | null): IndexerTrackerFormState {
  const form = emptyTrackerForm()
  if (tracker === null) return form

  form.enabled = true
  form.trackerType = tracker.trackerType
  form.hasStoredPassword = tracker.hasPassword

  if (tracker.trackerType === 'guid') {
    const hasLogin =
      tracker.loginUrl !== null &&
      tracker.loginUrl !== '' &&
      tracker.loginUsername !== null &&
      tracker.loginUsername !== ''
    form.authMethod = hasLogin ? 'login' : 'cookie'
    form.loginUrl = tracker.loginUrl ?? ''
    form.loginUsername = tracker.loginUsername ?? ''
    form.cookie = tracker.cookie
  }

  return form
}

export function fieldsForDisplay(
  fields: IndexerField[],
  indexerUrls: string[]
): { normal: IndexerField[]; advanced: IndexerField[] } {
  const normal: IndexerField[] = []
  const advanced: IndexerField[] = []

  for (const field of resolveFields(fields, indexerUrls)) {
    if (field.type === 'info' || field.advanced !== true) {
      normal.push(field)
    } else {
      advanced.push(field)
    }
  }

  return { normal, advanced }
}

export function findBaseUrl(fields: Record<string, string | number | boolean | null>): string {
  const value = fields.baseUrl
  return typeof value === 'string' ? value : ''
}

export function findCaptchaField(fields: IndexerField[]): IndexerField | null {
  return fields.find((field) => field.type === 'cardigannCaptcha') ?? null
}
