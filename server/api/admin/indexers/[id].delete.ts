import { getReposAsync } from '#server/repositories'
import { parseIndexerId, requireProwlarrAdminClient, runProwlarrAdmin } from '#server/utils/prowlarr-admin'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = parseIndexerId(getRouterParam(event, 'id'))
  const client = requireProwlarrAdminClient()

  const existing = await runProwlarrAdmin(() => client.getIndexer(id))
  await runProwlarrAdmin(() => client.deleteIndexer(id))

  const repos = await getReposAsync()
  const tracker = await repos.customTrackers.findByIndexerName(existing.name)

  await logActivity(event, {
    action: 'indexer_delete',
    userId: user.id,
    username: user.username,
    details: JSON.stringify({
      id,
      name: existing.name,
      trackerStillLinked: tracker !== undefined
    })
  })

  return { success: true, trackerStillLinked: tracker !== undefined }
})
