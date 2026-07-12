import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('pino', () => {
  const mockChild = vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
  return {
    default: vi.fn(() => ({
      child: mockChild
    }))
  }
})

import { createLogger, getLogBuffer, subscribeToLogs } from '#server/utils/logger'

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createLogger', () => {
    it('creates logger with module name', () => {
      const logger = createLogger('TestModule')
      expect(logger).toBeDefined()
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.debug).toBe('function')
    })

    it('info adds to log buffer', () => {
      const logger = createLogger('TestModule')
      logger.info('test message')
      const buffer = getLogBuffer()
      expect(buffer.some((line) => line.includes('test message'))).toBe(true)
    })

    it('error adds to log buffer', () => {
      const logger = createLogger('TestModule')
      logger.error('error message')
      const buffer = getLogBuffer()
      expect(buffer.some((line) => line.includes('error message'))).toBe(true)
    })

    it('warn adds to log buffer', () => {
      const logger = createLogger('TestModule')
      logger.warn('warn message')
      const buffer = getLogBuffer()
      expect(buffer.some((line) => line.includes('warn message'))).toBe(true)
    })

    it('info with object and message', () => {
      const logger = createLogger('TestModule')
      logger.info({ key: 'value' }, 'context message')
      const buffer = getLogBuffer()
      expect(buffer.some((line) => line.includes('context message'))).toBe(true)
    })

    it('info with error object', () => {
      const logger = createLogger('TestModule')
      logger.info({ err: new Error('test error') }, 'error occurred')
      const buffer = getLogBuffer()
      expect(buffer.some((line) => line.includes('error occurred'))).toBe(true)
    })
  })

  describe('getLogBuffer', () => {
    it('returns copy of buffer', () => {
      const buffer1 = getLogBuffer()
      const buffer2 = getLogBuffer()
      expect(buffer1).not.toBe(buffer2)
      expect(buffer1).toEqual(buffer2)
    })
  })

  describe('subscribeToLogs', () => {
    it('receives log entries', () => {
      const callback = vi.fn()
      const unsubscribe = subscribeToLogs(callback)

      const logger = createLogger('TestModule')
      logger.info('subscribed message')

      expect(callback).toHaveBeenCalled()
      unsubscribe()
    })

    it('unsubscribes correctly', () => {
      const callback = vi.fn()
      const unsubscribe = subscribeToLogs(callback)
      unsubscribe()

      const logger = createLogger('TestModule')
      logger.info('after unsubscribe')

      expect(callback).not.toHaveBeenCalled()
    })
  })
})
