import { syncTorrentStatus, notifyJellyfinIfNeeded } from '#server/utils/torrent-sync'

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const intervalMs = (config.torrentSyncIntervalMs as number) || 10_000

  console.log(`[torrent-sync] starting background sync every ${intervalMs / 1000}s`)

  const interval = setInterval(() => {
    void (async () => {
      try {
        const result = await syncTorrentStatus()
        if (result.completed > 0 || result.failed > 0) {
          console.log(`[torrent-sync] synced=${result.synced} completed=${result.completed} failed=${result.failed}`)
        }
        await notifyJellyfinIfNeeded()
      } catch (err) {
        console.error('[torrent-sync] background sync failed:', err)
      }
    })()
  }, intervalMs)

  nitroApp.hooks.hook('close', () => {
    clearInterval(interval)
    console.log('[torrent-sync] background sync stopped')
  })
})
