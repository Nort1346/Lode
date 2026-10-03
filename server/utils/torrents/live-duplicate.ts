import { downloads } from '#server/database/schema'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { dbAll } from '#server/utils/db'
import { createLogger } from '#server/utils/logger'
import { isTorrentComplete } from '#server/utils/clients/qbittorrent'
import type { QBittorrentClient } from '#server/utils/clients/qbittorrent'
import type { LiveDuplicate, QBitTorrent } from '#server/types/torrent'
import type { SqliteDb } from '#server/types/database'

const log = createLogger('LiveDuplicate')

/**
 * Backstop for adds whose hash cannot be known up front (plain download URLs,
 * unparseable magnets) and could not be resolved from the URL bytes. Old rows
 * with the same stored link nominate candidates, but only a torrent that is
 * still present in qBittorrent blocks the add - and rows are never written:
 * completed history stays untouched however this resolves.
 */
export async function findLiveDuplicateByLink(
  db: SqliteDb,
  qbit: Pick<QBittorrentClient, 'findTorrentByHash'>,
  userId: string,
  storedLink: string
): Promise<LiveDuplicate | null> {
  const candidates = await dbAll(
    db
      .select()
      .from(downloads)
      .where(
        and(
          eq(downloads.userId, userId),
          eq(downloads.magnetLink, storedLink),
          isNotNull(downloads.torrentHash),
          inArray(downloads.status, ['pending', 'checking', 'downloading', 'completed', 'paused'])
        )
      )
  )
  for (const row of candidates) {
    const hash = row.torrentHash
    if (hash === null) continue
    let live: QBitTorrent | undefined
    try {
      live = await qbit.findTorrentByHash(hash)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn(`live duplicate check failed for hash=${hash}: ${msg} - ignoring row ${row.id}`)
      continue
    }
    if (live === undefined) continue
    log.info(`live duplicate: row=${row.id} hash=${hash} state=${live.state}`)
    return { complete: isTorrentComplete(live), name: live.name }
  }
  return null
}
