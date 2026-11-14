import type { IndexerDefinitionSummary, IndexerSchemaPage } from '#shared/indexers'
import {
  getProwlarrIndexerSchema,
  requireProwlarrAdminClient,
  runProwlarrAdmin,
  toDefinitionSummary
} from '#server/utils/prowlarr-admin'

function queryString(value: unknown): string {
  if (Array.isArray(value)) return queryString(value[0])
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function queryNumber(value: unknown, fallback: number): number {
  const parsed = Number(queryString(value))
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

export default defineEventHandler(async (event): Promise<IndexerSchemaPage> => {
  await requireAdmin(event)
  const query = getQuery(event)

  const q = queryString(query.q).toLowerCase()
  const privacy = queryString(query.privacy)
  const protocol = queryString(query.protocol).toLowerCase()
  const page = Math.max(1, queryNumber(query.page, 1))
  const limit = Math.min(100, Math.max(1, queryNumber(query.limit, 24)))

  requireProwlarrAdminClient()
  const definitions = await runProwlarrAdmin(() => getProwlarrIndexerSchema())
  const filtered = definitions
    .map((definition) => toDefinitionSummary(definition))
    .filter((definition) => {
      if (privacy.length > 0 && definition.privacy !== privacy) return false
      if (protocol.length > 0 && definition.protocol.toLowerCase() !== protocol) return false
      if (q.length === 0) return true
      return (
        definition.name.toLowerCase().includes(q) ||
        definition.definitionName.toLowerCase().includes(q) ||
        definition.description.toLowerCase().includes(q) ||
        definition.language.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const total = filtered.length
  const totalPages = Math.ceil(total / limit)
  const start = (page - 1) * limit
  const items: IndexerDefinitionSummary[] = filtered.slice(start, start + limit)

  return { items, total, page, limit, totalPages }
})
