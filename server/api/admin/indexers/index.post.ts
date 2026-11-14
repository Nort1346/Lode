import type { IndexerSaveBody } from '#shared/indexers'
import { buildIndexerResource, requireProwlarrAdminClient, runProwlarrAdmin } from '#server/utils/prowlarr-admin'
import { assertIndexerTrackerLink, syncIndexerTracker } from '#server/utils/prowlarr-tracker-sync'
import { createLogger } from '#server/utils/logger'

const log = createLogger('ProwlarrIndexers')

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = await readBody<IndexerSaveBody>(event)

  if (body === undefined || body.indexer === undefined || body.indexer === null) {
    throw createError({ statusCode: 400, statusMessage: 'indexer is required' })
  }

  const payload = body.indexer
  const indexerName = payload.name.trim()
  if (indexerName.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'indexer.name is required' })
  }

  await assertIndexerTrackerLink(indexerName, undefined, body.tracker)
  const resource = buildIndexerResource(payload)
  const client = requireProwlarrAdminClient()
  const created = await runProwlarrAdmin(() => client.createIndexer(resource))

  let trackerAction: string
  try {
    const trackerResult = await syncIndexerTracker(created.name, undefined, body.tracker)
    trackerAction = trackerResult.action
  } catch (err) {
    try {
      await client.deleteIndexer(created.id)
    } catch (cleanupErr) {
      const message = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
      log.warn(`Failed to roll back indexer ${created.id} after tracker error: ${message}`)
    }
    throw err
  }

  await logActivity(event, {
    action: 'indexer_add',
    userId: user.id,
    username: user.username,
    details: JSON.stringify({
      name: created.name,
      privacy: created.privacy,
      trackerAction
    })
  })

  return { success: true, id: created.id }
})
