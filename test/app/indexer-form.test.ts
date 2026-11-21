import { describe, expect, it } from 'vitest'
import {
  buildCreateForm,
  buildEditForm,
  buildIndexerPayload,
  buildTrackerLink,
  emptyIndexerForm,
  emptyTrackerForm,
  fieldsForDisplay,
  findBaseUrl,
  findCaptchaField,
  toFieldValues,
  toTrackerForm
} from '~/utils/indexer-form'
import type { IndexerDefinitionDetail, IndexerEditorData, IndexerField, IndexerTrackerLinkView } from '#shared/indexers'

const baseUrlField: IndexerField = {
  order: 1,
  name: 'baseUrl',
  label: 'Base URL',
  type: 'select',
  selectOptionsProviderAction: 'getUrls'
}

const definition: IndexerDefinitionDetail = {
  name: 'My Tracker',
  definitionName: 'mytracker',
  description: 'A private tracker',
  language: 'en-US',
  privacy: 'private',
  protocol: 'torrent',
  implementation: 'Cardigann',
  implementationName: 'Cardigann',
  supportsSearch: true,
  indexerUrl: 'https://tracker.test/',
  configContract: 'CardigannSettings',
  encoding: null,
  indexerUrls: ['https://tracker.test/', 'https://tracker2.test/'],
  legacyUrls: [],
  infoLink: null,
  fields: [
    baseUrlField,
    { order: 2, name: 'username', label: 'Username', type: 'textbox' },
    { order: 3, name: 'password', label: 'Password', type: 'password' },
    { order: 4, name: 'freeleech', label: 'Freeleech only', type: 'checkbox', value: true },
    { order: 5, name: 'limit', label: 'Limit', type: 'number' },
    { order: 6, name: 'sort', label: 'Sort', type: 'select', selectOptions: [{ value: 0, name: 'Seeders' }] },
    { order: 7, name: 'notice', label: 'Notice', type: 'info' },
    { order: 8, name: 'definitionFile', type: 'textbox', hidden: 'hidden' },
    { order: 9, name: 'secret', type: 'textbox', hidden: 'hidden' },
    { order: 10, name: 'advancedField', type: 'textbox', advanced: true },
    { order: 11, name: 'captcha', label: 'CAPTCHA', type: 'cardigannCaptcha' }
  ]
}

const editorData: IndexerEditorData = {
  id: 7,
  name: 'My Tracker',
  definitionName: 'mytracker',
  implementation: 'Cardigann',
  implementationName: 'Cardigann',
  configContract: 'CardigannSettings',
  protocol: 'torrent',
  privacy: 'private',
  language: 'en-US',
  enable: false,
  priority: 10,
  appProfileId: 3,
  tags: [2, 4],
  indexerUrls: ['https://tracker.test/'],
  fields: [
    { order: 1, name: 'baseUrl', type: 'select', value: 'https://tracker.test/' },
    { order: 2, name: 'username', type: 'textbox', value: 'user' },
    { order: 3, name: 'freeleech', type: 'checkbox', value: false },
    { order: 4, name: 'notice', type: 'info', value: 'ignored' },
    { order: 5, name: 'definitionFile', type: 'textbox', value: 'mytracker' },
    { order: 6, name: 'secret', type: 'textbox', hidden: 'hidden', value: 'keep-me' }
  ]
}

