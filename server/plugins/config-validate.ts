import { validateConfig } from '#server/utils/config-schema'
import { createLogger } from '#server/utils/logger'

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  validateConfig({
    savePathMovies: config.savePathMovies,
    savePathSeries: config.savePathSeries,
    qbittorrentUrl: config.qbittorrentUrl,
    qbittorrentApiKey: config.qbittorrentApiKey,
    sessionPassword: process.env.NUXT_SESSION_PASSWORD ?? '',
    tmdbApiKey: config.tmdbApiKey,
    prowlarrApiKey: config.prowlarrApiKey,
    trackerEncryptionKey: config.trackerEncryptionKey,
    jellyfinUrl: config.jellyfinUrl || undefined,
    jellyfinApiKey: config.jellyfinApiKey || undefined
  })

  const logger = createLogger('Config')
  // TMDB is never warned about: Lode falls back to its built-in shared key
  // (see BUILTIN_TMDB_API_KEY in server/utils/tmdb.ts) when NUXT_TMDB_API_KEY is unset.
  if (!config.prowlarrApiKey) {
    logger.warn('Prowlarr API key not set (NUXT_PROWLARR_API_KEY) - torrent searching is disabled until configured')
  }
  if (!config.qbittorrentApiKey) {
    logger.warn('qBittorrent API key not set (NUXT_QBITTORRENT_API_KEY) - downloads are disabled until configured')
  }
  if (!config.jellyfinUrl || !config.jellyfinApiKey) {
    logger.warn(
      'Jellyfin not configured (NUXT_JELLYFIN_URL / NUXT_JELLYFIN_API_KEY) - library browsing is disabled until configured'
    )
  }
})
