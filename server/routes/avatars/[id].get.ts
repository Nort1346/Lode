import { createReadStream, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { AVATARS_DIR, AVATARS_DEV_DIR } from '#server/utils/paths'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined || id === '') {
    throw createError({ statusCode: 400, statusMessage: 'Missing avatar id' })
  }

  const candidates = [resolve(AVATARS_DIR, id), resolve(AVATARS_DEV_DIR, id)]

  const filePath = candidates.find((p) => existsSync(p))
  if (filePath === undefined) {
    throw createError({ statusCode: 404, statusMessage: 'Avatar not found' })
  }

  setResponseHeader(event, 'Content-Type', 'image/jpeg')
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return sendStream(event, createReadStream(filePath))
})
