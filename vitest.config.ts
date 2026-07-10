import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const serverAlias = {
  '#server': resolve(__dirname, 'server'),
  '#db': resolve(__dirname, 'server/database'),
  '#utils': resolve(__dirname, 'server/utils'),
  '#server/types': resolve(__dirname, 'server/types')
}

export default defineConfig({
  test: {
    name: 'all',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    alias: serverAlias,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server/utils/**', 'server/api/**', 'server/middleware/**']
    }
  }
})
