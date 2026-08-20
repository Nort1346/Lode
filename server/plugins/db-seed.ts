import { ensureAdminExists } from '#server/utils/seed'
import { createLogger } from '#server/utils/logger'

const log = createLogger('DbSeed')

export default defineNitroPlugin(() => {
  ensureAdminExists().catch((error: unknown) => {
    log.error(`admin seed failed: ${error instanceof Error ? error.message : String(error)}`)
  })
})
