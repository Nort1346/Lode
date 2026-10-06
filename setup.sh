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
LATEST_URL="${BASE_URL}/releases/latest/download/${ASSET}"
USER_AGENT="lode-setup-bootstrap"

if [ "$BASE_URL" = "https://github.com/${REPO}" ]; then
  API_BASE="https://api.github.com/repos/${REPO}"
  API_IS_GITHUB=1
else
  API_BASE="${BASE_URL}/api/v1/repos/${REPO}"
  API_IS_GITHUB=0
fi

# Resolves the latest tag from the releases/latest/download redirect.
# GitHub redirects blindly even when the asset is missing (404 only on GET),
# so a returned tag is a hint, not proof - the download decides.
latest_tag() {
  local location tag
  location="$(curl -fsSI --connect-timeout 15 --retry 2 -A "$USER_AGENT" "$LATEST_URL" 2>/dev/null | tr -d '\r' | awk 'tolower($1) == "location:" { print $2 }' | head -n 1 || true)"
  case "${location:-}" in
    *releases/download/*)
      tag="${location##*releases/download/}"
      tag="${tag%%/*}"
      [ -n "$tag" ] && printf '%s' "$tag"
      ;;
  esac
}

# Newest-first tags of non-prerelease releases shipping $ASSET. Sets
# WALK_TAGS (hits) and WALK_TRIED (seen); return 1 = API unreachable. The awk
# only matches real JSON keys, pretty or compact. Token only to api.github.com.
WALK_MAX_PAGES=3
WALK_TAGS=""
WALK_TRIED=""
walk_releases() {
  local page=1 body page_tags page_matches
  local -a api_args=(-A "$USER_AGENT" -H 'Accept: application/vnd.github+json')
  if [ "$API_IS_GITHUB" -eq 1 ] && [ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]; then
    api_args+=(-H "Authorization: Bearer ${GH_TOKEN:-${GITHUB_TOKEN:-}}")
  fi
  WALK_TAGS=""
  WALK_TRIED=""
  while [ "$page" -le "$WALK_MAX_PAGES" ]; do
    body="$(curl -fsS --connect-timeout 15 --retry 2 "${api_args[@]}" "${API_BASE}/releases?per_page=30&page=${page}" 2>/dev/null)" || return 1
    # A mirror without a releases API answers HTML - only release objects count.
    [ "$(printf '%s' "$body" | head -c 1)" = "[" ] || return 1
    page_tags="$(printf '%s\n' "$body" | grep -oE '"tag_name": *"[^"]+"' | cut -d'"' -f4 | tr '\n' ' ' || true)"
    [ -n "$page_tags" ] || return 0
    WALK_TRIED="${WALK_TRIED}${page_tags}"
    page_matches="$(printf '%s' "$body" | awk -v asset="$ASSET" '
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
          }
          if (np == 0) break
          p = p + length(key) + np - 1
        }
      }
    ' || true)"
    if [ -n "$page_matches" ]; then
      WALK_TAGS="${WALK_TAGS}$(printf '%s' "$page_matches" | tr '\n' ' ')"
    fi
    page=$((page + 1))
  done
  return 0
}

# Downloads $1 (URL) to $2 (tmp path), validated. Returns 1 (partial removed)
# on any failure so the caller can try an older release.
try_download() {
  local url="$1" tmp="$2" size magic
  rm -f "$tmp"
  # Hang guards: bounded connect, retries, abort below ~1KB/s for 60s.
  if [ -t 2 ] && [ "${TERM:-}" != "dumb" ]; then
    # No -s: it would suppress the meter; CI uses the quiet branch.
    curl -fL --progress-bar --connect-timeout 15 --retry 3 --retry-delay 2 \
      --speed-limit 1024 --speed-time 60 -A "$USER_AGENT" -o "$tmp" "$url" || { rm -f "$tmp"; return 1; }
  else
    curl -fsSL --connect-timeout 15 --retry 3 --retry-delay 2 \
      --speed-limit 1024 --speed-time 60 -A "$USER_AGENT" -o "$tmp" "$url" || { rm -f "$tmp"; return 1; }
  fi
  # Reject error pages and truncated downloads: size + ELF/Mach-O magic.
  size=$(($(wc -c < "$tmp")))
  if [ "$size" -lt 1048576 ]; then rm -f "$tmp"; return 1; fi
  magic="$(head -c 4 "$tmp" | od -An -tx1 | tr -d ' \n')"
  case "$magic" in
    7f454c46 | cffaedfe | cefaedfe | feedface | feedfacf) ;;
    *) rm -f "$tmp"; return 1 ;;
  esac
  chmod +x "$tmp"
  return 0
}

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

print_downloading() {
  if [ -n "$CYAN" ]; then
    printf 'Downloading \033[0;36m%s\033[0m (%s)...\n' "$(hyperlink "$1" "$ASSET")" "$2"
  else
    printf 'Downloading %s (%s)...\n' "$ASSET" "$2"
  fi
}

TAG="$(latest_tag || true)"
if [ -z "${TAG:-}" ]; then TAG="latest"; fi
ASSET_URL="$LATEST_URL"
CACHE_DIR="${XDG_CACHE_HOME:-${HOME}/.cache}/lode-setup/${TAG}"
BIN="${CACHE_DIR}/${ASSET}"

DOWNLOADED=0
if [ -x "$BIN" ]; then
  DOWNLOADED=1
else
  print_downloading "$ASSET_URL" "$TAG"
  mkdir -p "$CACHE_DIR"
  if try_download "$ASSET_URL" "${BIN}.tmp"; then
    mv -f "${BIN}.tmp" "$BIN"
    DOWNLOADED=1
  fi
fi

if [ "$DOWNLOADED" -eq 0 ]; then
  # Latest failed (no binaries yet, CDN race, broken transfer): try every
  # older release shipping $ASSET, newest first.
  echo "Latest download failed, looking for an older release with ${ASSET}..." >&2
  if walk_releases; then
    if [ -z "${WALK_TAGS:-}" ]; then
      if [ -n "${WALK_TRIED:-}" ]; then
        die "no GitHub release ships ${ASSET} (tried: ${WALK_TRIED% })"
      else
        die "download failed: ${ASSET_URL}"
      fi
    fi
    TRIED="$TAG"
    for candidate in $WALK_TAGS; do
      candidate_url="${BASE_URL}/releases/download/${candidate}/${ASSET}"
      TRIED="${TRIED} ${candidate}"
      TAG="$candidate"
      ASSET_URL="$candidate_url"
      CACHE_DIR="${XDG_CACHE_HOME:-${HOME}/.cache}/lode-setup/${TAG}"
      BIN="${CACHE_DIR}/${ASSET}"
      if [ -x "$BIN" ]; then
        DOWNLOADED=1
        break
      fi
      print_downloading "$ASSET_URL" "$TAG"
      mkdir -p "$CACHE_DIR"
      if try_download "$ASSET_URL" "${BIN}.tmp"; then
        mv -f "${BIN}.tmp" "$BIN"
        DOWNLOADED=1
        break
      fi
    done
    if [ "$DOWNLOADED" -eq 0 ]; then
      # TRIED can repeat the head tag (retried via its versioned URL) - dedup
      # keeping order for a readable message.
      seen=""
      for t in $TRIED; do
        case " $seen " in
          *" $t "*) ;;
          *) seen="$seen $t" ;;
        esac
      done
      die "no working download for ${ASSET} (tried releases:${seen})"
    fi
  else
    die "download failed: ${ASSET_URL} (and the releases API is unreachable, so no older release could be tried)"
  fi
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
