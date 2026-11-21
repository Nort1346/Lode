import type { IndexerDetailResponse } from '#shared/indexers'
import { getReposAsync } from '#server/repositories'
import {
  parseIndexerId,
  requireProwlarrAdminClient,
  runProwlarrAdmin,
  toEditorData
} from '#server/utils/prowlarr-admin'
import { toIndexerTrackerView } from '#server/utils/prowlarr-tracker-sync'

export default defineEventHandler(async (event): Promise<IndexerDetailResponse> => {
  await requireAdmin(event)
  const id = parseIndexerId(getRouterParam(event, 'id'))
  const client = requireProwlarrAdminClient()

  const resource = await runProwlarrAdmin(() => client.getIndexer(id))
  const repos = await getReposAsync()
  const tracker = await repos.customTrackers.findByIndexerName(resource.name)

  return {
    indexer: toEditorData(resource),
    tracker: tracker === undefined ? null : toIndexerTrackerView(tracker)
  }
})
