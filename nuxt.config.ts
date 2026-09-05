// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', 'nuxt-auth-utils', '@nuxtjs/i18n', '@vite-pwa/nuxt'],

  nitro: {
    imports: {
      dirs: ['server/utils', 'server/utils/**']
    }
  },

  i18n: {
    locales: [
      { code: 'pl', name: 'Polski', file: 'pl.json' },
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'de', name: 'Deutsch', file: 'de.json' },
      { code: 'fr', name: 'Français', file: 'fr.json' },
      { code: 'es', name: 'Español', file: 'es.json' },
      { code: 'pt-BR', name: 'Português (Brasil)', file: 'pt-BR.json' }
    ],
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_lang',
      redirectOn: 'root'
    }
  },

  devtools: {
    enabled: false
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
    public: {
      appVersion: '1.0.0',
      vapidPublicKey: ''
    },
    session: {
      maxAge: 60 * 60 * 24 * 30,
      cookie: {
        secure: !import.meta.dev
      }
    },
    redisUrl: '',
    tmdbApiKey: '',
    prowlarrUrl: 'http://127.0.0.1:9900',
    prowlarrApiKey: '',
    qbittorrentUrl: 'http://127.0.0.1:8080',
    qbittorrentApiKey: '',
    jellyfinUrl: '',
    jellyfinApiKey: '',
    savePathMovies: '/data/Movies',
    savePathSeries: '/data/Series',
    savePathGames: '',
    savePathBooks: '',
    savePathMusic: '',
    torrentSyncIntervalMs: 10000,
    discordWebhookUrl: '',
    flaresolverrUrl: '',
    disks: '',
    minFreeSpaceGb: 7,
    diskSpaceCheckEnabled: true,
    trackerEncryptionKey: '',
    vapidPrivateKey: '',
    vapidSubject: ''
  },

  devServer: {
    port: 5757
  },

  routeRules: {},

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {}
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Lode',
      short_name: 'Lode',
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
      globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
      importScripts: ['/sw-push.js']
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 3600
    },
    devOptions: {
      enabled: import.meta.dev
    }
  }
})
