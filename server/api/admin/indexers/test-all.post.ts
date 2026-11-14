import type { IndexerTestAllResponse } from '#shared/indexers'
import { requireProwlarrAdminClient, runProwlarrAdmin } from '#server/utils/prowlarr-admin'

export default defineEventHandler(async (event): Promise<IndexerTestAllResponse> => {
  await requireAdmin(event)
  const client = requireProwlarrAdminClient()
  const results = await runProwlarrAdmin(() => client.testAllIndexers())
  return { results }
})
