import { vi, beforeEach } from 'vitest'

const h3 = {
  defineEventHandler: (fn: unknown) => fn,
  createError: (opts: { statusCode: number; statusMessage: string }) => {
    throw new Error(`${opts.statusCode}: ${opts.statusMessage}`)
  }
}

for (const [key, value] of Object.entries(h3)) {
  vi.stubGlobal(key, value)
}

beforeEach(() => {
  vi.clearAllMocks()
})
