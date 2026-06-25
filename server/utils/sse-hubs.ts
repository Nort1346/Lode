const notificationSubscribers = new Map<string, Set<(data: string) => void>>()

export function subscribeToNotifications(userId: string, callback: (data: string) => void): () => void {
  let subs = notificationSubscribers.get(userId)
  if (subs === undefined) {
    subs = new Set()
    notificationSubscribers.set(userId, subs)
  }
  subs.add(callback)

  return () => {
    subs?.delete(callback)
    if (subs !== undefined && subs.size === 0) {
      notificationSubscribers.delete(userId)
    }
  }
}

export function notifySseClients(userId: string, data: Record<string, unknown>): void {
  const subs = notificationSubscribers.get(userId)
  if (subs === undefined || subs.size === 0) return

  const payload = `data: ${JSON.stringify(data)}\n\n`
  for (const cb of subs) {
    cb(payload)
  }
}
