import pino from 'pino'

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

export function createLogger(module: string) {
  return baseLogger.child({ module })
}
