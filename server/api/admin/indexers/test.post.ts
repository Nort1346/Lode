import type { IndexerTestBody, IndexerTestResult } from '#shared/indexers'
import {
  buildIndexerResource,
  parseIndexerId,
  requireProwlarrAdminClient,
  runProwlarrAdmin
} from '#server/utils/prowlarr-admin'

export default defineEventHandler(async (event): Promise<IndexerTestResult> => {
  await requireAdmin(event)
  const body = await readBody<IndexerTestBody>(event)
  const client = requireProwlarrAdminClient()

  if (body?.indexer !== undefined && body.indexer !== null) {
    const existingId = body.id
    const base = existingId !== undefined ? await runProwlarrAdmin(() => client.getIndexerRaw(existingId)) : undefined
    const resource = buildIndexerResource(body.indexer, base)
    const result = await runProwlarrAdmin(() => client.testIndexer(resource))
    return existingId !== undefined ? { ...result, id: existingId } : result
  }

  if (body?.id === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'id or indexer is required' })
  }

  const id = parseIndexerId(String(body.id))
  const raw = await runProwlarrAdmin(() => client.getIndexerRaw(id))
  const result = await runProwlarrAdmin(() => client.testIndexer(raw))
  return { ...result, id }
})
