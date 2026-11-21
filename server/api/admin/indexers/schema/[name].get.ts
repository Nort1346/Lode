import type { IndexerDefinitionResponse } from '#shared/indexers'
import {
  getProwlarrIndexerSchema,
  requireProwlarrAdminClient,
  runProwlarrAdmin,
  toDefinitionDetail
} from '#server/utils/prowlarr-admin'

export default defineEventHandler(async (event): Promise<IndexerDefinitionResponse> => {
  await requireAdmin(event)
  const name = (getRouterParam(event, 'name') ?? '').trim()
  if (name.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Definition name is required' })
  }

  requireProwlarrAdminClient()
  const definitions = await runProwlarrAdmin(() => getProwlarrIndexerSchema())
  const lower = name.toLowerCase()
  const definition =
    definitions.find((item) => item.definitionName.toLowerCase() === lower) ??
    definitions.find((item) => item.name.toLowerCase() === lower)

  if (definition === undefined) {
    throw createError({ statusCode: 404, statusMessage: `Indexer definition "${name}" not found` })
  }

  return { definition: toDefinitionDetail(definition) }
})
