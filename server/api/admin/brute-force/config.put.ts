import type { BruteForceConfig } from '#server/types/brute-force'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readBody<Partial<BruteForceConfig>>(event)

  if (body.maxAttemptsPerIp !== undefined) {
    const v = body.maxAttemptsPerIp
    if (!Number.isInteger(v) || v < 1 || v > 100) {
      throw createError({ statusCode: 400, statusMessage: 'maxAttemptsPerIp must be an integer between 1 and 100' })
    }
  }
  if (body.ipBlockDurationMinutes !== undefined) {
    const v = body.ipBlockDurationMinutes
    if (!Number.isInteger(v) || v < 1 || v > 1440) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ipBlockDurationMinutes must be an integer between 1 and 1440'
      })
    }
  }
  if (body.windowMinutes !== undefined) {
    const v = body.windowMinutes
    if (!Number.isInteger(v) || v < 1 || v > 1440) {
      throw createError({ statusCode: 400, statusMessage: 'windowMinutes must be an integer between 1 and 1440' })
    }
  }

  await saveBruteForceConfig(body)
  await logActivity(event, {
    action: 'brute_force_config_update',
    userId: admin.id,
    username: admin.username,
    details: 'Updated brute force config'
  })
  return { success: true, config: await getBruteForceConfig() }
})
