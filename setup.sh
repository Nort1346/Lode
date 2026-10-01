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
  x86_64 | amd64)
    # An x86_64 shell under Rosetta on Apple Silicon still reports
    # hw.optional.arm64=1; take the native binary instead of running the
    # TUI through Rosetta.
    if [ "$OS" = "darwin" ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
      ARCH="arm64"
    else
      ARCH="x64"
    fi
    ;;
  arm64 | aarch64) ARCH="arm64" ;;
  *) die "unsupported CPU architecture: $(uname -m)" ;;
esac

ASSET="lode-setup-${OS}-${ARCH}"
# The cheap path first: releases/latest/download/<asset> redirects to the
# asset in the current latest release; the tag is recoverable from the
# Location header. One request, and it covers the common case.
TAG="latest"
ASSET_URL="${BASE_URL}/releases/latest/download/${ASSET}"
HAVE_TAG=0
LOCATION="$(curl -fsSI --connect-timeout 15 --retry 2 "$ASSET_URL" 2>/dev/null | tr -d '\r' | awk 'tolower($1) == "location:" { print $2 }' | head -n 1 || true)"
if [[ "${LOCATION:-}" == *"releases/download/"* ]]; then
  TAG="${LOCATION##*releases/download/}"
  TAG="${TAG%%/*}"
  HAVE_TAG=1
fi

