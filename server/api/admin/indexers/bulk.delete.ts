import type { IndexerBulkDeleteBody } from '#shared/indexers'
import { parseIndexerIds, requireProwlarrAdminClient, runProwlarrAdmin } from '#server/utils/prowlarr-admin'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = await readBody<IndexerBulkDeleteBody>(event)
  const ids = parseIndexerIds(body.ids)

  const client = requireProwlarrAdminClient()
  await runProwlarrAdmin(() => client.bulkDeleteIndexers(ids))

  await logActivity(event, {
    action: 'indexer_bulk_delete',
    userId: user.id,
    username: user.username,
    details: JSON.stringify({ ids })
  })

  return { success: true, count: ids.length }
})
