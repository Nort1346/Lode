import { syncTorrentStatus, notifyJellyfinIfNeeded } from '#server/utils/torrents/torrent-sync'
import { createLogger } from '#server/utils/logger'

const log = createLogger('TorrentSync')

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const intervalMs = (config.torrentSyncIntervalMs as number) || 10_000

  log.info(`starting background sync every ${intervalMs / 1000}s`)

  const interval = setInterval(() => {
    void (async () => {
      try {
        const result = await syncTorrentStatus()
        if (result.completed > 0 || result.failed > 0) {
          log.info(`synced=${result.synced} completed=${result.completed} failed=${result.failed}`)
        }
        await notifyJellyfinIfNeeded()
      } catch (err) {
        log.error(err, 'background sync failed')
      }
    })()
  }, intervalMs)

  nitroApp.hooks.hook('close', () => {
    clearInterval(interval)
    log.info('background sync stopped')
  })
})
