import net from 'node:net'

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function checkPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    let done = false
    const finish = (result: boolean) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(result)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      finish(true)
    })
    socket.once('error', () => {
      clearTimeout(timer)
      finish(false)
    })
  })
}

export interface PortWaitOptions {
  intervalMs?: number
  onTick?: (attempt: number, maxAttempts: number) => void
}

export async function waitForPort(
  host: string,
  port: number,
  timeoutMs: number,
  options: PortWaitOptions = {}
): Promise<boolean> {
  const interval = options.intervalMs ?? 2000
  const maxAttempts = Math.max(1, Math.floor(timeoutMs / interval))
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await checkPort(host, port, 2000)) return true
    options.onTick?.(attempt, maxAttempts)
    if (attempt < maxAttempts) await sleep(interval)
  }
  return false
}
