#!/bin/bash
set -euo pipefail

# -- Lode Setup Bootstrap --------------------------------------------
# Downloads the prebuilt lode-setup binary for this platform from the
# latest GitHub release and runs it. All setup logic lives in the
# binary (cli/), so this script only detects the platform, resolves
# the latest release, and execs the cached binary.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Nort1346/Lode/main/setup.sh | bash
#   ./setup.sh
# ----------------------------------------------------------------------

REPO="Nort1346/Lode"

die() {
  echo "error: $*" >&2
  exit 1
}

case "$(uname -s)" in
  Linux) OS="linux" ;;
  Darwin) OS="darwin" ;;
  *) die "unsupported OS: $(uname -s) - on Windows, use setup.ps1" ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) ARCH="x64" ;;
  arm64 | aarch64) ARCH="arm64" ;;
  *) die "unsupported CPU architecture: $(uname -m)" ;;
esac

ASSET="lode-setup-${OS}-${ARCH}"
# releases/latest/download/<asset> redirects to the asset in the current
# latest release; the tag is recoverable from the Location header.
ASSET_URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

TAG="latest"
LOCATION="$(curl -fsSI "$ASSET_URL" 2>/dev/null | tr -d '\r' | awk 'tolower($1) == "location:" { print $2 }' | head -n 1 || true)"
if [[ "${LOCATION:-}" == *"releases/download/"* ]]; then
  TAG="${LOCATION##*releases/download/}"
  TAG="${TAG%%/*}"
fi

CACHE_DIR="${XDG_CACHE_HOME:-${HOME}/.cache}/lode-setup/${TAG}"
BIN="${CACHE_DIR}/${ASSET}"

if [ ! -x "$BIN" ]; then
  echo "Downloading ${ASSET} (${TAG})..."
  mkdir -p "$CACHE_DIR"
  curl -fsSL -o "${BIN}.tmp" "$ASSET_URL" || die "download failed: ${ASSET_URL}"
  chmod +x "${BIN}.tmp"
  mv -f "${BIN}.tmp" "$BIN"
fi

# `curl | bash` feeds this script a pipe on stdin; the interactive setup
# needs a real TTY, so re-point stdin at the terminal when available.
if [ ! -t 0 ] && [ -e /dev/tty ]; then
  exec < /dev/tty
fi

exec "$BIN" "$@"
