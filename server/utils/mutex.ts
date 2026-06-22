interface MutexEntry {
  resolve: () => void
}

const queue: MutexEntry[] = []
let locked = false

export async function withTorrentAddLock<T>(fn: () => Promise<T>): Promise<T> {
  await acquire()
  try {
    return await fn()
  } finally {
    release()
  }
}

function acquire(): Promise<void> {
  if (!locked) {
    locked = true
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    queue.push({ resolve })
  })
}

function release(): void {
  const next = queue.shift()
  if (next) {
    next.resolve()
  } else {
    locked = false
  }
}

const cooldowns = new Map<string, number>()
const COOLDOWN_MS = 5000

export function checkCooldown(userId: string): { ok: boolean; remainingMs: number } {
  const last = cooldowns.get(userId)
  if (last === undefined) return { ok: true, remainingMs: 0 }
  const elapsed = Date.now() - last
  if (elapsed >= COOLDOWN_MS) return { ok: true, remainingMs: 0 }
  return { ok: false, remainingMs: COOLDOWN_MS - elapsed }
}

export function setCooldown(userId: string): void {
  cooldowns.set(userId, Date.now())
}

setInterval(() => {
  const now = Date.now()
  for (const [key, ts] of cooldowns) {
    if (now - ts >= COOLDOWN_MS) cooldowns.delete(key)
  }
}, 30_000)
