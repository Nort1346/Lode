export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.server) return

  const { clear } = useUserSession()

  nuxtApp.hook('app:created', () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (...args) => {
      const response = await originalFetch(...args)

      const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : ''
      if (url.includes('/api/') && !url.includes('/api/_auth/') && response.status === 401) {
        await clear()
        await navigateTo('/login')
      }

      return response
    }
  })
})
