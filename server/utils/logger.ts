import pino from 'pino'
import type { Logger } from '#server/types/logger'

const isDev = process.env.NODE_ENV !== 'production'

const transport = isDev
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  : undefined

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport
})

// ── Ring buffer for SSE live logs ────────────────────────────
const MAX_LOGS = 500
const logBuffer: string[] = []
type Subscriber = (line: string) => void
const subscribers = new Set<Subscriber>()

function pushToBuffer(line: string) {
  logBuffer.push(line)
  while (logBuffer.length > MAX_LOGS) logBuffer.shift()
  for (const sub of subscribers) sub(line)
}

export function getLogBuffer(): string[] {
  return [...logBuffer]
}

export function subscribeToLogs(callback: Subscriber): () => void {
  subscribers.add(callback)
  return () => {
    subscribers.delete(callback)
  }
}

// ── Format log entry for buffer ──────────────────────────────
function resolveMsg(args: unknown[]): string {
  if (args.length === 1 && typeof args[0] === 'string') {
    return args[0]
  }
  if (
    args.length >= 2 &&
    typeof args[0] === 'object' &&
    args[0] !== null &&
    'err' in (args[0] as Record<string, unknown>)
  ) {
    const obj = args[0] as Record<string, unknown>
    const err = obj.err instanceof Error ? obj.err : new Error(String(obj.err))
    return `${String(args[1])} ${err.message}`
  }
  if (args.length >= 2 && typeof args[0] === 'object' && args[0] !== null) {
    const obj = args[0] as Record<string, unknown>
    const meta = Object.entries(obj)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' ')
    return `${meta} ${String(args[1])}`
  }
  if (args.length >= 2) {
    const format = String(args[0])
    const vals = args.slice(1)
    return format.replace(/%[sdfoO]/g, () => String(vals.shift() ?? ''))
  }
  return args.map(String).join(' ')
}

function formatLog(level: string, module: string, args: unknown[]): string {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false })
  const levelTag = level.toUpperCase().padEnd(5)
  return `[${time}] ${levelTag} (${module}): ${resolveMsg(args)}`
}

// ── Logger wrapper ───────────────────────────────────────────
export function createLogger(module: string): Logger {
  const child = baseLogger.child({ module })

  return {
    info: (...args: unknown[]) => {
      child.info(args[0], ...(args.slice(1) as [string, ...unknown[]]))
      pushToBuffer(formatLog('info', module, args))
    },
    error: (...args: unknown[]) => {
      child.error(args[0], ...(args.slice(1) as [string, ...unknown[]]))
      pushToBuffer(formatLog('error', module, args))
    },
    warn: (...args: unknown[]) => {
      child.warn(args[0], ...(args.slice(1) as [string, ...unknown[]]))
      pushToBuffer(formatLog('warn', module, args))
    },
    debug: (...args: unknown[]) => {
      child.debug(args[0], ...(args.slice(1) as [string, ...unknown[]]))
    }
  }
}
