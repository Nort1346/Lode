import type { IndexerBulkUpdateBody } from '#shared/indexers'
import { parseIndexerIds, requireProwlarrAdminClient, runProwlarrAdmin } from '#server/utils/prowlarr-admin'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = await readBody<IndexerBulkUpdateBody>(event)
  const ids = parseIndexerIds(body.ids)

  if (typeof body.enable !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'enable must be a boolean' })
  }

  const client = requireProwlarrAdminClient()
  await runProwlarrAdmin(() => client.bulkUpdateIndexers(ids, body.enable))

  await logActivity(event, {
    action: 'indexer_bulk_update',
    userId: user.id,
    username: user.username,
    details: JSON.stringify({ ids, enable: body.enable })
  })

  return { success: true, count: ids.length }
})
