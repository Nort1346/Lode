import { users } from '#server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()
  const allUsers = db.select().from(users).all()

  return allUsers.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    isActive: u.isActive,
    dailyDownloadLimit: u.dailyDownloadLimit,
    activeTorrentLimit: u.activeTorrentLimit,
    maxTorrentSizeGb: u.maxTorrentSizeGb,
    privateTrackerLimit: u.privateTrackerLimit,
    downloadsToday: u.downloadsToday,
    createdAt: u.createdAt,
    discordId: u.discordId,
    canSubmit: u.canSubmit,
    maxSessions: u.maxSessions
  }))
})
