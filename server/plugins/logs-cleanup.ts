import { activityLogs } from '#server/database/schema'
import { lt } from 'drizzle-orm'
import { useDbAsync, dbRun } from '#server/utils/db'

export default defineNitroPlugin(() => {
  void (async () => {
    const db = await useDbAsync()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)

    await dbRun(db.delete(activityLogs).where(lt(activityLogs.createdAt, cutoff.toISOString())))
  })()
})
