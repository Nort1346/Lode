import { settings } from '#server/database/schema'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  let dbOk = false
  try {
    const db = await useDbAsync()
    await dbGet(db.select().from(settings).limit(1))
    dbOk = true
  } catch {
    // dbOk stays false
  }

  return {
    status: dbOk ? 'healthy' : 'degraded',
    database: dbOk ? 'ok' : 'error',
    version: config.public.appVersion ?? 'unknown'
  }
})
