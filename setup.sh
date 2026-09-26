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
BASE_URL="${LODE_BASE_URL:-https://github.com/${REPO}}"

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
ASSET_URL="${BASE_URL}/releases/latest/download/${ASSET}"

TAG="latest"
LOCATION="$(curl -fsSI "$ASSET_URL" 2>/dev/null | tr -d '\r' | awk 'tolower($1) == "location:" { print $2 }' | head -n 1 || true)"
if [[ "${LOCATION:-}" == *"releases/download/"* ]]; then
  TAG="${LOCATION##*releases/download/}"
  TAG="${TAG%%/*}"
fi

CACHE_DIR="${XDG_CACHE_HOME:-${HOME}/.cache}/lode-setup/${TAG}"
BIN="${CACHE_DIR}/${ASSET}"

# -- Terminal helpers --------------------------------------------------
# SGR colors and the OSC 8 hyperlink are dropped for NO_COLOR,
# TERM=dumb, and non-terminal output, so logs stay clean.

if [ -n "${NO_COLOR:-}" ] || [ "${TERM:-}" = "dumb" ] || [ ! -t 1 ]; then
  CYAN=''
else
  CYAN='\033[0;36m'
fi

hyperlink() {
  if [ -n "$CYAN" ]; then
    printf '\033]8;;%s\007%s\033]8;;\007' "$1" "${2:-$1}"
  else
    printf '%s' "${2:-$1}"
  fi
}

if [ ! -x "$BIN" ]; then
  if [ -n "$CYAN" ]; then
    printf 'Downloading \033[0;36m%s\033[0m (%s)...\n' "$(hyperlink "$ASSET_URL" "$ASSET")" "$TAG"
  else
    printf 'Downloading %s (%s)...\n' "$ASSET" "$TAG"
  fi
  mkdir -p "$CACHE_DIR"
  if [ -t 2 ] && [ "${TERM:-}" != "dumb" ]; then
    # Single-line progress bar. No -s here: it suppresses the meter, and
    # --progress-bar cannot override it. CI and logs get the quiet path below.
    curl -fL --progress-bar -o "${BIN}.tmp" "$ASSET_URL" || die "download failed: ${ASSET_URL}"
  else
    curl -fsSL -sS -o "${BIN}.tmp" "$ASSET_URL" || die "download failed: ${ASSET_URL}"
  fi
  chmod +x "${BIN}.tmp"
  mv -f "${BIN}.tmp" "$BIN"
fi

# `curl | bash` feeds this script a pipe on stdin; the interactive setup
# needs a real TTY. The stdin redirection must stay on the exec line itself:
# a separate `exec < /dev/tty` replaces stdin before bash reads the rest of
# the pipe, so the exec below would never be read or run.
if [ -t 0 ]; then
  exec "$BIN" "$@"
else
  exec "$BIN" "$@" < /dev/tty
fi
