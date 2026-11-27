import { useJellyfin } from '#server/utils/clients/jellyfin'

const ITEM_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(Math.trunc(number), min), max)
}

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const id = getRouterParam(event, 'id') ?? ''
  if (!ITEM_ID_PATTERN.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid item id' })
  }

  const client = useJellyfin()
  if (client === null) {
    throw createError({ statusCode: 503, statusMessage: 'Jellyfin is not configured' })
  }

  const query = getQuery(event)
  const type = query.type === 'Backdrop' ? 'Backdrop' : 'Primary'
  const index = boundedNumber(query.index, 0, 20, 0)
  const width = boundedNumber(query.width, 64, 1920, type === 'Backdrop' ? 1280 : 480)

  const image = await client.getItemImage(id, type, index, width).catch(() => null)
  if (image === null) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  setHeader(event, 'Content-Type', image.contentType)
  setHeader(event, 'Cache-Control', 'private, max-age=604800, immutable')
  setHeader(event, 'Content-Length', image.data.length)
  return image.data
})
