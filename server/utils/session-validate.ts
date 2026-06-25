import { sessions } from '#server/database/schema'
import { eq } from 'drizzle-orm'

export async function validateSession(sessionId: string): Promise<boolean> {
  const db = useDb()
  const row = db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sessionId)).get()
  return !!row
}

export async function touchSession(sessionId: string): Promise<void> {
  const db = useDb()
  const now = new Date().toISOString()
  db.update(sessions).set({ lastActiveAt: now }).where(eq(sessions.id, sessionId)).run()
}

export async function enforceMaxSessions(userId: string, maxSessions: number): Promise<void> {
  if (maxSessions <= 0) return

  const db = useDb()
  const userSessions = db
    .select({ id: sessions.id, createdAt: sessions.createdAt })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .all()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const excess = userSessions.length - maxSessions
  if (excess > 0) {
    const toDelete = userSessions.slice(0, excess)
    for (const s of toDelete) {
      db.delete(sessions).where(eq(sessions.id, s.id)).run()
    }
  }
}
