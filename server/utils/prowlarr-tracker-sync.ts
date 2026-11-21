import { randomUUID } from 'node:crypto'
import { encryptAES } from '#server/utils/crypto'
import { getReposAsync } from '#server/repositories'
import type { CustomTracker } from '#server/types/entities'
import type { IndexerTrackerLinkInput, IndexerTrackerLinkView, IndexerTrackerType } from '#shared/indexers'

export type TrackerSyncAction = 'none' | 'created' | 'updated' | 'renamed'

export interface TrackerSyncResult {
  action: TrackerSyncAction
  trackerId: string | null
}

function trimmed(value: string | undefined): string {
  return value?.trim() ?? ''
}

function hasStoredPassword(tracker: CustomTracker | undefined): boolean {
  return tracker !== undefined && tracker.loginPassword !== null && tracker.loginPassword.length > 0
}

function validateTrackerCredentials(link: IndexerTrackerLinkInput, current?: CustomTracker): void {
  if (link.trackerType !== 'guid') return

  const hasCookie = trimmed(link.cookie).length > 0
  const loginUrl = trimmed(link.loginUrl)
  const loginUsername = trimmed(link.loginUsername)
  const newPassword = trimmed(link.loginPassword)
  const hasLogin =
    loginUrl.length > 0 && loginUsername.length > 0 && (newPassword.length > 0 || hasStoredPassword(current))

  if (hasCookie && hasLogin) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provide either a tracker cookie OR login credentials, not both'
    })
  }
  if (!hasCookie && !hasLogin) {
    throw createError({
      statusCode: 400,
      statusMessage: 'GUID trackers require a cookie or login URL + username + password'
    })
  }
}

export async function assertIndexerTrackerLink(
  indexerName: string,
  previousName: string | undefined,
  link: IndexerTrackerLinkInput | null | undefined
): Promise<void> {
  if (link === null || link === undefined || !link.enabled) return

  const repos = await getReposAsync()
  const currentByName = await repos.customTrackers.findByIndexerName(indexerName)
  const previous =
    previousName !== undefined && previousName !== indexerName
      ? await repos.customTrackers.findByIndexerName(previousName)
      : undefined

  if (previous !== undefined && currentByName !== undefined && currentByName.id !== previous.id) {
    throw createError({ statusCode: 409, statusMessage: `Tracker "${indexerName}" already exists` })
  }

  const current = currentByName ?? (previous !== undefined && currentByName === undefined ? previous : undefined)
  validateTrackerCredentials(link, current)
}

export async function syncIndexerTracker(
  indexerName: string,
  previousName: string | undefined,
  link: IndexerTrackerLinkInput | null | undefined
): Promise<TrackerSyncResult> {
  const repos = await getReposAsync()
  const target = await repos.customTrackers.findByIndexerName(indexerName)
  const previous =
    previousName !== undefined && previousName !== indexerName
      ? await repos.customTrackers.findByIndexerName(previousName)
      : undefined

  let current = target
  let action: TrackerSyncAction = 'none'

  if (target === undefined && previous !== undefined) {
    await repos.customTrackers.update(previous.id, { indexerName })
    current = { ...previous, indexerName }
    action = 'renamed'
  }

  if (link === null || link === undefined || !link.enabled) {
    return { action, trackerId: current?.id ?? null }
  }

  validateTrackerCredentials(link, current)

  const trackerType: IndexerTrackerType = link.trackerType === 'guid' ? 'guid' : 'counting'
  let cookie = ''
  let loginUrl: string | null = null
  let loginUsername: string | null = null
  let loginPassword: string | null = null

  if (trackerType === 'guid') {
    const cookieValue = trimmed(link.cookie)
    if (cookieValue.length > 0) {
      cookie = cookieValue
    } else {
      loginUrl = trimmed(link.loginUrl)
      loginUsername = trimmed(link.loginUsername)
      const newPassword = trimmed(link.loginPassword)
      loginPassword = newPassword.length > 0 ? encryptAES(newPassword) : (current?.loginPassword ?? null)
    }
  }

  const data = {
    indexerName,
    trackerType,
    cookie,
    loginUrl,
    loginUsername,
    loginPassword
  }

  if (current !== undefined) {
    await repos.customTrackers.update(current.id, data)
    return { action: action === 'renamed' ? 'renamed' : 'updated', trackerId: current.id }
  }

  const id = randomUUID()
  await repos.customTrackers.create({
    id,
    ...data,
    enabled: true,
    createdAt: new Date().toISOString()
  })
  return { action: 'created', trackerId: id }
}

export function toIndexerTrackerView(tracker: CustomTracker): IndexerTrackerLinkView {
  return {
    id: tracker.id,
    indexerName: tracker.indexerName,
    trackerType: tracker.trackerType,
    cookie: tracker.cookie,
    loginUrl: tracker.loginUrl,
    loginUsername: tracker.loginUsername,
    hasPassword: hasStoredPassword(tracker),
    enabled: tracker.enabled
  }
}
