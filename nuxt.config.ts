// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', 'nuxt-auth-utils'],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

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
    savePathMusic: '/mnt/storage/streaming/Music'
  },

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {}
  }
})
