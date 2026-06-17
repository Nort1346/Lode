import { activityLogs } from '#server/database/schema'
import { lt } from 'drizzle-orm'

export default defineNitroPlugin(() => {
  const db = useDb()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)

  db.delete(activityLogs).where(lt(activityLogs.createdAt, cutoff.toISOString())).run()
})
