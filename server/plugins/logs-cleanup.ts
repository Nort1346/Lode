import { getReposAsync } from '#server/repositories'
import { createLogger } from '#server/utils/logger'
import { cleanupOldAttempts } from '#server/utils/brute-force'

const log = createLogger('LogsCleanup')

export default defineNitroPlugin(() => {
  void (async () => {
    try {
      const repos = await getReposAsync()
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)
      await repos.activityLogs.deleteOlderThan(cutoff.toISOString())
      await cleanupOldAttempts()
      log.info('cleanup complete')
    } catch (error) {
      log.error(`cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  })()
})
