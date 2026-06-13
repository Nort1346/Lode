import bcrypt from 'bcrypt'
import { users } from '../../database/schema'
import { eq } from 'drizzle-orm'

interface LoginBody {
  username: string
  password: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginBody>(event)
  const { username, password } = body

  if (!username || !password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  }

  const db = useDb()
  const user = db.select().from(users).where(eq(users.username, username)).get()

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  if (!user.isActive) {
    throw createError({ statusCode: 403, statusMessage: 'Account is deactivated' })
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      dailyDownloadLimit: user.dailyDownloadLimit,
      activeTorrentLimit: user.activeTorrentLimit,
      maxTorrentSizeGb: user.maxTorrentSizeGb,
      downloadsToday: user.downloadsToday
    }
  })

  return { success: true, user: { id: user.id, username: user.username, role: user.role } }
})
