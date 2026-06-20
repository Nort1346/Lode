export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') return

  const url = getRequestURL(event)
  if (!url.pathname.endsWith('/api/auth/login')) return

  const ip = resolveIp(event)
  if (ip === null || ip === '') return

  const blocked = await isIpBlocked(ip)
  if (blocked) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Too many failed login attempts. IP temporarily blocked.'
    })
  }
})
