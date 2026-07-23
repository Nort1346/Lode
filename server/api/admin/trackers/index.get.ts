import { customTrackers } from '#server/database/schema'
import { useDbAsync, dbAll } from '#server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = await useDbAsync()
  const rows = await dbAll(db.select().from(customTrackers))
  const masked = rows.map((row) => ({
    ...row,
    loginPassword: row.loginPassword !== null && row.loginPassword.length > 0 ? '***' : null
  }))
  return { trackers: masked }
})
