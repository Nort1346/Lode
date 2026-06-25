#!/bin/sh
set -e

# Ensure data directory exists and is owned by appuser
# (bind mounts may create it as root, or it may not exist yet)
mkdir -p /app/.data
chown -R appuser:nodejs /app/.data

# Run database migrations before starting the app
echo "[entrypoint] Running database migrations..."
gosu appuser node scripts/migrate.mjs

# Drop privileges and exec the app
echo "[entrypoint] Starting StreamHub..."
exec gosu appuser node .output/server/index.mjs "$@"
