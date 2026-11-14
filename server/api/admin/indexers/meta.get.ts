import type { IndexerMetaResponse } from '#shared/indexers'
import { requireProwlarrAdminClient, runProwlarrAdmin, toAppProfileView, toTagView } from '#server/utils/prowlarr-admin'

export default defineEventHandler(async (event): Promise<IndexerMetaResponse> => {
  await requireAdmin(event)
  const client = requireProwlarrAdminClient()

  const [appProfiles, tags, status] = await Promise.all([
    runProwlarrAdmin(() => client.getAppProfiles()),
    runProwlarrAdmin(() => client.getTags()),
    runProwlarrAdmin(() => client.getSystemStatus()).catch(() => null)
  ])

  return {
    appProfiles: appProfiles.map((profile) => toAppProfileView(profile)),
    tags: tags.map((tag) => toTagView(tag)),
    version: status?.version ?? null
  }
})
