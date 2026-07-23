import { sessions } from '#server/database/schema'
import { eq } from 'drizzle-orm'
import { useDbAsync, dbGet, dbAll, dbRun } from '#server/utils/db'

export async function validateSession(sessionId: string): Promise<boolean> {
  const db = await useDbAsync()
  const row = await dbGet(db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, sessionId)))
  return !!row
}

export async function touchSession(sessionId: string): Promise<void> {
  const db = await useDbAsync()
  const now = new Date().toISOString()
  await dbRun(db.update(sessions).set({ lastActiveAt: now }).where(eq(sessions.id, sessionId)))
}

export async function enforceMaxSessions(userId: string, maxSessions: number): Promise<void> {
  if (maxSessions <= 0) return

  const db = await useDbAsync()
  const allSessions = await dbAll(
    db.select({ id: sessions.id, createdAt: sessions.createdAt }).from(sessions).where(eq(sessions.userId, userId))
  )
  const userSessions = allSessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const excess = userSessions.length - maxSessions
  if (excess > 0) {
    const toDelete = userSessions.slice(0, excess)
    for (const s of toDelete) {
      await dbRun(db.delete(sessions).where(eq(sessions.id, s.id)))
    }
  }
}
