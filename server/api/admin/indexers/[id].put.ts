import type { IndexerSaveBody } from '#shared/indexers'
import {
  buildIndexerResource,
  parseIndexerId,
  requireProwlarrAdminClient,
  runProwlarrAdmin
} from '#server/utils/prowlarr-admin'
import {
  assertIndexerTrackerLink,
  syncIndexerTracker,
  type TrackerSyncResult
} from '#server/utils/prowlarr-tracker-sync'
import { createLogger } from '#server/utils/logger'

const log = createLogger('ProwlarrIndexers')

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = parseIndexerId(getRouterParam(event, 'id'))
  const body = await readBody<IndexerSaveBody>(event)

  if (body === undefined || body.indexer === undefined || body.indexer === null) {
    throw createError({ statusCode: 400, statusMessage: 'indexer is required' })
  }

  const payload = body.indexer
  const indexerName = payload.name.trim()
  if (indexerName.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'indexer.name is required' })
  }

  const client = requireProwlarrAdminClient()
  const existingRaw = await runProwlarrAdmin(() => client.getIndexerRaw(id))
  const previousName = typeof existingRaw.name === 'string' ? existingRaw.name : ''
  if (previousName.length === 0) {
    throw createError({ statusCode: 502, statusMessage: 'Prowlarr returned an invalid indexer payload' })
  }

  await assertIndexerTrackerLink(indexerName, previousName, body.tracker)
  const resource = buildIndexerResource(payload, existingRaw)
  const updated = await runProwlarrAdmin(() => client.updateIndexer(id, resource))

  let trackerResult: TrackerSyncResult
  try {
    trackerResult = await syncIndexerTracker(updated.name, previousName, body.tracker)
  } catch (err) {
    try {
      await client.updateIndexer(id, existingRaw)
    } catch (cleanupErr) {
      const message = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
      log.warn(`Failed to roll back indexer ${id} after tracker error: ${message}`)
    }
    throw err
  }

  await logActivity(event, {
    action: 'indexer_update',
    userId: user.id,
    username: user.username,
    details: JSON.stringify({
      id,
      name: updated.name,
      previousName,
      trackerAction: trackerResult.action
    })
  })

  return { success: true, id: updated.id }
})
