#!/bin/sh
set -e

# Ensure data directory exists and is owned by appuser
# (bind mounts may create it as root, or it may not exist yet)
mkdir -p /app/.data
chown -R appuser:nodejs /app/.data

# Ensure avatars directory exists and is owned by appuser
mkdir -p /app/.output/public/avatars
chown -R appuser:nodejs /app/.output/public/avatars

# Run database migrations before starting the app
echo "[entrypoint] Running database migrations..."
gosu appuser node scripts/migrate.mjs

# Drop privileges and exec the CMD (allows override via docker-compose)
echo "[entrypoint] Starting StreamHub..."
exec gosu appuser "$@"