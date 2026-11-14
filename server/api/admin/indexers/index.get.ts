import type { IndexerListResponse, IndexerStatsSummary, IndexerSummary, IndexerTrackerBadge } from '#shared/indexers'
import { getReposAsync } from '#server/repositories'
import { normalizePrivacy, requireProwlarrAdminClient, runProwlarrAdmin } from '#server/utils/prowlarr-admin'
import type { ProwlarrIndexerResource, ProwlarrIndexerStatsItem } from '#server/types/prowlarr-admin'
import type { CustomTracker } from '#server/types/entities'

function toStats(item: ProwlarrIndexerStatsItem | undefined): IndexerStatsSummary | null {
  if (item === undefined) return null
  return {
    queries: item.numberOfQueries,
    grabs: item.numberOfGrabs,
    failedQueries: item.numberOfFailedQueries,
    failedGrabs: item.numberOfFailedGrabs,
    averageResponseTime: item.averageResponseTime
  }
}

function toTrackerBadge(tracker: CustomTracker | undefined): IndexerTrackerBadge | null {
  if (tracker === undefined) return null
  return {
    id: tracker.id,
    trackerType: tracker.trackerType,
    enabled: tracker.enabled
  }
}

function toSummary(
  resource: ProwlarrIndexerResource,
  stats: ProwlarrIndexerStatsItem | undefined,
  disabledByProwlarr: boolean,
  tracker: CustomTracker | undefined
): IndexerSummary {
  return {
    id: resource.id,
    name: resource.name,
    definitionName: resource.definitionName,
    implementation: resource.implementation,
    implementationName: resource.implementationName,
    protocol: resource.protocol,
    privacy: normalizePrivacy(resource.privacy),
    language: resource.language ?? null,
    enable: resource.enable,
    priority: resource.priority,
    appProfileId: resource.appProfileId,
    added: resource.added ?? null,
    tags: resource.tags,
    tracker: toTrackerBadge(tracker),
    stats: toStats(stats),
    disabledByProwlarr
  }
}

export default defineEventHandler(async (event): Promise<IndexerListResponse> => {
  await requireAdmin(event)
  const client = requireProwlarrAdminClient()
  const repos = await getReposAsync()

  const [indexers, stats, statuses, trackers] = await Promise.all([
    runProwlarrAdmin(() => client.listIndexers()),
    runProwlarrAdmin(() => client.getIndexerStats()),
    runProwlarrAdmin(() => client.getIndexerStatuses()),
    repos.customTrackers.findAll()
  ])

  const statsById = new Map(stats.indexers.map((item) => [item.indexerId, item]))
  const blockedIds = new Set(statuses.map((item) => item.indexerId))
  const trackersByName = new Map(trackers.map((tracker) => [tracker.indexerName, tracker]))

  const summaries = indexers
    .map((resource) =>
      toSummary(
        resource,
        statsById.get(resource.id),
        resource.enable && blockedIds.has(resource.id),
        trackersByName.get(resource.name)
      )
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    indexers: summaries,
    summary: {
      total: summaries.length,
      enabled: summaries.filter((indexer) => indexer.enable).length,
      private: summaries.filter((indexer) => indexer.privacy !== 'public').length,
      disabledByProwlarr: summaries.filter((indexer) => indexer.disabledByProwlarr).length,
      linkedTrackers: summaries.filter((indexer) => indexer.tracker !== null).length
    }
  }
})
