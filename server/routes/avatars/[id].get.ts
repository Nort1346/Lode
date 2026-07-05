import { createReadStream, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (id === null || id === undefined || id === '') {
    throw createError({ statusCode: 400, statusMessage: 'Missing avatar id' })
  }

  const candidates = [
    resolve(process.cwd(), '.output', 'public', 'avatars', id),
    resolve(process.cwd(), 'public', 'avatars', id)
  ]

  const filePath = candidates.find((p) => existsSync(p))
  if (filePath === undefined) {
    throw createError({ statusCode: 404, statusMessage: 'Avatar not found' })
  }

  setResponseHeader(event, 'Content-Type', 'image/jpeg')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

  return sendStream(event, createReadStream(filePath))
})
