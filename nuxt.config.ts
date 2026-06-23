// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', 'nuxt-auth-utils', '@nuxtjs/i18n', '@vite-pwa/nuxt'],

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
    diskSpaceCheckEnabled: true,
    trackerEncryptionKey: ''
  },

  routeRules: {},

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {}
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'StreamHub',
      short_name: 'StreamHub',
      description: 'Browse, request, and download movies & TV shows',
      theme_color: '#f59e0b',
      background_color: '#09090b',
      display: 'standalone',
      scope: '/',
      start_url: '/dashboard',
      icons: [
        {
          src: 'pwa-64x64.png',
          sizes: '64x64',
          type: 'image/png'
        },
        {
          src: 'pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: 'pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        },
        {
          src: 'maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,ico,png,svg,woff2}']
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 3600
    },
    devOptions: {
      enabled: false
    }
  }
})