# The latest release does not ship $ASSET (empty tag, notes-only, assets
# still uploading, wrong names): walk the public releases API newest-first
# and take the first non-prerelease release whose assets include $ASSET
# (drafts are never public; skipping prereleases matches `releases/latest`).
# Mirrors set via LODE_BASE_URL keep serving the bytes; the API base is
# derived so a Gitea-style mirror can answer the walk too.
#
# Walks up to WALK_MAX_PAGES pages, newest first. Sets WALK_TAG to the
# chosen tag and WALK_TRIED to the tags seen. Returns 0 when the API
# answered (a match was found or the list was exhausted), 1 when it is
# unreachable. Works with both pretty-printed (GitHub) and compact (Gitea)
# JSON: each release segment runs from its "tag_name" key to the next one,
# which always contains its assets array, and JSON escaping guarantees the
# probes only match real object keys, never string values.
WALK_MAX_PAGES=3
WALK_TAG=""
WALK_TRIED=""
walk_releases() {
  local page=1 body page_tags
  while [ "$page" -le "$WALK_MAX_PAGES" ]; do
    body="$(curl -fsS --connect-timeout 15 --retry 2 -H 'Accept: application/vnd.github+json' "${API_BASE}/releases?per_page=30&page=${page}" 2>/dev/null)" || return 1
    # A mirror without a releases API answers with HTML; only a JSON array
    # is a usable answer.
    [ "$(printf '%s' "$body" | head -c 1)" = "[" ] || return 1
    page_tags="$(printf '%s\n' "$body" | grep -oE '"tag_name": *"[^"]+"' | cut -d'"' -f4 | tr '\n' ' ' || true)"
    [ -n "$page_tags" ] || return 0
    WALK_TRIED="${WALK_TRIED}${page_tags}"
    WALK_TAG="$(printf '%s' "$body" | awk -v asset="$ASSET" '
      { doc = doc $0 " " }
      END {
        probeA = "\"name\":\"" asset "\""
        probeB = "\"name\": \"" asset "\""
        key = "\"tag_name\""
        p = index(doc, key)
        while (p > 0) {
          rest = substr(doc, p + length(key))
          np = index(rest, key)
          end = (np > 0) ? p + length(key) + np - 1 : length(doc) + 1
          seg = substr(doc, p, end - p)
          tail = substr(seg, length(key) + 1)
          sub(/^ *: *"/, "", tail)
          sub(/".*/, "", tail)
          skip = 0
          if (seg ~ /"prerelease" *: *true/) skip = 1
          if (seg ~ /"draft" *: *true/) skip = 1
          if (!skip && (index(seg, probeA) > 0 || index(seg, probeB) > 0)) {
            print tail
            exit
          }
          if (np == 0) break
          p = p + length(key) + np - 1
        }
      }
    ' || true)"
    if [ -n "$WALK_TAG" ]; then
      return 0
    fi
    page=$((page + 1))
  done
  return 0
}

if [ "$HAVE_TAG" -eq 0 ]; then
  if [ "$BASE_URL" = "https://github.com/${REPO}" ]; then
    API_BASE="https://api.github.com/repos/${REPO}"
  else
    API_BASE="${BASE_URL}/api/v1/repos/${REPO}"
  fi
  if walk_releases; then
    if [ -n "$WALK_TAG" ]; then
      TAG="$WALK_TAG"
      ASSET_URL="${BASE_URL}/releases/download/${TAG}/${ASSET}"
    elif [ -n "$WALK_TRIED" ]; then
      die "no GitHub release ships ${ASSET} (tried: ${WALK_TRIED% })"
    fi
  fi
  # The API is unreachable (mirror without a releases API, network, rate
  # limit): keep ASSET_URL (releases/latest) - the download fails with the
  # usual error below.
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
  # Both branches share the hang guards: bounded connect, transient retries,
  # and an abort if the transfer crawls below ~1KB/s for a minute.
  if [ -t 2 ] && [ "${TERM:-}" != "dumb" ]; then
    # Single-line progress bar. No -s here: it suppresses the meter, and
    # --progress-bar cannot override it. CI and logs get the quiet path below.
    curl -fL --progress-bar --connect-timeout 15 --retry 3 --retry-delay 2 \
      --speed-limit 1024 --speed-time 60 -o "${BIN}.tmp" "$ASSET_URL" || die "download failed: ${ASSET_URL}"
  else
    curl -fsSL --connect-timeout 15 --retry 3 --retry-delay 2 \
      --speed-limit 1024 --speed-time 60 -o "${BIN}.tmp" "$ASSET_URL" || die "download failed: ${ASSET_URL}"
  fi
  # Never execute a cached error page or a truncated download: require a
  # plausible size and a real ELF (Linux) or Mach-O (macOS) magic number.
  SIZE=$(($(wc -c < "${BIN}.tmp")))
  [ "$SIZE" -ge 1048576 ] || die "download failed: only ${SIZE} bytes received - not a valid binary"
  MAGIC="$(head -c 4 "${BIN}.tmp" | od -An -tx1 | tr -d ' \n')"
  case "$MAGIC" in
    7f454c46 | cffaedfe | cefaedfe | feedface | feedfacf) ;;
    *) die "download failed: file is not an ELF/Mach-O binary (magic: ${MAGIC:-empty})" ;;
  esac
  chmod +x "${BIN}.tmp"
  mv -f "${BIN}.tmp" "$BIN"
fi

# curl never sets the quarantine attribute, but the cache can hold a binary
# fetched another way; strip it so Gatekeeper cannot block the launch.
if [ "$OS" = "darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$BIN" 2>/dev/null || true
fi

# Stay the parent of the TUI: if the child exits leaving the terminal in raw
# mode, these traps restore it with `stty sane`. The child runs in the
# foreground - backgrounding it would break Ctrl+C delivery.
restore_tty() {
  stty sane < /dev/tty > /dev/null 2>&1 || true
}
trap restore_tty EXIT
trap 'restore_tty; exit 130' INT
trap 'restore_tty; exit 143' TERM

# `curl | bash` gives this script a pipe for stdin; the TUI needs the real
# terminal on all three streams. Open the slave device by its real name
# (e.g. /dev/ttys001) instead of the /dev/tty magic device - a fresh
# /dev/tty open does not deliver keystrokes to the TUI on some systems.
# fd1 is duplicated first: command substitution runs in a subshell where
# fd1 is the capture pipe, so `tty <&1` there would always fail.
if [ -t 0 ] && [ -t 1 ]; then
  "$BIN" "$@"
else
  exec 4<&1
  TTY_DEV="$(tty <&4 2>/dev/null || true)"
  case "$TTY_DEV" in
    /dev/*) "$BIN" "$@" <> "$TTY_DEV" >&0 2>&0 ;;
    *) "$BIN" "$@" <> /dev/tty >&0 2>&0 ;;
  esac
fi
