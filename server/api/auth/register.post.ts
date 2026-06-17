import bcrypt from 'bcrypt'
import { users } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

interface RegisterBody {
  username: string
  password: string
  role?: string
  dailyDownloadLimit?: number
  activeTorrentLimit?: number
  maxTorrentSizeGb?: number
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const body = await readBody<RegisterBody>(event)
  const { username, password, role, dailyDownloadLimit, activeTorrentLimit, maxTorrentSizeGb } = body

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  }

  if (session.user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can create users' })
  }

  const db = useDb()
  const existing = db.select().from(users).where(eq(users.username, username)).get()
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'Username already exists' })
  }

  const hashedPassword = await bcrypt.hash(password, 12)
  const id = randomUUID()

  db.insert(users)
    .values({
      id,
      username,
      password: hashedPassword,
      role: role === 'user' || role === 'admin' ? role : 'user',
      dailyDownloadLimit: dailyDownloadLimit ?? 5,
      activeTorrentLimit: activeTorrentLimit ?? 3,
      maxTorrentSizeGb: maxTorrentSizeGb ?? 20,
      isActive: true,
      downloadsToday: 0,
      createdAt: new Date().toISOString()
    })
    .run()

  logActivity(event, {
    action: 'register',
    userId: session.user.id,
    username: session.user.username,
    details: JSON.stringify({ newUsername: username, role: role ?? 'user' })
  })

  return { success: true, id }
})
