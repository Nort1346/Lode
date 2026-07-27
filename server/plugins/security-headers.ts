export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
    setResponseHeader(event, 'X-Frame-Options', 'DENY')
    setResponseHeader(event, 'Referrer-Policy', 'strict-origin-when-cross-origin')
    setResponseHeader(event, 'Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  })
})
