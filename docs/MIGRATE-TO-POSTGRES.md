# Migrating from SQLite to PostgreSQL

This guide walks you through migrating your StreamHub database from SQLite to PostgreSQL.

## Prerequisites

- Docker and Docker Compose running
- Existing SQLite database at `./data/app.db`
- PostgreSQL container configured in `docker-compose.postgres.yml` (already included)

## Quick Start

```bash
# 1. Make sure PostgreSQL is running
docker compose -f docker-compose.postgres.yml up -d postgres

# 2. Run a dry run to preview what will be migrated
docker compose -f docker-compose.postgres.yml run --rm \
  -e DB_DRIVER=postgres \
  -e DATABASE_URL=postgresql://streamhub:changeme@postgres:5432/streamhub \
  streamhub node scripts/migrate-sqlite-to-pg.mjs --dry-run

# 3. Run the actual migration
docker compose -f docker-compose.postgres.yml run --rm \
  -e DB_DRIVER=postgres \
  -e DATABASE_URL=postgresql://streamhub:changeme@postgres:5432/streamhub \
  streamhub node scripts/migrate-sqlite-to-pg.mjs

# 4. Update your .env
#    Set DB_DRIVER=postgres
#    Set DATABASE_URL=postgresql://streamhub:changeme@postgres:5432/streamhub

# 5. Restart everything
docker compose -f docker-compose.postgres.yml up -d
```

## Step-by-Step

### 1. Start PostgreSQL

The `docker-compose.postgres.yml` already includes a `postgres:16-alpine` service with a healthcheck. Start it with:

```bash
docker compose -f docker-compose.postgres.yml up -d postgres
```

Verify it's healthy:

```bash
docker compose -f docker-compose.postgres.yml ps postgres
```

### 2. Dry Run (Optional)

Preview what the migration will do without making any changes to PostgreSQL:

```bash
docker compose -f docker-compose.postgres.yml run --rm \
  -e DB_DRIVER=postgres \
  -e DATABASE_URL=postgresql://streamhub:changeme@postgres:5432/streamhub \
  streamhub node scripts/migrate-sqlite-to-pg.mjs --dry-run
```

This will print the row counts for each table in your SQLite database.

### 3. Run the Migration

Execute the migration:

```bash
docker compose -f docker-compose.postgres.yml run --rm \
  -e DB_DRIVER=postgres \
  -e DATABASE_URL=postgresql://streamhub:changeme@postgres:5432/streamhub \
  streamhub node scripts/migrate-sqlite-to-pg.mjs
```

The script will:

1. Read all data from `.data/app.db` (SQLite)
2. Create the PostgreSQL schema (tables, indexes) — idempotent, safe to re-run
3. Check if PostgreSQL already has data (aborts unless `--force` is used)
4. Transform boolean columns (`0`/`1` to `false`/`true`)
5. Batch insert data (500 rows per batch)
6. Verify row counts match

### 4. Update Environment Variables

Edit your `.env` file:

```env
DB_DRIVER=postgres
DATABASE_URL=postgresql://streamhub:changeme@postgres:5432/streamhub
```

> **Important:** The `DATABASE_URL` password must match `POSTGRES_PASSWORD` in `docker-compose.postgres.yml`.

### 5. Restart the Application

```bash
docker compose -f docker-compose.postgres.yml up -d
```

The entrypoint will run PostgreSQL migrations (schema is already created by the script, so this is a no-op) and then start the application.

## Flags

| Flag | Description |
|---|---|
| `--dry-run` | Preview migration without writing to PostgreSQL |
| `--force` | Overwrite existing PostgreSQL data (skips the "already has data" check) |

## Tables Migrated

| Table | Boolean Columns (transformed) |
|---|---|
| `users` | `is_active`, `can_submit` |
| `downloads` | `is_private` |
| `settings` | — |
| `activity_logs` | — |
| `requests` | — |
| `custom_trackers` | `enabled` |
| `login_attempts` | `success` |
| `wishlist` | — |

## Troubleshooting

### "Table X already has rows. Use --force to overwrite."

PostgreSQL already contains data. If you want to replace it, re-run with `--force`:

```bash
docker compose -f docker-compose.postgres.yml run --rm \
  -e DB_DRIVER=postgres \
  -e DATABASE_URL=postgresql://streamhub:changeme@postgres:5432/streamhub \
  streamhub node scripts/migrate-sqlite-to-pg.mjs --force
```

### "SQLite file not found"

Make sure your SQLite database is at `./data/app.db` on the host. The Docker Compose volume mount maps `./data` to `/app/.data` inside the container.

### "DATABASE_URL is required"

The `DATABASE_URL` environment variable must be set. Pass it with `-e` when running the command.

### Native module errors (better-sqlite3)

The runtime container includes `better-sqlite3` native binaries compiled during the build stage. Both build and runtime images use Debian Bookworm, so the binaries are compatible. If you encounter issues, rebuild the image:

```bash
docker compose -f docker-compose.postgres.yml build streamhub
```

## Rolling Back

To switch back to SQLite after migration:

1. Set `DB_DRIVER=sqlite` in `.env`
2. Remove or comment out `DATABASE_URL` in `.env`
3. Restart: `docker compose -f docker-compose.sqlite.yml up -d`

Your SQLite database at `.data/app.db` is untouched during the migration.
