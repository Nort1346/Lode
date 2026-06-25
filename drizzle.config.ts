import { defineConfig } from 'drizzle-kit'

const dialect = process.env.DB_DRIVER === 'postgres' ? 'postgresql' : 'sqlite'

export default defineConfig({
  dialect,
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  ...(dialect === 'postgresql'
    ? {
        dbCredentials: {
          url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/streamhub'
        }
      }
    : {
        dbCredentials: {
          url: './.data/app.db'
        }
      })
})
