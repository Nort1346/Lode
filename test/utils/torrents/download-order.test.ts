import { describe, it, expect } from 'vitest'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { downloadsOrderBy } from '#server/utils/torrents/download-order'

const dialect = new SQLiteSyncDialect()

describe('download-order', () => {
  it('orders active downloads first, then newest first', () => {
    const order = downloadsOrderBy()
    expect(order).toHaveLength(2)

    const [groupExpr, createdExpr] = order
    if (groupExpr === undefined || createdExpr === undefined) {
      throw new Error('expected two order expressions')
    }

    const group = dialect.sqlToQuery(groupExpr)
    expect(group.sql).toBe('case when "downloads"."status" in (?, ?, ?) then 0 else 1 end')
    expect(group.params).toEqual(['pending', 'downloading', 'paused'])

    const created = dialect.sqlToQuery(createdExpr)
    expect(created.sql).toBe('"downloads"."created_at" desc')
  })
})
