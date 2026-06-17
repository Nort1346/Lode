// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', 'nuxt-auth-utils', '@nuxtjs/i18n'],

  i18n: {
    locales: [
      { code: 'pl', name: 'Polski', file: 'pl.json' },
      { code: 'en', name: 'English', file: 'en.json' }
    ],
    defaultLocale: 'pl',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_lang',
      redirectOn: 'root'
    }
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  alias: {
    '#server': rootDir + 'server',
    '#db': rootDir + 'server/database',
    '#utils': rootDir + 'server/utils'
  },

  icon: {
    size: '24px'
  },

  runtimeConfig: {
    session: {
      cookie: {
        secure: false
      }
    },
    redisUrl: '',
    tmdbApiKey: '',
    prowlarrUrl: 'http://127.0.0.1:9696',
    prowlarrApiKey: '',
    quiProxyUrl: '',
    jellyfinUrl: '',
    jellyfinApiKey: '',
    jellyfinPrepSpeedMb: 8,
    savePathMovies: '/mnt/storage/streaming/Movies',
    savePathSeries: '/mnt/storage/streaming/Series',
    savePathGames: '/mnt/storage/streaming/Games',
    savePathBooks: '/mnt/storage/streaming/Books',
    savePathMusic: '/mnt/storage/streaming/Music',
    trackerDevilEnabled: true,
    trackerDevilCookie: '',
    trackerPolskieEnabled: true,
    trackerPolskieCookie: '',
    torrentSyncIntervalMs: 10000,
    discordWebhookUrl: '',
    flaresolverrUrl: '',
    disks: '',
    minFreeSpaceGb: 7,
    diskSpaceCheckEnabled: true
  },

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {}
  }
})
