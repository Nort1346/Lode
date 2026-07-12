import { vi } from 'vitest'

vi.stubGlobal('defineEventHandler', (fn: (...args: unknown[]) => unknown) => fn)

vi.stubGlobal('createError', (opts: { statusCode: number; statusMessage: string }) => {
  throw new Error(`${opts.statusCode}: ${opts.statusMessage}`)
})

const mockReadBody = vi.fn()
const mockGetQuery = vi.fn()

vi.stubGlobal('readBody', mockReadBody)
vi.stubGlobal('getQuery', mockGetQuery)

vi.mock('h3', () => ({
  defineEventHandler: (fn: unknown) => fn,
  createError: (opts: { statusCode: number; statusMessage: string }) => {
    throw new Error(`${opts.statusCode}: ${opts.statusMessage}`)
  },
  readBody: mockReadBody,
  getQuery: mockGetQuery
}))
