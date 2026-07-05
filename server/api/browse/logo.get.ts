import { getLogosForItems } from '#server/utils/tmdb'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const query = getQuery(event)
  const mediaType = query.mediaType as string
  const id = Number(query.id)
  const locale = (query.locale as string) ?? 'en'

  if (!mediaType || !['movie', 'tv'].includes(mediaType) || isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid params' })
  }

  const logoMap = await getLogosForItems([{ id, media_type: mediaType }], locale)
  return { logoUrl: logoMap.get(id) ?? null }
})
