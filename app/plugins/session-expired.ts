export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.server) return

  const { clear } = useUserSession()

  nuxtApp.hook('app:created', () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (...args) => {
      const response = await originalFetch(...args)

      const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : ''
      const isAuthRoute = url.includes('/api/_auth/') || url.includes('/api/auth/')
      if (url.includes('/api/') && !isAuthRoute && response.status === 401) {
        await clear()
        await navigateTo('/login')
      }

      return response
    }
  })
})
