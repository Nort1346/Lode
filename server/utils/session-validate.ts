import { getReposAsync } from '#server/repositories'

export async function validateSession(sessionId: string): Promise<boolean> {
  const repos = await getReposAsync()
  const session = await repos.sessions.findById(sessionId)
  return session !== undefined
}

export async function touchSession(sessionId: string): Promise<void> {
  const repos = await getReposAsync()
  await repos.sessions.touch(sessionId, new Date().toISOString())
}

export async function enforceMaxSessions(userId: string, maxSessions: number): Promise<void> {
  if (maxSessions <= 0) return

  const repos = await getReposAsync()
  const allSessions = await repos.sessions.findUserSessions(userId)
  const sorted = allSessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const excess = sorted.length - maxSessions
  if (excess > 0) {
    const toDelete = sorted.slice(0, excess)
    for (const s of toDelete) {
      await repos.sessions.delete(s.id)
    }
  }
}
