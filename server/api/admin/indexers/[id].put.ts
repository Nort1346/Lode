import type { IndexerSaveBody } from '#shared/indexers'
import {
  buildIndexerResource,
  parseIndexerId,
  requireProwlarrAdminClient,
  runProwlarrAdmin
} from '#server/utils/prowlarr-admin'
import { assertIndexerTrackerLink, syncIndexerTracker } from '#server/utils/prowlarr-tracker-sync'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = parseIndexerId(getRouterParam(event, 'id'))
  const body = await readBody<IndexerSaveBody>(event)

  if (body.indexer === undefined || body.indexer === null) {
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
  const trackerResult = await syncIndexerTracker(updated.name, previousName, body.tracker)

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
