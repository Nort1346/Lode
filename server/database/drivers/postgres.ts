import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../schema'
import type { PgDb } from '#server/types/database'

export async function createPostgresDb(): Promise<PgDb> {
  const connectionString = process.env.DATABASE_URL
  if (connectionString === undefined || connectionString === null || connectionString === '') {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL.')
  }

  const client = postgres(connectionString)
  return drizzle(client, { schema })
}
