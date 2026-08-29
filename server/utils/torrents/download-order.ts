import { desc, inArray, sql } from 'drizzle-orm'
import { downloads } from '#server/database/schema'
import { ACTIVE_DOWNLOAD_STATUSES } from '#server/types/torrent'
import type { SQL } from 'drizzle-orm'

// Active downloads first, then newest first within each group
export function downloadsOrderBy(): SQL[] {
  return [
    sql`case when ${inArray(downloads.status, ACTIVE_DOWNLOAD_STATUSES)} then 0 else 1 end`,
    desc(downloads.createdAt)
  ]
}
