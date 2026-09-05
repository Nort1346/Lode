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

# Auto-create Jellyfin libraries if API key is configured
echo "[entrypoint] Setting up Jellyfin libraries..."
gosu appuser node scripts/setup-jellyfin.mjs

# Drop privileges and exec the CMD (allows override via docker-compose)
echo "[entrypoint] Starting Lode..."
exec gosu appuser "$@"