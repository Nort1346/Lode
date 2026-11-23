import { and, eq, inArray } from 'drizzle-orm'
import { downloads } from '#server/database/schema'
import { useDbAsync, dbAll } from '#server/utils/db'
import { getMediaImportMode } from '#server/utils/library/media-settings'
import { createLogger } from '#server/utils/logger'

const log = createLogger('MissingFiles')

// qBittorrent state of a torrent whose files no longer exist at the save path.
const MISSING_FILES_STATE = 'missingFiles'

// Removes torrents that Lode already imported into the library but that are
// stuck in qBittorrent's "Missing Files" state (e.g. a `move` import from an
// older run, before the torrent was dropped right after the import). Only rows
// whose files are known to be in the library are considered, so dropping the
// torrent (without its files) cannot lose media. A partial `move` import is
// marked 'failed' but still has files in the library, so those rows are
// included while the current import mode is `move`.
// Returns the number of torrents removed. Never throws - the sync loop calls
// this in the background.
export async function removeOrganizedMissingFileTorrents(): Promise<number> {
  try {
    const db = await useDbAsync()
    const rows = await dbAll(
      db
        .select()
        .from(downloads)
        .where(and(eq(downloads.status, 'completed'), inArray(downloads.organizeStatus, ['done', 'failed'])))
    )
    if (rows.length === 0) return 0
    const includeFailed = (await getMediaImportMode()) === 'move'
    const candidates = rows.filter(
      (row) =>
        (row.organizeStatus === 'done' || (includeFailed && row.organizeStatus === 'failed')) &&
        row.torrentHash !== null &&
        row.torrentHash !== ''
    )
    if (candidates.length === 0) return 0

    const qbit = useQBittorrent()
    const torrents = await qbit.getAllTorrents()
    // completion_on > 0 keeps a re-added torrent that has not finished yet out
    // of the sweep; a missing-files torrent from a real import did complete.
    const missingByHash = new Map(
      torrents
        .filter((t) => t.state === MISSING_FILES_STATE && t.completion_on > 0)
        .map((t) => [t.hash, t] as const)
    )
    if (missingByHash.size === 0) return 0

    let removed = 0
    for (const row of candidates) {
      const hash = row.torrentHash
      if (hash === null || row.completedAt === null) continue
      const torrent = missingByHash.get(hash)
      if (torrent === undefined) continue
      // A torrent re-added after this row completed is a different one, even
      // though the hash matches. Never delete it on the strength of an old row.
      if (torrent.added_on * 1000 > new Date(row.completedAt).getTime()) continue
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
