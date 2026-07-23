import { createError } from 'h3'
import type { H3Event } from 'h3'
import { getFreshUser } from './user'

export async function requireUser(event: H3Event) {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const fresh = await getFreshUser(session.user.id)
  if (!fresh) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  return fresh
}

export async function requireAdmin(event: H3Event) {
  const user = await requireUser(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return user
}
