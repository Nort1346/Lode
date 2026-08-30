import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const serverAlias = {
  '#server': resolve(import.meta.dirname, 'server'),
  '#db': resolve(import.meta.dirname, 'server/database'),
  '#utils': resolve(import.meta.dirname, 'server/utils'),
  '#server/types': resolve(import.meta.dirname, 'server/types'),
  '#shared': resolve(import.meta.dirname, 'shared')
}

export default defineConfig({
  test: {
    name: 'all',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    environment: 'node',
    alias: serverAlias,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server/utils/**', 'server/api/**', 'server/middleware/**']
    }
  }
})
