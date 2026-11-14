import type { IndexerQuickUpdateBody } from '#shared/indexers'
import { parseIndexerId, requireProwlarrAdminClient, runProwlarrAdmin } from '#server/utils/prowlarr-admin'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = parseIndexerId(getRouterParam(event, 'id'))
  const body = await readBody<IndexerQuickUpdateBody>(event)

  const updates: Record<string, unknown> = {}
  if (body.enable !== undefined) {
    if (typeof body.enable !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: 'enable must be a boolean' })
    }
    updates.enable = body.enable
  }
  if (body.priority !== undefined) {
    if (!Number.isInteger(body.priority) || body.priority < 1 || body.priority > 50) {
      throw createError({ statusCode: 400, statusMessage: 'priority must be between 1 and 50' })
    }
    updates.priority = body.priority
  }
  if (body.appProfileId !== undefined) {
    if (!Number.isInteger(body.appProfileId) || body.appProfileId <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'appProfileId must be greater than 0' })
    }
    updates.appProfileId = body.appProfileId
  }

  if (Object.keys(updates).length === 0) {
    return { success: true, id }
  }

  const client = requireProwlarrAdminClient()
  const existing = await runProwlarrAdmin(() => client.getIndexerRaw(id))
  await runProwlarrAdmin(() => client.updateIndexer(id, { ...existing, ...updates }))

  await logActivity(event, {
    action: 'indexer_update',
    userId: user.id,
    username: user.username,
    details: JSON.stringify({ id, fields: Object.keys(updates) })
  })

  return { success: true, id }
})
