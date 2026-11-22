import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const serverAlias = {
  '#server': resolve(import.meta.dirname, 'server'),
  '#db': resolve(import.meta.dirname, 'server/database'),
  '#utils': resolve(import.meta.dirname, 'server/utils'),
  '#server/types': resolve(import.meta.dirname, 'server/types'),
  '#shared': resolve(import.meta.dirname, 'shared')
}

// Cross-database parity suite: the same driver tests run against SQLite
// (always) and PostgreSQL (when LODE_PG_TEST_URL points at a reachable
// server; otherwise the PG projects skip).
//
// Run with:
//   pnpm exec vitest run -c vitest.db-parity.config.ts
// or with a PostgreSQL server:
//   LODE_PG_TEST_URL=postgres://lode:***@127.0.0.1:54335/postgres pnpm exec vitest run -c vitest.db-parity.config.ts
//
// Local quickstart:
//   docker run -d -e POSTGRES_DB=lode -e POSTGRES_USER=lode -e POSTGRES_PASSWORD=*** -p 54335:5432 postgres:16-alpine
export default defineConfig({
  test: {
    environment: 'node',
    alias: serverAlias,
    projects: [
      {
        extends: true,
        test: {
          name: 'db-parity-sqlite',
          include: ['test/db-parity/drivers/**/*.test.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'db-parity-postgres',
          include: ['test/db-parity/drivers/**/*.test.ts', 'test/db-parity/cross/**/*.test.ts'],
          env: { DB_DRIVER: 'postgres' }
        }
      }
    ]
  }
})