describe('indexer-form', () => {
  it('builds a create form with defaults and base URL options', () => {
    const form = buildCreateForm(definition, 1)

    expect(form.name).toBe('My Tracker')
    expect(form.enable).toBe(true)
    expect(form.priority).toBe(25)
    expect(form.appProfileId).toBe(1)
    expect(form.tags).toEqual([])
    expect(form.fields.baseUrl).toBe('https://tracker.test/')
    expect(form.fields.username).toBe('')
    expect(form.fields.password).toBe('')
    expect(form.fields.freeleech).toBe(true)
    expect(form.fields.limit).toBeNull()
    expect(form.fields.sort).toBe(0)
    expect(form.fields.notice).toBeUndefined()
    expect(form.fields.definitionFile).toBeUndefined()
    expect(form.fields.secret).toBeUndefined()
    expect(form.fields.advancedField).toBe('')
    expect(form.fields.captcha).toBe('')
  })

  it('builds an edit form from indexer data and keeps hidden values', () => {
    const form = buildEditForm(editorData)

    expect(form.name).toBe('My Tracker')
    expect(form.enable).toBe(false)
    expect(form.priority).toBe(10)
    expect(form.appProfileId).toBe(3)
    expect(form.tags).toEqual([2, 4])
    expect(form.fields.username).toBe('user')
    expect(form.fields.freeleech).toBe(false)
    expect(form.fields.secret).toBe('keep-me')
    expect(form.fields.notice).toBeUndefined()
    expect(form.fields.definitionFile).toBeUndefined()
  })

  it('converts field records into Prowlarr field values', () => {
    expect(toFieldValues({ a: 'x', b: 2, c: null })).toEqual([
      { name: 'a', value: 'x' },
      { name: 'b', value: 2 },
      { name: 'c', value: null }
    ])
  })

  it('includes definition metadata only when creating', () => {
    const form = buildCreateForm(definition, 1)
    const createPayload = buildIndexerPayload(form, definition)
    const editPayload = buildIndexerPayload(buildEditForm(editorData))

    expect(createPayload.definitionName).toBe('mytracker')
    expect(createPayload.implementation).toBe('Cardigann')
    expect(createPayload.privacy).toBe('private')
    expect(createPayload.fields).toContainEqual({ name: 'baseUrl', value: 'https://tracker.test/' })
    expect(editPayload.definitionName).toBeUndefined()
    expect(editPayload.name).toBe('My Tracker')
    expect(editPayload.fields).toContainEqual({ name: 'secret', value: 'keep-me' })
  })

  it('trims the indexer name in the payload', () => {
    const form = emptyIndexerForm()
    form.name = '  Spaced  '
    expect(buildIndexerPayload(form).name).toBe('Spaced')
  })

  it('returns null when the tracker link is disabled', () => {
    expect(buildTrackerLink(emptyTrackerForm())).toBeNull()
  })

  it('builds a counting tracker link without credentials', () => {
    const form = emptyTrackerForm()
    form.enabled = true
    form.cookie = 'ignored'

    expect(buildTrackerLink(form)).toEqual({
      enabled: true,
      trackerType: 'counting'
    })
  })

  it('builds cookie and login tracker links', () => {
    const cookieForm = emptyTrackerForm()
    cookieForm.enabled = true
    cookieForm.trackerType = 'guid'
    cookieForm.cookie = ' session '

    expect(buildTrackerLink(cookieForm)).toEqual({
      enabled: true,
      trackerType: 'guid',
      cookie: 'session'
    })

    const loginForm = emptyTrackerForm()
    loginForm.enabled = true
    loginForm.trackerType = 'guid'
    loginForm.authMethod = 'login'
    loginForm.loginUrl = ' https://tracker.test/login '
    loginForm.loginUsername = ' user '
    loginForm.loginPassword = ''

    expect(buildTrackerLink(loginForm)).toEqual({
      enabled: true,
      trackerType: 'guid',
      loginUrl: 'https://tracker.test/login',
      loginUsername: 'user'
    })
  })

  it('maps stored trackers back into the form', () => {
    const tracker: IndexerTrackerLinkView = {
      id: 'tracker-1',
      indexerName: 'My Tracker',
      trackerType: 'guid',
      cookie: '',
      loginUrl: 'https://tracker.test/login',
      loginUsername: 'user',
      hasPassword: true,
      enabled: true
    }

    const form = toTrackerForm(tracker)

    expect(form.enabled).toBe(true)
    expect(form.trackerType).toBe('guid')
    expect(form.authMethod).toBe('login')
    expect(form.loginUrl).toBe('https://tracker.test/login')
    expect(form.loginUsername).toBe('user')
    expect(form.hasStoredPassword).toBe(true)
    expect(form.loginPassword).toBe('')
  })

  it('returns an empty tracker form for a null tracker', () => {
    expect(toTrackerForm(null)).toEqual(emptyTrackerForm())
  })

  it('splits normal and advanced fields, resolving base URLs', () => {
    const groups = fieldsForDisplay(definition.fields, definition.indexerUrls)

    const baseUrl = groups.normal.find((field) => field.name === 'baseUrl')
    expect(baseUrl?.type).toBe('select')
    expect(baseUrl?.selectOptions).toEqual([
      { value: 'https://tracker.test/', name: 'https://tracker.test/', order: 0 },
      { value: 'https://tracker2.test/', name: 'https://tracker2.test/', order: 1 }
    ])
    expect(groups.normal.some((field) => field.name === 'advancedField')).toBe(false)
    expect(groups.advanced.map((field) => field.name)).toEqual(['advancedField'])
    expect(groups.normal.some((field) => field.name === 'definitionFile')).toBe(false)
    expect(groups.normal.some((field) => field.name === 'secret')).toBe(false)
  })

  it('finds base URLs and CAPTCHA fields', () => {
    expect(findBaseUrl({ baseUrl: 'https://tracker.test/' })).toBe('https://tracker.test/')
    expect(findBaseUrl({ baseUrl: 1 })).toBe('')
    expect(findBaseUrl({})).toBe('')
    expect(findCaptchaField(definition.fields)?.name).toBe('captcha')
    expect(findCaptchaField([])).toBeNull()
  })
})
