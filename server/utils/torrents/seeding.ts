import { isNotNull } from 'drizzle-orm'
import { downloads } from '#server/database/schema'
import { SETTINGS } from '#server/types/settings'
import { getSetting } from '#server/utils/settings'
import { useDbAsync, dbAll } from '#server/utils/db'
import { createLogger } from '#server/utils/logger'
import type { QBittorrentClient } from '#server/utils/clients/qbittorrent'

const log = createLogger('Seeding')

// qBittorrent accepts several hashes separated by `|` in one setShareLimits
// call; batch them so toggling the setting on a large instance stays cheap.
const SHARE_LIMIT_BATCH_SIZE = 50

export async function isSeedingEnabled(): Promise<boolean> {
  return (await getSetting(SETTINGS.QBIT_SEEDING_ENABLED)) !== 'false'
}

export async function applySeedingPolicy(qbit: Pick<QBittorrentClient, 'setShareLimits'>, hash: string): Promise<void> {
  if (await isSeedingEnabled()) return
  try {
    await qbit.setShareLimits(hash, 0, 0, 0)
    log.info(`disabled seeding for ${hash} (share limits 0, action Stop)`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`failed to disable seeding for ${hash}: ${msg}`)
  }
}

// Retroactive counterpart of applySeedingPolicy: when an admin disables
// seeding, existing torrents must stop too, not only ones added afterwards.
// Only hashes still present in qBittorrent are targeted. Best-effort by design:
// a qBittorrent outage must not fail the admin settings update.
export async function disableSeedingForTrackedTorrents(): Promise<number> {
  try {
    if (await isSeedingEnabled()) return 0

    const db = await useDbAsync()
    const rows = await dbAll(
      db.select({ torrentHash: downloads.torrentHash }).from(downloads).where(isNotNull(downloads.torrentHash))
    )
    const hashes = [
      ...new Set(rows.map((row) => row.torrentHash).filter((hash): hash is string => hash !== null && hash !== ''))
    ]
    if (hashes.length === 0) return 0

    const qbit = useQBittorrent()
    const torrents = await qbit.getAllTorrents()
    const present = new Set(torrents.map((torrent) => torrent.hash))
    const targets = hashes.filter((hash) => present.has(hash))
    if (targets.length === 0) return 0

    let applied = 0
    for (let i = 0; i < targets.length; i += SHARE_LIMIT_BATCH_SIZE) {
      const batch = targets.slice(i, i + SHARE_LIMIT_BATCH_SIZE)
      try {
        await qbit.setShareLimits(batch.join('|'), 0, 0, 0)
        applied += batch.length
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn(`failed to disable seeding for ${batch.length} torrent(s): ${msg}`)
      }
    }
    log.info(`disabled seeding for ${applied} tracked torrent(s)`)
    return applied
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`failed to disable seeding for tracked torrents: ${msg}`)
    return 0
  }
}
