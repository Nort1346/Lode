import { validateConfig } from '#server/utils/config-schema'

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
})
