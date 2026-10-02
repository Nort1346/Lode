import { SETTINGS } from '#server/types/settings'
import { getSetting } from '#server/utils/settings'
import { createLogger } from '#server/utils/logger'
import type { QBittorrentClient } from '#server/utils/clients/qbittorrent'

const log = createLogger('Seeding')

export async function isSeedingEnabled(): Promise<boolean> {
  return (await getSetting(SETTINGS.QBIT_SEEDING_ENABLED)) !== 'false'
}

export async function applySeedingPolicy(
  qbit: Pick<QBittorrentClient, 'setShareLimits'>,
  hash: string
): Promise<void> {
  if (await isSeedingEnabled()) return
  try {
    await qbit.setShareLimits(hash, 0, 0, 0)
    log.info(`disabled seeding for ${hash} (share limits 0, action Stop)`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`failed to disable seeding for ${hash}: ${msg}`)
  }
}
