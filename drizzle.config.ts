import { defineConfig } from 'drizzle-kit'

try {
  process.loadEnvFile()
} catch {
  /* no-op */
}

const isPostgres = process.env.DB_DRIVER === 'postgres'
const dialect = isPostgres ? 'postgresql' : 'sqlite'

export default defineConfig({
  dialect,
  schema: isPostgres ? './server/database/schema.pg.ts' : './server/database/schema.sqlite.ts',
  out: isPostgres ? './server/database/migrations/postgres' : './server/database/migrations',
  ...(isPostgres
    ? {
        dbCredentials: {
          url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/lode'
        }
      }
    : {
        dbCredentials: {
          url: './.data/app.db'
        }
      })
})
