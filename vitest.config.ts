import { defineConfig } from 'vitest/config'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const serverAlias = {
  '#server': resolve(import.meta.dirname, 'server'),
  '#db': resolve(import.meta.dirname, 'server/database'),
  '#utils': resolve(import.meta.dirname, 'server/utils'),
  '#server/types': resolve(import.meta.dirname, 'server/types'),
  '#shared': resolve(import.meta.dirname, 'shared')
}

// vue and vue-i18n are transitive deps (via nuxt / @nuxtjs/i18n) and not resolvable from the
// project root under pnpm's isolated node_modules, so alias them to the real packages.
const rootRequire = createRequire(import.meta.url)
const nuxtRequire = createRequire(rootRequire.resolve('nuxt/package.json'))
const i18nRequire = createRequire(rootRequire.resolve('@nuxtjs/i18n/package.json'))

export default defineConfig({
  test: {
    name: 'all',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    environment: 'node',
    alias: {
      ...serverAlias,
      vue: nuxtRequire.resolve('vue'),
      'vue-i18n': i18nRequire.resolve('vue-i18n')
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server/utils/**', 'server/api/**', 'server/middleware/**']
    }
  }
})
