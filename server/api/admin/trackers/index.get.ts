import { customTrackers } from '#server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()
  const rows = db.select().from(customTrackers).all()
  const masked = rows.map((row) => ({
    ...row,
    loginPassword: row.loginPassword !== null && row.loginPassword.length > 0 ? '***' : null
  }))
  return { trackers: masked }
})
