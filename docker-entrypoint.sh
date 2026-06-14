#!/bin/sh
set -e

# Ensure data directory exists and is owned by appuser
# (bind mounts may create it as root, or it may not exist yet)
mkdir -p /app/.data
chown -R appuser:nodejs /app/.data

# Drop privileges and exec the app
exec gosu appuser node .output/server/index.mjs "$@"
