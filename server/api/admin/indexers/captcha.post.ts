import type { IndexerCaptchaResponse, IndexerTestBody } from '#shared/indexers'
import { buildIndexerResource, requireProwlarrAdminClient, runProwlarrAdmin } from '#server/utils/prowlarr-admin'

export default defineEventHandler(async (event): Promise<IndexerCaptchaResponse> => {
  await requireAdmin(event)
  const body = await readBody<IndexerTestBody>(event)
  const client = requireProwlarrAdminClient()

  if (body?.indexer !== undefined && body.indexer !== null) {
    const existingId = body.id
    const base = existingId !== undefined ? await runProwlarrAdmin(() => client.getIndexerRaw(existingId)) : undefined
    const resource = buildIndexerResource(body.indexer, base)
    return runProwlarrAdmin(() => client.checkCaptcha(resource))
  }

  const secondId = body?.id
  if (secondId === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'id or indexer is required' })
  }

  const raw = await runProwlarrAdmin(() => client.getIndexerRaw(secondId))
  return runProwlarrAdmin(() => client.checkCaptcha(raw))
})
