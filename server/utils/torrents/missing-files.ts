import { and, eq } from 'drizzle-orm'
import { downloads } from '#server/database/schema'
import { useDbAsync, dbAll } from '#server/utils/db'
import { createLogger } from '#server/utils/logger'

const log = createLogger('MissingFiles')

// qBittorrent state of a torrent whose files no longer exist at the save path.
const MISSING_FILES_STATE = 'missingFiles'

// Removes torrents that Lode already imported into the library but that are
// stuck in qBittorrent's "Missing Files" state (e.g. a `move` import from an
// older run, before the torrent was dropped right after the import). Only rows
// with organizeStatus='done' are considered: their files are safely in the
// library, so dropping the torrent (without its files) cannot lose media.
// Returns the number of torrents removed. Never throws - the sync loop calls
// this in the background.
export async function removeOrganizedMissingFileTorrents(): Promise<number> {
  try {
    const db = await useDbAsync()
    const rows = await dbAll(
      db.select().from(downloads).where(and(eq(downloads.status, 'completed'), eq(downloads.organizeStatus, 'done')))
    )
    const candidates = rows.filter(
      (row) => row.organizeStatus === 'done' && row.torrentHash !== null && row.torrentHash !== ''
    )
    if (candidates.length === 0) return 0

    const qbit = useQBittorrent()
    const torrents = await qbit.getAllTorrents()
    const missingHashes = new Set(torrents.filter((t) => t.state === MISSING_FILES_STATE).map((t) => t.hash))
    if (missingHashes.size === 0) return 0

    let removed = 0
    for (const row of candidates) {
      const hash = row.torrentHash
      if (hash === null || !missingHashes.has(hash)) continue
      try {
        // deleteFiles=false is essential: the library copy is the only one
        // left after a move import.
        await qbit.deleteTorrent(hash, false)
        removed++
        log.info(`removed missing-files torrent from qBittorrent: id=${row.id} hash=${hash}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn(`failed to remove missing-files torrent: id=${row.id} hash=${hash}: ${msg}`)
      }
    }
    return removed
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`missing-files sweep failed: ${msg}`)
    return 0
  }
}
