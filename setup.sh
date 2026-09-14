#!/bin/bash
set -euo pipefail

# -- Lode Auto-Setup Script --------------------------------------
# Sets up Lode with the services you choose. The Docker stack is split
# into a base compose file (Lode + Redis) plus per-service overlays
# (postgres, qbittorrent, prowlarr, jellyfin, flaresolverr, dozzle).
# This script downloads the files that match your selection and starts
# them with `docker compose -f <base> -f <overlay>...`, so the compose
# files stay small, readable, and usable manually.
#
# Your selection is saved in .lode-setup so re-runs can prefill
# the prompts; .env keeps all secrets and URLs.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Nort1346/Lode/main/setup.sh | bash
#   ./setup.sh
# ----------------------------------------------------------------------

# -- Constants ---------------------------------------------------------

REPO_RAW="https://raw.githubusercontent.com/Nort1346/Lode/main"
SETUP_URL="${REPO_RAW}/setup.sh"
SETUP_SELF="$0"
SETUP_NEW="$(mktemp)"

COMPOSE_BASE="docker-compose.yml"
STATE_FILE=".lode-setup"
# Legacy state file name (pre-rename) - migrate it once on re-run.
if [ ! -f "$STATE_FILE" ] && [ -f ".lode-setup.json" ]; then
  mv ".lode-setup.json" "$STATE_FILE"
fi
COMPOSE_FILES=()

cleanup() {
  rm -f "$SETUP_NEW" "${SETUP_SELF}.tmp"
  rm -f .env.example.tmp .env.tmp "${STATE_FILE}.tmp" docker-compose*.tmp
}
trap cleanup EXIT

# Option labels (also used for --selected prefill, so keep them stable)
QBIT_OPT_LOCAL="Local qBittorrent container (recommended)"
QBIT_OPT_EXTERNAL="External qBittorrent (you host it)"
PROWLARR_OPT_LOCAL="Local Prowlarr container (recommended)"
PROWLARR_OPT_EXTERNAL="External Prowlarr (you host it)"
MEDIA_OPT_JELLYFIN_LOCAL="Jellyfin (local container)"
MEDIA_OPT_JELLYFIN_EXTERNAL="Jellyfin (external)"
MEDIA_OPT_NONE="No media server"
ADDON_OPT_FLARESOLVERR="FlareSolverr - CAPTCHA bypass for private trackers"
ADDON_OPT_DOZZLE="Dozzle - Docker log viewer"

# Captured before .env is created in step 2: a pre-existing .env without
# a state file means the old all-or-nothing installer was used.
LEGACY_INSTALL=false
if [ -f .env ] && [ ! -f "$STATE_FILE" ]; then
  LEGACY_INSTALL=true
fi

# -- Privilege helper --------------------------------------------------
# SUDO stays empty when running as root or when no privilege tool exists.
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  elif command -v doas >/dev/null 2>&1; then
    SUDO="doas"
  fi
fi

run_privileged() {
  if [ -n "$SUDO" ]; then
    # shellcheck disable=SC2086
    $SUDO "$@"
  else
    "$@"
  fi
}

# -- Output helpers (plain ANSI - available before gum is known) -------
# Colors degrade to nothing when output is not a terminal or when
# NO_COLOR / TERM=dumb is set, so the script stays readable in old
# terminals, logs, and piped output.

if [ -n "${NO_COLOR:-}" ] || [ "${TERM:-}" = "dumb" ] || [ ! -t 1 ]; then
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  CYAN=''
  GRAY=''
  BOLD=''
  NC=''
else
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  GRAY='\033[0;90m'
  BOLD='\033[1m'
  NC='\033[0m'
fi

# -- Hyperlinks (OSC 8) ------------------------------------------------
# OSC 8 is emitted unconditionally for http(s) URLs. ECMA-48-compliant
# terminals ignore unknown OSC sequences; NO_COLOR only affects SGR
# colors above and never disables hyperlinks.

hyperlink() {
  local url=$1
  local label=${2-}
  local url_only=false

  if [ -z "$label" ] || [ "$label" = "$url" ]; then
    url_only=true
    label=$url
  fi

  if [[ "$url" =~ ^https?:// ]]; then
    printf '\033]8;;%s\033\\%s\033]8;;\033\\' "$url" "$label"
  elif [ "$url_only" = true ]; then
    printf '%s' "$url"
  else
    printf '%s: %s' "$label" "$url"
  fi
}

message_has_osc8() {
  case "$1" in
    *$'\e]8'*) return 0 ;;
    *) return 1 ;;
  esac
}

# -- Clipboard (OSC 52) -------------------------------------------------
# OSC 52 is emitted unconditionally, like OSC 8. Some terminals disable it
# by default for security; that's fine - the visible password is fallback.

copy_to_clipboard() {
  local text=$1
  local encoded
  encoded=$(printf '%s' "$text" | base64 | tr -d '\n') || return 0
  printf '\033]52;c;%s\033\\' "$encoded"
}

info() { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERR ]${NC}  $*"; }

header() { echo -e "\n${BOLD}$1${NC}\n"; }
step()   { echo -e "\n${CYAN}${BOLD}$1${NC}"; }

# -- Piped stdin guard (curl | bash) -----------------------------------
# When piped, the script text arrives on stdin, so interactive prompts
# would read the consumed pipe. Re-exec the freshly downloaded copy with
# the controlling terminal as stdin so the guided prompts work.
if [ ! -t 0 ] && [ -z "${LODE_SETUP_REEXEC:-}" ]; then
  # Note: `[ -r /dev/tty ]` is unreliable here (access() succeeds even
  # without a controlling terminal) - actually opening it is the real test.
  if { : < /dev/tty; } 2>/dev/null && curl -fsSL "$SETUP_URL" -o "$SETUP_NEW" 2>/dev/null; then
    export LODE_SETUP_REEXEC=1
    chmod +x "$SETUP_NEW"
    exec bash "$SETUP_NEW" < /dev/tty "$@"
  fi
  err "Interactive terminal required, but none is available."
  err "Download the script and run it directly: bash setup.sh"
  exit 1
fi

# -- gum bootstrap (optional, never fatal) -----------------------------
# gum is cosmetic: on any failure we continue with plain output.
# The official binary is downloaded from the GitHub release, so no
# package manager, gpg key, or /etc writes are needed.

HAS_GUM=false

install_gum() {
  if command -v gum >/dev/null 2>&1; then
    HAS_GUM=true
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    return 0
  fi

  local os arch
  os=$(uname -s)
  arch=$(uname -m)
  case "$os" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        info "Installing gum via Homebrew..."
        if brew install gum >/dev/null 2>&1; then
          HAS_GUM=true
          return 0
        fi
      fi
      case "$arch" in
        arm64 | x86_64) ;;
        *)
          warn "Unsupported architecture: $arch - continuing without gum."
          return 0
          ;;
      esac
      ;;
    Linux)
      case "$arch" in
        x86_64 | amd64) arch="x86_64" ;;
        aarch64 | arm64) arch="arm64" ;;
        *)
          warn "Unsupported architecture: $arch - continuing without gum."
          return 0
          ;;
      esac
      ;;
    *)
      return 0
      ;;
  esac

  info "Installing gum (charm) for beautiful output..."

  local tag url tmpdir gum_bin
  tag=$(curl -fsSL https://api.github.com/repos/charmbracelet/gum/releases/latest 2>/dev/null \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1) || tag=""
  if [ -z "$tag" ]; then
    warn "Could not resolve the latest gum version - continuing without gum."
    return 0
  fi

  url="https://github.com/charmbracelet/gum/releases/download/${tag}/gum_${tag#v}_${os}_${arch}.tar.gz"
  tmpdir=$(mktemp -d)

  if ! curl -fsSL "$url" -o "${tmpdir}/gum.tar.gz" 2>/dev/null || ! tar -xzf "${tmpdir}/gum.tar.gz" -C "$tmpdir" 2>/dev/null; then
    rm -rf "$tmpdir"
    warn "Could not download gum - continuing without gum."
    return 0
  fi

  gum_bin=$(find "$tmpdir" -type f -name gum 2>/dev/null | head -n 1)
  if [ -z "$gum_bin" ]; then
    rm -rf "$tmpdir"
    warn "gum binary not found in the download - continuing without gum."
    return 0
  fi

  if run_privileged install -m 0755 "$gum_bin" /usr/local/bin/gum 2>/dev/null && command -v gum >/dev/null 2>&1; then
    rm -rf "$tmpdir"
    HAS_GUM=true
    return 0
  fi

  local userbin
  if [ -n "${HOME:-}" ]; then
    userbin="${HOME}/.local/bin/gum"
    if mkdir -p "${HOME}/.local/bin" 2>/dev/null && install -m 0755 "$gum_bin" "$userbin" 2>/dev/null; then
      export PATH="${HOME}/.local/bin:${PATH}"
      rm -rf "$tmpdir"
      HAS_GUM=true
      return 0
    fi
  fi

  rm -rf "$tmpdir"
  warn "Could not install gum - continuing without gum."
  return 0
}

install_gum

# gum prompts are TUIs: they only render in a real terminal and need
# v0.12.0+ (gum log). On any failure we fall back to plain output.
gum_usable() {
  command -v gum >/dev/null 2>&1 || return 1
  [ -t 0 ] || return 1
  [ -t 1 ] || return 1
  [ "${TERM:-}" != "dumb" ] || return 1
  [ -z "${NO_COLOR:-}" ] || return 1
  local ver
  ver=$(gum --version 2>/dev/null | sed -n 's/.*version v\{0,1\}\([0-9][0-9.]*\).*/\1/p' | head -n 1)
  [ -n "$ver" ] || return 1
  [ "$(printf '%s\n' "$ver" "0.12.0" | sort -V | head -n 1)" = "0.12.0" ] || return 1
  command -v tput >/dev/null 2>&1 && tput cols >/dev/null 2>&1 || return 1
  return 0
}

if [ "$HAS_GUM" = true ] && ! gum_usable; then
  HAS_GUM=false
  warn "gum cannot render prompts in this terminal - using plain output."
fi

# -- Prompt & summary helpers (gum-aware) ------------------------------

if [ "$HAS_GUM" = true ]; then
  info() {
    local msg="$*"
    if message_has_osc8 "$msg"; then
      echo -e "${BLUE}[INFO]${NC}  ${msg}"
    else
      gum log --level info "$msg"
    fi
  }
  ok() {
    local msg="$*"
    if message_has_osc8 "$msg"; then
      echo -e "${GREEN}[ OK ]${NC}  ${msg}"
    else
      gum log --level info "$msg"
    fi
  }
  warn() {
    local msg="$*"
    if message_has_osc8 "$msg"; then
      echo -e "${YELLOW}[WARN]${NC}  ${msg}"
    else
      gum log --level warn "$msg"
    fi
  }
  err() {
    local msg="$*"
    if message_has_osc8 "$msg"; then
      echo -e "${RED}[ERR ]${NC}  ${msg}"
    else
      gum log --level error "$msg"
    fi
  }

  summary_section() {
    if message_has_osc8 "$1"; then
      echo -e "${CYAN}$1${NC}"
    else
      gum style \
        --border normal --border-foreground 240 \
        --padding "0 2" "$1"
    fi
  }

  summary_row() {
    local label="$1" url="$2"
    printf "  %-18s %s\n" "$label" "$(hyperlink "$url")"
  }

  bold() {
    if message_has_osc8 "$1"; then
      echo -e "${BOLD}$1${NC}"
    else
      gum style --bold --foreground 11 "$1"
    fi
  }
  dim() {
    if message_has_osc8 "$1"; then
      echo -e "${GRAY}$1${NC}"
    else
      gum style --foreground 14 "$1"
    fi
  }

  read_input() {
    gum input --placeholder "$1"
  }

  # read_input_default <placeholder> <default>
  # Prefills the input so Enter accepts the default.
  read_input_default() {
    gum input --value "$2" --placeholder "$1"
  }

  # read_password <placeholder>  (masked input for API keys)
  read_password() {
    gum input --password --placeholder "$1"
  }

  gum_menu() {
    local prompt="$1"; shift
    gum choose --header "$prompt" "$@"
  }

  # gum_menu_selected <prompt> <preselected-option> <options...>
  # The preselected option starts highlighted; press Enter to accept it.
  gum_menu_selected() {
    local prompt="$1" preselect="$2"; shift 2
    if [ -n "$preselect" ] && printf '%s\n' "$@" | grep -qxF "$preselect"; then
      gum choose --header "$prompt" --selected "$preselect" "$@"
    else
      gum choose --header "$prompt" "$@"
    fi
  }
else
  summary_section() { echo -e "${CYAN}$1${NC}"; }

  summary_row() {
    local label="$1" url="$2"
    printf "  %-18s %s\n" "$label" "$(hyperlink "$url")"
  }

  bold() { echo -e "${BOLD}$1${NC}"; }
  dim()  { echo -e "${GRAY}$1${NC}"; }

  read_input() {
    local result=""
    read -rp "$1: " result || result=""
    echo "$result"
  }

  # read_input_default <placeholder> <default>
  read_input_default() {
    local placeholder="$1" def="$2" result=""
    if [ -n "$def" ]; then
      read -rp "$placeholder [$def]: " result || result=""
    else
      read -rp "$placeholder: " result || result=""
    fi
    if [ -z "$result" ]; then
      echo "$def"
    else
      echo "$result"
    fi
  }

  # read_password <placeholder>  (masked input for API keys)
  read_password() {
    local result=""
    read -rsp "$1: " result || result=""
    echo "" >&2
    echo "$result"
  }

  gum_menu() {
    local prompt="$1"; shift
    plain_menu "$prompt" 1 "$@"
  }

  # gum_menu_selected <prompt> <preselected-option> <options...>
  gum_menu_selected() {
    local prompt="$1" preselect="$2"; shift 2
    local default=1 i=1 opt
    for opt in "$@"; do
      if [ "$opt" = "$preselect" ]; then
        default=$i
      fi
      i=$((i + 1))
    done
    plain_menu "$prompt" "$default" "$@"
  }

  plain_menu() {
    local prompt="$1" default="$2"; shift 2
    local options=("$@")
    local i=1
    echo "$prompt"
    for opt in "${options[@]}"; do
      echo "  $i) $opt"
      i=$((i + 1))
    done
    local choice=""
    while true; do
      if ! read -rp "Enter choice [1-${#options[@]}] (default $default): " choice; then
        choice="$default"
        break
      fi
      if [ -z "$choice" ]; then
        choice="$default"
      fi
      if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#options[@]}" ]; then
        break
      fi
      echo "  Invalid choice. Please enter a number between 1 and ${#options[@]}."
    done
    echo "${options[$((choice - 1))]}"
  }
fi

# -- Helpers -----------------------------------------------------------

generate_password() {
  local raw
  raw=$(openssl rand -base64 96 | tr -dc 'a-zA-Z0-9')
  printf '%s' "${raw:0:$1}"
}

generate_hex() {
  openssl rand -hex "$1"
}

validate_env_min_length() {
  local key="$1" min="$2"
  local value
  value=$(grep "^${key}=" .env 2>/dev/null | head -n 1 | cut -d= -f2-)
  if [ -z "$value" ] || [ ${#value} -lt "$min" ]; then
    return 1
  fi
  return 0
}

read_env_value() {
  local key="$1"
  grep "^${key}=" .env 2>/dev/null | head -n 1 | cut -d= -f2-
}

validate_url() {
  case "$1" in
    http://* | https://*) return 0 ;;
    *) return 1 ;;
  esac
}

# external_url_default <env-key> <internal-url>
# Returns the current .env value unless it is the internal (in-network)
# URL, which is not a useful default for an external instance.
external_url_default() {
  local v
  v=$(read_env_value "$1")
  if [ -n "$v" ] && [ "$v" != "$2" ]; then
    echo "$v"
  fi
}

wait_for_port() {
  local host="$1" port="$2" timeout="${3:-60}" elapsed=0
  while ! nc -z "$host" "$port" 2>/dev/null; do
    sleep 2
    elapsed=$((elapsed + 2))
    if [ "$elapsed" -ge "$timeout" ]; then
      err "Timeout waiting for $host:$port after ${timeout}s"
      return 1
    fi
  done
}

# dc <compose args...>
# Every docker compose call goes through dc() so the -f file list
# (built in the selection step) stays in one place.
dc() {
  if [ ${#COMPOSE_FILES[@]} -eq 0 ]; then
    err "No compose files selected - internal error."
    exit 1
  fi
  # Compose needs one -f per file; a single -f with bare filenames after it
  # makes compose dump its usage and fail with "unknown docker command".
  local -a file_args=()
  local f
  for f in "${COMPOSE_FILES[@]}"; do
    file_args+=("-f" "$f")
  done
  docker compose "${file_args[@]}" "$@"
}

# Renders the copy-pasteable `docker compose -f a -f b ...` prefix for hints.
dc_cmd_prefix() {
  local out="" f
  for f in "${COMPOSE_FILES[@]}"; do
    out+="-f $f "
  done
  printf 'docker compose %s' "${out% }"
}

service_running() {
  # `ps -q` is stable across Compose versions (the JSON output format
  # changed in Compose 2.21, so it is not used for state checks).
  [ -n "$(dc ps -q "$1" 2>/dev/null)" ]
}

update_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" .env && rm -f .env.bak
  elif grep -q "^# *${key}=" .env 2>/dev/null; then
    sed -i.bak "s|^# *${key}=.*|${key}=${value}|" .env && rm -f .env.bak
  else
    echo "${key}=${value}" >> .env
  fi
}

# -- State file (selection memory for re-runs) -------------------------
# Flat key=value file - no JSON parser needed in bash or PowerShell.
# Only selection state lives here; secrets and URLs stay in .env.

state_get() {
  local key="$1"
  if [ ! -f "$STATE_FILE" ]; then
    return 0
  fi
  grep "^${key}=" "$STATE_FILE" 2>/dev/null | head -n 1 | cut -d= -f2-
}

write_state() {
  # Temp file + rename: an interrupted run (Ctrl+C, kill, closed terminal) can never leave a corrupt state file behind.
  {
    echo "version=1"
    echo "dbDriver=${DB_DRIVER_CHOICE}"
    echo "imageTag=${LODE_TAG}"
    echo "qbittorrent=${QBIT_MODE}"
    echo "prowlarr=${PROWLARR_MODE}"
    echo "mediaProvider=${MEDIA_PROVIDER}"
    echo "mediaMode=${MEDIA_MODE}"
    echo "flaresolverr=${USE_FLARESOLVERR}"
    echo "dozzle=${USE_DOZZLE}"
  } > "${STATE_FILE}.tmp" && mv -f "${STATE_FILE}.tmp" "$STATE_FILE"
}

# is_legacy_monolith <file>
# Pre-split compose files defined every service inline. The new postgres
# overlay only defines postgres, so a qbittorrent service block marks a
# file as a legacy monolith.
is_legacy_monolith() {
  [ -f "$1" ] && grep -qE '^  qbittorrent:[[:space:]]*$' "$1"
}

# stop_service_if_deselected <service> <state-key> <active-value> <current-value>
# On re-runs, a service that used to be deployed locally but is no longer
# selected leaves a stopped container behind (we never use
# --remove-orphans). Confirm, then stop and remove the container; its
# volume is kept so switching back keeps all data.
stop_service_if_deselected() {
  local svc="$1" key="$2" active_value="$3" current_value="$4"
  local old_value
  old_value=$(state_get "$key")
  if [ "$old_value" != "$active_value" ]; then
    return 0
  fi
  if [ "$current_value" = "$active_value" ]; then
    return 0
  fi
  local container="lode-${svc}"
  if ! docker ps -q --filter "name=^${container}\$" 2>/dev/null | grep -q .; then
    return 0
  fi
  local keep=true
  if [ "$HAS_GUM" = true ]; then
    if ! gum confirm --default=true "$container is no longer selected. Stop and remove the container? (its volume is kept)"; then
      keep=false
    fi
  else
    local answer
    read -rp "$container is no longer selected. Stop and remove the container? (its volume is kept) [Y/n] " answer || answer="y"
    if [[ "$answer" =~ ^[Nn] ]]; then
      keep=false
    fi
  fi
  if [ "$keep" = true ]; then
    docker stop "$container" >/dev/null 2>&1 || true
    docker rm "$container" >/dev/null 2>&1 || true
    ok "Removed $container (volume kept)"
  else
    warn "Keeping $container - remove it manually with: docker rm $container"
  fi
  return 0
}

# -- Self-update check (continue with local copy on failure) -----------

if curl -fsSL "$SETUP_URL" -o "$SETUP_NEW" 2>/dev/null; then
  if ! diff -q "$SETUP_SELF" "$SETUP_NEW" &>/dev/null; then
    echo ""
    if [ "$HAS_GUM" = true ]; then
      gum style --foreground 11 --bold "A newer version of setup.sh is available."
    else
      echo -e "${YELLOW}${BOLD}  A newer version of setup.sh is available.${NC}"
    fi
    echo ""
    if [ "$HAS_GUM" = true ]; then
      gum confirm --default=false "Update setup.sh and restart?" && {
        cp "$SETUP_SELF" "${SETUP_SELF}.bak"
        cp "$SETUP_NEW" "${SETUP_SELF}.tmp" && mv -f "${SETUP_SELF}.tmp" "$SETUP_SELF"
        chmod +x "$SETUP_SELF"
        ok "Updated setup.sh. Restarting..."
        exec "$SETUP_SELF" "$@"
      }
    else
      read -rp "Update setup.sh and restart? [y/N] " answer || answer=""
      if [[ "$answer" =~ ^[Yy]$ ]]; then
        cp "$SETUP_SELF" "${SETUP_SELF}.bak"
        cp "$SETUP_NEW" "${SETUP_SELF}.tmp" && mv -f "${SETUP_SELF}.tmp" "$SETUP_SELF"
        chmod +x "$SETUP_SELF"
        ok "Updated setup.sh. Restarting..."
        exec "$SETUP_SELF" "$@"
      fi
    fi
    warn "Continuing with current version..."
  fi
fi

# -- Banner ------------------------------------------------------------

header "Lode Auto-Setup v1.1"

echo ""
dim "This will set up Lode and the services you choose."
dim "All data will be stored in Docker volumes."
echo ""

if [ "$HAS_GUM" = true ]; then
  gum confirm --default=false "Do you want to continue?" || { echo "Aborted."; exit 0; }
else
  read -rp "Do you want to continue? (y/N) " confirm || confirm=""
  [[ "$confirm" =~ ^[yY] ]] || { echo "Aborted."; exit 0; }
fi

# -- 1. Prerequisites --------------------------------------------------

step "[1/15] Checking prerequisites"

if ! command -v docker &> /dev/null; then
  err "Docker is not installed."
  case "$(uname -s)" in
    Darwin)
      echo "  Install Docker Desktop for macOS:"
      echo "    $(hyperlink 'https://docs.docker.com/desktop/install/mac-install/')"
      ;;
    Linux)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        echo "  Install Docker Desktop for Windows (WSL2):"
        echo "    $(hyperlink 'https://docs.docker.com/desktop/wsl/')"
      else
        echo "  Install Docker Engine for Linux:"
        echo "    $(hyperlink 'https://docs.docker.com/engine/install/')"
      fi
      ;;
    *)
      echo "  Install Docker:"
      echo "    $(hyperlink 'https://docs.docker.com/get-docker/')"
      ;;
  esac
  exit 1
fi
ok "Docker $(docker --version | sed -n 's/.*version \([^ ,]*\).*/\1/p')"

if ! docker_info_err="$(docker info 2>&1)"; then
  err "Docker daemon is not running or not reachable from this shell."
  # `docker info` prints the whole client section before the failure
  # (the client part works even when the daemon is off) - show only
  # the error lines, falling back to the last lines of the output.
  docker_info_lines="$(printf '%s\n' "$docker_info_err" | grep -iE 'failed to connect|cannot connect|permission denied|connection refused|cannot find|no such file' | head -n 3 || true)"
  if [ -z "$docker_info_lines" ]; then
    docker_info_lines="$(printf '%s\n' "$docker_info_err" | tail -n 3)"
  fi
  printf '%s\n' "$docker_info_lines" | sed -e 's/^/    /'
  case "$(uname -s)" in
    Darwin)
      echo "  Start Docker Desktop and try again."
      ;;
    MSYS* | MINGW* | CYGWIN*)
      echo "  Start Docker Desktop (WSL2 backend) and try again."
      ;;
    Linux)
      echo "  Start the daemon:  sudo systemctl start docker"
      if printf '%s' "$docker_info_err" | grep -qi 'permission'; then
        current_user="${USER:-$(id -un)}"
        if getent group docker 2>/dev/null | cut -d: -f4 | tr ',' '\n' | grep -qx "$current_user" \
          && ! id -nG 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
          echo "  You are in the docker group, but this session predates the change."
          echo "  Log out and back in, or run:  newgrp docker"
        else
          echo "  The error looks like a permission problem - add your user to the docker group:"
          echo "    sudo usermod -aG docker ${current_user}   (then log out and back in)"
        fi
      fi
      ;;
    *)
      echo "  Start the Docker daemon and try again."
      ;;
  esac
  exit 1
fi
ok "Docker daemon running"

if ! docker compose version &> /dev/null 2>&1; then
  err "Docker Compose plugin is not installed."
  echo "  Install Docker Compose:"
  echo "    macOS/Windows: Install or update Docker Desktop"
  echo "      $(hyperlink 'https://docs.docker.com/get-docker/')"
  echo "    Linux: Install the Docker Compose plugin"
  echo "      $(hyperlink 'https://docs.docker.com/compose/install/linux/')"
  exit 1
fi
ok "Docker Compose $(docker compose version --short 2>/dev/null || echo 'available')"

if ! command -v curl &> /dev/null; then
  err "curl is not installed."
  case "$(uname -s)" in
    Darwin)
      echo "  Install curl on macOS:"
      echo "    brew install curl"
      echo "  Or install Xcode Command Line Tools:"
      echo "    xcode-select --install"
      ;;
    Linux)
      if command -v apt-get &> /dev/null; then
        echo "  Install curl: sudo apt-get install -y curl"
      elif command -v yum &> /dev/null; then
        echo "  Install curl: sudo yum install -y curl"
      elif command -v dnf &> /dev/null; then
        echo "  Install curl: sudo dnf install -y curl"
      elif command -v apk &> /dev/null; then
        echo "  Install curl: apk add --no-cache curl"
      else
        echo "  Install curl using your package manager."
      fi
      ;;
    *)
      echo "  Download from: $(hyperlink 'https://curl.se/download.html')"
      ;;
  esac
  exit 1
fi
ok "curl available"

if ! command -v openssl &> /dev/null; then
  err "openssl is not installed."
  case "$(uname -s)" in
    Darwin)
      echo "  Install Xcode Command Line Tools: xcode-select --install"
      ;;
    Linux)
      if command -v apt-get &> /dev/null; then
        echo "  Install openssl: sudo apt-get install -y openssl"
      elif command -v yum &> /dev/null; then
        echo "  Install openssl: sudo yum install -y openssl"
      elif command -v dnf &> /dev/null; then
        echo "  Install openssl: sudo dnf install -y openssl"
      elif command -v apk &> /dev/null; then
        echo "  Install openssl: apk add --no-cache openssl"
      else
        echo "  Install openssl using your package manager."
      fi
      ;;
    *)
      echo "  Install openssl using your package manager."
      ;;
  esac
  exit 1
fi
ok "openssl available"

if ! command -v nc &> /dev/null; then
  err "nc (netcat) is not installed."
  case "$(uname -s)" in
    Darwin)
      echo "  nc ships with macOS - check that /usr/bin is in your PATH."
      ;;
    Linux)
      if command -v apt-get &> /dev/null; then
        echo "  Install netcat: sudo apt-get install -y netcat-openbsd"
      elif command -v yum &> /dev/null; then
        echo "  Install netcat: sudo yum install -y nmap-ncat"
      elif command -v dnf &> /dev/null; then
        echo "  Install netcat: sudo dnf install -y nmap-ncat"
      elif command -v apk &> /dev/null; then
        echo "  Install netcat: apk add --no-cache netcat-openbsd"
      else
        echo "  Install netcat using your package manager."
      fi
      ;;
    *)
      echo "  Install netcat using your package manager."
      ;;
  esac
  exit 1
fi
ok "nc available"

# -- 2. Create .env ----------------------------------------------------

step "[2/15] Setting up .env file"

if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    info "Downloading .env.example from GitHub..."
    curl -fsSL "${REPO_RAW}/.env.example" -o .env.example.tmp || {
      err "Failed to download .env.example from GitHub."
      echo "  Check your internet connection and try again."
      exit 1
    }
    mv -f .env.example.tmp .env.example
  fi
  cp .env.example .env.tmp && mv -f .env.tmp .env
  ok "Created .env from .env.example"
else
  warn ".env exists -- keeping existing config"
fi

mkdir -p media/Movies media/Series
ok "Created media directories (media/Movies, media/Series)"

# -- 3. Detect existing setup ------------------------------------------

step "[3/15] Detecting existing setup"

state_file_found=false
if [ -f "$STATE_FILE" ]; then
  state_file_found=true
  info "Existing setup found ($STATE_FILE):"
  dim "  Database:    $(state_get dbDriver)"
  dim "  qBittorrent: $(state_get qbittorrent)"
  dim "  Prowlarr:    $(state_get prowlarr)"
  dim "  Media:       $(state_get mediaProvider) ($(state_get mediaMode))"
  dim "  Add-ons:     FlareSolverr=$(state_get flaresolverr) Dozzle=$(state_get dozzle)"
  echo ""
  if [ "$HAS_GUM" = true ]; then
    gum confirm --default=true "Reconfigure your existing Lode setup?" || {
      ok "Keeping existing setup - no changes made."
      exit 0
    }
  else
    read -rp "Reconfigure your existing Lode setup? [Y/n] " reconf || reconf="y"
    if [[ "$reconf" =~ ^[Nn] ]]; then
      ok "Keeping existing setup - no changes made."
      exit 0
    fi
  fi
fi

# Legacy installs (old all-or-nothing installer) deployed the full
# stack, so preselect everything local including Dozzle.
if [ "$LEGACY_INSTALL" = true ]; then
  info "Existing .env without $STATE_FILE - assuming a previous full-stack install."
fi

# Migrate legacy monolith compose files (they predate the split).
if is_legacy_monolith "docker-compose.sqlite.yml"; then
  mv "docker-compose.sqlite.yml" "docker-compose.sqlite.yml.legacy"
  warn "Moved legacy docker-compose.sqlite.yml to docker-compose.sqlite.yml.legacy"
fi
if is_legacy_monolith "docker-compose.postgres.yml"; then
  mv "docker-compose.postgres.yml" "docker-compose.postgres.yml.legacy"
  warn "Moved legacy docker-compose.postgres.yml to docker-compose.postgres.yml.legacy"
fi
ok "Setup detection complete"

# -- 4. Generate secrets (idempotent) ----------------------------------
# Secrets are only generated when missing or too short, so re-running
# the script never invalidates existing sessions or encrypted data.

step "[4/15] Generating secrets"

if validate_env_min_length "NUXT_SESSION_PASSWORD" 32; then
  ok "Session password already set - keeping it"
else
  SESSION_PASSWORD=$(generate_password 32)
  update_env "NUXT_SESSION_PASSWORD" "$SESSION_PASSWORD"
  ok "Session password generated"
fi

if validate_env_min_length "NUXT_TRACKER_ENCRYPTION_KEY" 32; then
  ok "Tracker encryption key already set - keeping it"
else
  TRACKER_KEY=$(generate_hex 32)
  update_env "NUXT_TRACKER_ENCRYPTION_KEY" "$TRACKER_KEY"
  ok "Tracker encryption key generated"
fi

# -- 5. Database driver choice ----------------------------------------

step "[5/15] Database driver"

DB_DRIVER_CHOICE="sqlite"

DB_CHOICE_PRE=""
if [ "$state_file_found" = true ]; then
  case "$(state_get dbDriver)" in
    postgres) DB_CHOICE_PRE="PostgreSQL" ;;
    sqlite) DB_CHOICE_PRE="SQLite (recommended)" ;;
  esac
else
  existing_db_driver=$(read_env_value "DB_DRIVER")
  if [ "$existing_db_driver" = "postgres" ]; then
    DB_CHOICE_PRE="PostgreSQL"
  elif [ -n "$existing_db_driver" ] && [ "$existing_db_driver" != "sqlite" ]; then
    info "Existing database driver: $existing_db_driver"
  fi
fi

if [ "$HAS_GUM" != true ]; then
  echo ""
  echo "Choose your database driver:"
  echo "  SQLite    - Zero config, file-based, recommended for most users"
  echo "  PostgreSQL - Full-featured, requires more resources"
  echo ""
fi

DB_CHOICE=$(gum_menu_selected "Select database driver:" "$DB_CHOICE_PRE" "SQLite (recommended)" "PostgreSQL")

if [[ "$DB_CHOICE" == *"PostgreSQL"* ]]; then
  DB_DRIVER_CHOICE="postgres"
else
  DB_DRIVER_CHOICE="sqlite"
fi

ok "Database driver: $DB_DRIVER_CHOICE"

if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  if validate_env_min_length "POSTGRES_PASSWORD" 32; then
    ok "PostgreSQL password already set - keeping it"
  else
    POSTGRES_PASSWORD=$(generate_password 32)
    update_env "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
    ok "PostgreSQL password generated"
  fi
fi

# -- 6. Component selection ---------------------------------------------

step "[6/15] Selecting components"

echo ""
dim "Lode and Redis are always deployed. Choose the rest:"
echo ""

# Preselect: state file (re-run) > legacy full-stack install > defaults.
QBIT_PRE="$QBIT_OPT_LOCAL"
PROWLARR_PRE="$PROWLARR_OPT_LOCAL"
MEDIA_PRE="$MEDIA_OPT_JELLYFIN_LOCAL"
USE_FLARESOLVERR=false
USE_DOZZLE=false

if [ "$state_file_found" = true ]; then
  case "$(state_get qbittorrent)" in
    external) QBIT_PRE="$QBIT_OPT_EXTERNAL" ;;
  esac
  case "$(state_get prowlarr)" in
    external) PROWLARR_PRE="$PROWLARR_OPT_EXTERNAL" ;;
  esac
  case "$(state_get mediaMode)" in
    external) MEDIA_PRE="$MEDIA_OPT_JELLYFIN_EXTERNAL" ;;
    none) MEDIA_PRE="$MEDIA_OPT_NONE" ;;
  esac
  if [ "$(state_get flaresolverr)" = "true" ]; then
    USE_FLARESOLVERR=true
  else
    USE_FLARESOLVERR=false
  fi
  if [ "$(state_get dozzle)" = "true" ]; then
    USE_DOZZLE=true
  else
    USE_DOZZLE=false
  fi
elif [ "$LEGACY_INSTALL" = true ]; then
  # The old installer ran Dozzle as part of the full stack.
  USE_DOZZLE=true
fi

# 6a. Torrent client
QBIT_CHOICE=$(gum_menu_selected "How should Lode download torrents?" "$QBIT_PRE" "$QBIT_OPT_LOCAL" "$QBIT_OPT_EXTERNAL")
case "$QBIT_CHOICE" in
  *"External qBittorrent"*)
    QBIT_MODE="external"
    QBIT_URL=$(read_input_default "External qBittorrent URL (http://host:8080)" "$(external_url_default NUXT_QBITTORRENT_URL http://qbittorrent:8080)")
    if ! validate_url "$QBIT_URL"; then
      warn "External qBittorrent URL does not start with http(s):// - Lode will not be able to reach it"
    fi
    ;;
  *)
    QBIT_MODE="local"
    QBIT_URL=""
    ;;
esac
ok "qBittorrent: $QBIT_MODE"

# 6b. Indexer
PROWLARR_CHOICE=$(gum_menu_selected "How should Lode index torrents?" "$PROWLARR_PRE" "$PROWLARR_OPT_LOCAL" "$PROWLARR_OPT_EXTERNAL")
case "$PROWLARR_CHOICE" in
  *"External Prowlarr"*)
    PROWLARR_MODE="external"
    PROWLARR_URL=$(read_input_default "External Prowlarr URL (http://host:9696)" "$(external_url_default NUXT_PROWLARR_URL http://prowlarr:9696)")
    ;;
  *)
    PROWLARR_MODE="local"
    PROWLARR_URL=""
    ;;
esac
if [ "$PROWLARR_MODE" = "external" ]; then
  if ! validate_url "$PROWLARR_URL"; then
    warn "External Prowlarr URL does not start with http(s):// - Lode will not be able to reach it"
  fi
fi
ok "Prowlarr: $PROWLARR_MODE"

# 6c. Media server
MEDIA_CHOICE=$(gum_menu_selected "Media server (library detection)?" "$MEDIA_PRE" "$MEDIA_OPT_JELLYFIN_LOCAL" "$MEDIA_OPT_JELLYFIN_EXTERNAL" "$MEDIA_OPT_NONE")
case "$MEDIA_CHOICE" in
  *"Jellyfin (external)"*)
    MEDIA_PROVIDER="jellyfin"
    MEDIA_MODE="external"
    JELLYFIN_URL=$(read_input_default "External Jellyfin URL (http://host:8096)" "$(external_url_default NUXT_JELLYFIN_URL http://jellyfin:8096)")
    ;;
  *"No media server"*)
    MEDIA_PROVIDER="none"
    MEDIA_MODE="none"
    JELLYFIN_URL=""
    ;;
  *)
    MEDIA_PROVIDER="jellyfin"
    MEDIA_MODE="local"
    JELLYFIN_URL=""
    ;;
esac
if [ "$MEDIA_MODE" = "external" ]; then
  if ! validate_url "$JELLYFIN_URL"; then
    warn "External Jellyfin URL does not start with http(s):// - Lode will not be able to reach it"
  fi
fi
ok "Media server: ${MEDIA_PROVIDER} (${MEDIA_MODE})"

# 6d. Add-ons (multi-select)
if [ "$HAS_GUM" = true ]; then
  sel_args=()
  if [ "$USE_FLARESOLVERR" = true ]; then
    sel_args+=(--selected "$ADDON_OPT_FLARESOLVERR")
  fi
  if [ "$USE_DOZZLE" = true ]; then
    sel_args+=(--selected "$ADDON_OPT_DOZZLE")
  fi
  if [ ${#sel_args[@]} -gt 0 ]; then
    choices=$(gum choose --no-limit --header "Select optional add-ons:" "${sel_args[@]}" "$ADDON_OPT_FLARESOLVERR" "$ADDON_OPT_DOZZLE") || choices=""
  else
    choices=$(gum choose --no-limit --header "Select optional add-ons:" "$ADDON_OPT_FLARESOLVERR" "$ADDON_OPT_DOZZLE") || choices=""
  fi
else
  # Enter keeps the prefilled selection (state file / legacy / defaults).
  pre_sel=""
  if [ "$USE_FLARESOLVERR" = true ]; then
    pre_sel="${pre_sel}1,"
  fi
  if [ "$USE_DOZZLE" = true ]; then
    pre_sel="${pre_sel}2,"
  fi
  pre_sel="${pre_sel%,}"
  if [ -n "$pre_sel" ]; then
    default_note="keep current ($pre_sel)"
  else
    default_note="none"
  fi
  echo "Select optional add-ons (numbers separated by commas, e.g. 1,2 - Enter for $default_note):"
  echo "  1) $ADDON_OPT_FLARESOLVERR"
  echo "  2) $ADDON_OPT_DOZZLE"
  choices=""
  addon_input=""
  read -rp "Add-ons: " addon_input || addon_input=""
  if [ -z "$addon_input" ]; then
    if [ "$USE_FLARESOLVERR" = true ]; then
      choices="${choices}${ADDON_OPT_FLARESOLVERR}"$'\n'
    fi
    if [ "$USE_DOZZLE" = true ]; then
      choices="${choices}${ADDON_OPT_DOZZLE}"$'\n'
    fi
  else
    IFS=',' read -ra addon_parts <<< "$addon_input"
    for part in "${addon_parts[@]}"; do
      part="${part// /}"
      case "$part" in
        1) choices="${choices}${ADDON_OPT_FLARESOLVERR}"$'\n' ;;
        2) choices="${choices}${ADDON_OPT_DOZZLE}"$'\n' ;;
        "") : ;;
        *) echo "  Invalid selection: $part" ;;
      esac
    done
  fi
fi
USE_FLARESOLVERR=false
USE_DOZZLE=false
while IFS= read -r choice_line; do
  case "$choice_line" in
    FlareSolverr*) USE_FLARESOLVERR=true ;;
    Dozzle*) USE_DOZZLE=true ;;
  esac
done <<< "$choices"
ok "Add-ons: FlareSolverr=$USE_FLARESOLVERR Dozzle=$USE_DOZZLE"

# Build the compose file list for the selected stack.
COMPOSE_FILES=("$COMPOSE_BASE")
if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  COMPOSE_FILES+=("docker-compose.postgres.yml")
fi
if [ "$QBIT_MODE" = "local" ]; then
  COMPOSE_FILES+=("docker-compose.qbittorrent.yml")
fi
if [ "$PROWLARR_MODE" = "local" ]; then
  COMPOSE_FILES+=("docker-compose.prowlarr.yml")
fi
if [ "$MEDIA_MODE" = "local" ]; then
  COMPOSE_FILES+=("docker-compose.jellyfin.yml")
fi
if [ "$USE_FLARESOLVERR" = true ]; then
  COMPOSE_FILES+=("docker-compose.flaresolverr.yml")
fi
if [ "$USE_DOZZLE" = true ]; then
  COMPOSE_FILES+=("docker-compose.dozzle.yml")
fi

# -- 7. Download compose files ------------------------------------------
# The lode image tag is written by the version step below - mask it
# when comparing, so tag-only differences never trigger a replace prompt.

normalize_compose_tag() {
  sed -E 's|^([[:space:]]*(#[[:space:]]*)?)(image:[[:space:]]*ghcr\.io/nort1346/lode:)[^[:space:]]+|\1\3<version>|' "$1"
}

step "[7/15] Downloading compose files"

# Only files that existed before this step can be out of date -
# freshly downloaded files never get an update prompt.
EXISTING_COMPOSE_FILES=()
for compose_file in "${COMPOSE_FILES[@]}"; do
  if [ -f "$compose_file" ]; then
    EXISTING_COMPOSE_FILES+=("$compose_file")
  fi
done

# Missing files are downloaded directly - no prompt needed.
# Downloads land in a temp file first so an interrupted run never leaves a truncated compose file behind.
for compose_file in "${COMPOSE_FILES[@]}"; do
  if [ ! -f "$compose_file" ]; then
    info "Downloading ${compose_file}..."
    curl -fsSL "${REPO_RAW}/${compose_file}" -o "${compose_file}.tmp" || {
      err "Failed to download ${compose_file} from GitHub."
      echo "  Check your internet connection and try again."
      exit 1
    }
    mv -f "${compose_file}.tmp" "$compose_file"
    ok "${compose_file} downloaded"
  fi
done

if [ ${#EXISTING_COMPOSE_FILES[@]} -gt 0 ]; then
  do_update=false
  if [ "$HAS_GUM" = true ]; then
    if gum confirm --default=false "${#EXISTING_COMPOSE_FILES[@]} compose file(s) already exist. Download the latest versions from GitHub? (changed files keep a .bak backup)"; then
      do_update=true
    fi
  else
    read -rp "${#EXISTING_COMPOSE_FILES[@]} compose file(s) already exist. Download the latest versions from GitHub? [y/N] " answer || answer=""
    if [[ "$answer" =~ ^[Yy]$ ]]; then
      do_update=true
    fi
  fi
  for compose_file in "${EXISTING_COMPOSE_FILES[@]}"; do
    if [ "$do_update" = true ]; then
      if curl -fsSL "${REPO_RAW}/${compose_file}" -o "${compose_file}.tmp" 2>/dev/null; then
        if ! diff -q <(normalize_compose_tag "$compose_file") <(normalize_compose_tag "${compose_file}.tmp") &>/dev/null; then
          cp "$compose_file" "${compose_file}.bak"
          mv -f "${compose_file}.tmp" "$compose_file"
          ok "${compose_file} updated (backup saved as ${compose_file}.bak)"
        else
          rm -f "${compose_file}.tmp"
          ok "${compose_file} is already up to date"
        fi
      else
        rm -f "${compose_file}.tmp"
        warn "Could not download ${compose_file} - keeping your local copy"
      fi
    else
      ok "Using existing ${compose_file}"
    fi
  done
fi

# -- 8. Lode version choice --------------------------------------
# The version choice is the single source of truth for the image tag:
# it is written into the base compose file here, after the download step.

step "[8/15] Lode version"

LODE_TAG="latest"

VERSION_PRE="latest (recommended)"
if [ "$state_file_found" = true ] && [ "$(state_get imageTag)" = "nightly" ]; then
  VERSION_PRE="nightly"
fi

if [ "$HAS_GUM" != true ]; then
  echo ""
  echo "Which Lode image do you want to use?"
  echo "  latest  - Stable release (recommended)"
  echo "  nightly - Latest dev build from main (may be unstable)"
  echo ""
fi

LODE_TAG_CHOICE=$(gum_menu_selected "Select version:" "$VERSION_PRE" "latest (recommended)" "nightly")

if [[ "$LODE_TAG_CHOICE" == *"nightly"* ]]; then
  LODE_TAG="nightly"
else
  LODE_TAG="latest"
fi

if grep -qE '^[[:space:]]*image:[[:space:]]*ghcr\.io/nort1346/lode:' "$COMPOSE_BASE"; then
  sed -i.bak -E "s|^([[:space:]]*image:[[:space:]]*ghcr\.io/nort1346/lode:)[^[:space:]]+|\1${LODE_TAG}|" "$COMPOSE_BASE" && rm -f "${COMPOSE_BASE}.bak"
  ok "Lode version: $LODE_TAG (image: ghcr.io/nort1346/lode:${LODE_TAG})"
else
  warn "No lode image line found in $COMPOSE_BASE - check the image tag manually"
fi

# Remember the selection so the next run can prefill the prompts.
write_state
ok "Selection saved to $STATE_FILE"

# -- 9. Pull and start selected services ------------------------------

step "[9/15] Starting selected services"

# Validate the merged configuration before touching the daemon.
if ! dc config -q 2>/dev/null; then
  err "The selected compose files do not merge correctly."
  err "Files: ${COMPOSE_FILES[*]}"
  exit 1
fi

# Remove containers for services that are no longer selected locally.
if [ "$state_file_found" = true ]; then
  stop_service_if_deselected "qbittorrent" "qbittorrent" "local" "$QBIT_MODE"
  stop_service_if_deselected "prowlarr" "prowlarr" "local" "$PROWLARR_MODE"
  stop_service_if_deselected "jellyfin" "mediaMode" "local" "$MEDIA_MODE"
  stop_service_if_deselected "flaresolverr" "flaresolverr" "true" "$USE_FLARESOLVERR"
  stop_service_if_deselected "dozzle" "dozzle" "true" "$USE_DOZZLE"
  stop_service_if_deselected "postgres" "dbDriver" "postgres" "$DB_DRIVER_CHOICE"
fi

INFRA_SERVICES=(redis)
if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  INFRA_SERVICES+=(postgres)
fi
if [ "$QBIT_MODE" = "local" ]; then
  INFRA_SERVICES+=(qbittorrent)
fi
if [ "$PROWLARR_MODE" = "local" ]; then
  INFRA_SERVICES+=(prowlarr)
fi
if [ "$MEDIA_MODE" = "local" ]; then
  INFRA_SERVICES+=(jellyfin)
fi
if [ "$USE_FLARESOLVERR" = true ]; then
  INFRA_SERVICES+=(flaresolverr)
fi
if [ "$USE_DOZZLE" = true ]; then
  INFRA_SERVICES+=(dozzle)
fi

info "Pulling images..."
dc pull || true

if ! docker image inspect "ghcr.io/nort1346/lode:${LODE_TAG}" &> /dev/null; then
  err "Failed to pull the Lode image (ghcr.io/nort1346/lode:${LODE_TAG}). Check your network and try again."
  err "You can also try manually: $(dc_cmd_prefix) pull lode"
  exit 1
fi

dc up -d "${INFRA_SERVICES[@]}"

failed_services=""
for svc in "${INFRA_SERVICES[@]}"; do
  if ! service_running "$svc"; then
    failed_services="$failed_services $svc"
    last_log=$(dc logs "$svc" --tail 3 2>&1 | tail -1)
    warn "$svc failed to start: $last_log"
  fi
done

if [[ " $failed_services " =~ " redis " ]]; then
  err "Redis failed to start. Cannot continue."
  echo "  Check logs: $(dc_cmd_prefix) logs redis"
  exit 1
fi
if [ "$DB_DRIVER_CHOICE" = "postgres" ] && [[ " $failed_services " =~ " postgres " ]]; then
  err "PostgreSQL failed to start. Cannot continue."
  echo "  Check logs: $(dc_cmd_prefix) logs postgres"
  exit 1
fi
if [ "$QBIT_MODE" = "local" ] && [[ " $failed_services " =~ " qbittorrent " ]]; then
  err "qBittorrent failed to start. Cannot continue."
  echo "  Check logs: $(dc_cmd_prefix) logs qbittorrent"
  exit 1
fi

info "Waiting for Redis..."
wait_for_port "localhost" "6379" 30 || true

if [ "$QBIT_MODE" = "local" ]; then
  info "Waiting for qBittorrent..."
  wait_for_port "localhost" "8080" 60 || true
fi

sleep 3

QBIT_TEMP_PASS=""
if [ "$QBIT_MODE" = "local" ]; then
  QBIT_TEMP_PASS=$(dc logs qbittorrent 2>&1 | sed -n 's/.*A temporary password is provided for this session: *//p' | tail -1) || true
fi

if [ "$PROWLARR_MODE" = "local" ]; then
  if [[ " $failed_services " =~ " prowlarr " ]]; then
    warn "Prowlarr not running -- you can configure it later (step 12)"
  else
    info "Waiting for Prowlarr..."
    wait_for_port "localhost" "9900" 60 || true
  fi
fi

if [ "$MEDIA_MODE" = "local" ]; then
  if [[ " $failed_services " =~ " jellyfin " ]]; then
    warn "Jellyfin not running -- you can configure it later (step 10)"
  else
    info "Waiting for Jellyfin..."
    wait_for_port "localhost" "8096" 90 || true
  fi
fi

ok "Selected services are running"

if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  info "Waiting for PostgreSQL..."
  wait_for_port "localhost" "5432" 30 || true
fi

info "Waiting 10s for services to fully initialize..."
sleep 10

# -- Clipboard read (primary secret entry) -----------------------------
# Secrets are entered by copying the value in the browser and pressing
# Enter here - the script reads it from the clipboard. Type m at the
# gate to paste manually for that one field. Without a clipboard tool
# (headless server), the manual prompt is used directly.

CLIPBOARD_CMD=""

detect_clipboard() {
  case "$(uname -s)" in
    Darwin)
      command -v pbpaste >/dev/null 2>&1 && CLIPBOARD_CMD="pbpaste"
      ;;
    Linux)
      if [ -n "${WAYLAND_DISPLAY:-}" ]; then
        command -v wl-paste >/dev/null 2>&1 && CLIPBOARD_CMD="wl-paste"
      elif command -v xclip >/dev/null 2>&1; then
        CLIPBOARD_CMD="xclip"
      elif command -v xsel >/dev/null 2>&1; then
        CLIPBOARD_CMD="xsel"
      fi
      ;;
  esac
}

# Prints the clipboard content to stdout (exact content, no extras).
read_clipboard() {
  case "$CLIPBOARD_CMD" in
    pbpaste) pbpaste ;;
    xclip) xclip -selection clipboard -o ;;
    xsel) xsel --clipboard --output ;;
    wl-paste) wl-paste --no-newline ;;
  esac
}

# read_secret <Name>
# Prints the value to stdout (captured by the caller); every user-facing
# line goes to stderr so command substitution captures only the value.
read_secret() {
  local name="$1" answer="" value=""
  if [ -z "$CLIPBOARD_CMD" ]; then
    dim "No clipboard tool available - paste manually (right-click or Ctrl+Shift+V, not Ctrl+C)." >&2
    read_password "Paste your $name (Enter to skip)"
    return
  fi
  while true; do
    echo "Copy your $name to your clipboard, then press Enter" >&2
    dim "Type m and press Enter to paste manually instead." >&2
    read -rp "> " answer || return
    case "$answer" in
      m | M)
        read_password "Paste your $name (Enter to skip)"
        return
        ;;
      "")
        value=$(read_clipboard 2>/dev/null)
        value="${value//$'\r'/}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"
        if [ -n "$value" ]; then
          ok "Received from clipboard (${#value} characters)" >&2
          printf '%s' "$value"
        else
          warn "Clipboard is empty - paste manually instead." >&2
          dim "Paste with right-click or Ctrl+Shift+V (not Ctrl+C)." >&2
          read_password "Paste your $name (Enter to skip)"
        fi
        return
        ;;
      *)
        warn "Press Enter to read the clipboard, or m to paste manually." >&2
        ;;
    esac
  done
}

detect_clipboard

# -- 10. Jellyfin API Key ----------------------------------------------

step "[10/15] Jellyfin API key"

if [ "$MEDIA_PROVIDER" = "none" ]; then
  update_env "NUXT_JELLYFIN_URL" ""
  update_env "NUXT_JELLYFIN_API_KEY" ""
  info "No media server selected - NUXT_JELLYFIN_URL and NUXT_JELLYFIN_API_KEY cleared"
elif [ "$MEDIA_MODE" = "local" ]; then
  echo ""
  echo "Follow these steps to get your Jellyfin API key:"
  dim "  1. Open $(hyperlink 'http://localhost:8096') in your browser"
  dim "  2. Complete the setup wizard (create your admin account)"
  dim "  3. Go to Dashboard (gear icon) > API Keys"
  dim '  4. Click the + button, name it Lode, click OK'
  dim "  5. Copy the generated API key"
  echo ""
  jellyfinKey=$(read_secret "Jellyfin API key")
  if [ -n "$jellyfinKey" ]; then
    update_env "NUXT_JELLYFIN_API_KEY" "$jellyfinKey"
    ok "Jellyfin API key saved"
  else
    warn "Skipping Jellyfin API key -- set it later in .env"
  fi
else
  echo ""
  echo "Your external Jellyfin instance: $(hyperlink "$JELLYFIN_URL")"
  dim "Create an API key in Jellyfin: Dashboard (gear icon) > API Keys"
  echo ""
  jellyfinKey=$(read_secret "Jellyfin API key")
  if [ -n "$jellyfinKey" ]; then
    update_env "NUXT_JELLYFIN_API_KEY" "$jellyfinKey"
    ok "Jellyfin API key saved"
  else
    warn "Skipping Jellyfin API key -- set it later in .env"
  fi
fi

# -- 11. qBittorrent WebUI + API Key -----------------------------------

step "[11/15] qBittorrent WebUI + API key"

if [ "$QBIT_MODE" = "local" ]; then
  if [ -n "${QBIT_TEMP_PASS:-}" ]; then
    copy_to_clipboard "$QBIT_TEMP_PASS"
    echo ""
    echo -e "${BOLD}${YELLOW}qBittorrent temporary password: ${QBIT_TEMP_PASS}${NC}"
    dim "✓ Copied to clipboard (this replaces your previous clipboard contents)"
    echo ""
  else
    warn "Could not extract qBittorrent temp password - check: $(dc_cmd_prefix) logs qbittorrent"
  fi

  echo "Follow these steps to configure qBittorrent:"
  dim "  1. Open $(hyperlink 'http://localhost:8080') in your browser"
  dim "  2. Login with:"
  dim "       Username: admin"
  dim "       Password: [temporary password shown above]"
  dim "  3. Go to Tools > Options > Web UI"
  dim "  4. Change the password to something you remember"
  dim "  5. Save changes"
  dim "  6. Go to Tools > Options > Web UI > API Key section"
  dim "  7. Copy the API Key"
  echo ""

  qbitKey=$(read_secret "qBittorrent API key")
  if [ -n "$qbitKey" ]; then
    update_env "NUXT_QBITTORRENT_API_KEY" "$qbitKey"
    ok "qBittorrent API key saved"
  else
    warn "Skipping qBittorrent API key -- set it later in .env"
  fi
else
  echo ""
  echo "Your external qBittorrent instance: $(hyperlink "$QBIT_URL")"
  dim "Find the API key in qBittorrent: Tools > Options > Web UI"
  echo ""
  qbitKey=$(read_secret "qBittorrent API key")
  if [ -n "$qbitKey" ]; then
    update_env "NUXT_QBITTORRENT_API_KEY" "$qbitKey"
    ok "qBittorrent API key saved"
  else
    warn "Skipping qBittorrent API key -- set it later in .env"
  fi
fi

# -- 12. Prowlarr API Key ----------------------------------------------

step "[12/15] Prowlarr API key"

if [ "$PROWLARR_MODE" = "local" ]; then
  echo ""
  echo "Follow these steps to get your Prowlarr API key:"
  dim "  1. Open $(hyperlink 'http://localhost:9900') in your browser"
  dim "  2. Go to Settings > General"
  dim "  3. Find the API Key field"
  dim "  4. Copy the API key"
  echo ""
  echo -e "${BOLD}${YELLOW}IMPORTANT: Prowlarr needs indexers before Lode can find anything.${NC}"
  dim "  1. Add at least one indexer (e.g. YTS): Settings > Indexers > Add"
  if [ "$USE_FLARESOLVERR" = true ]; then
    dim "  2. For private trackers: Settings > Indexers > Add > FlareSolverr"
    dim "     Set URL: http://flaresolverr:8191"
  fi
  echo ""
else
  echo ""
  echo "Your external Prowlarr instance: $(hyperlink "$PROWLARR_URL")"
  dim "Find the API key in Prowlarr: Settings > General"
  echo ""
fi

prowlarrKey=$(read_secret "Prowlarr API key")

if [ -n "$prowlarrKey" ]; then
  update_env "NUXT_PROWLARR_API_KEY" "$prowlarrKey"
  ok "Prowlarr API key saved"
else
  warn "Skipping Prowlarr API key -- set it later in .env"
fi

# -- 13. TMDB API Key --------------------------------------------------

step "[13/15] TMDB API key"

echo ""
echo "Follow these steps to get your TMDB API key:"
dim "  1. Go to $(hyperlink 'https://www.themoviedb.org/settings/api')"
dim "  2. Create a free account (or log in)"
dim '  3. Click the link to generate an API key'
dim "  4. Fill in the form:"
dim "       Application Name:  Lode"
dim "       Application URL:   $(hyperlink 'http://localhost:5757')"
dim "  5. Copy your API Key (v3 auth)"
echo ""
dim "This is required for movie/TV metadata."
echo ""

tmdbKey=$(read_secret "TMDB API key")

if [ -n "$tmdbKey" ]; then
  update_env "NUXT_TMDB_API_KEY" "$tmdbKey"
  ok "TMDB API key saved"
else
  warn "Skipping TMDB API key -- set it later in .env"
fi

# -- 14. Discord Webhook (optional) -----------------------------------

step "[14/15] Discord Webhook (optional)"

set_webhook=false
if [ "$HAS_GUM" = true ]; then
  if gum confirm --default=false "Get notified in Discord when downloads complete. Set up a webhook now?"; then
    set_webhook=true
  fi
else
  read -rp "Get notified in Discord when downloads complete. Set up a webhook now? [y/N] " answer || answer=""
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    set_webhook=true
  fi
fi

if [ "$set_webhook" = true ]; then
  echo ""
  echo "To set up a Discord webhook:"
  dim "  1. Open your Discord server"
  dim "  2. Go to Server Settings > Integrations > Webhooks"
  dim '  3. Click New Webhook'
  dim "  4. Name it, choose a channel, click Copy Webhook URL"
  echo ""

  discordKey=$(read_secret "Discord Webhook URL")

  if [ -n "$discordKey" ]; then
    update_env "NUXT_DISCORD_WEBHOOK_URL" "$discordKey"
    ok "Discord webhook URL saved"
  else
    warn "Skipping Discord webhook -- set it later in .env"
  fi
else
  dim "Skipped -- set NUXT_DISCORD_WEBHOOK_URL in .env later if you change your mind."
fi

# -- 15. Start Lode ----------------------------------------------------

step "[15/15] Starting Lode"

update_env "NUXT_REDIS_URL" "redis://redis:6379"
update_env "DB_DRIVER" "$DB_DRIVER_CHOICE"

case "$QBIT_MODE" in
  local) update_env "NUXT_QBITTORRENT_URL" "http://qbittorrent:8080" ;;
  external) update_env "NUXT_QBITTORRENT_URL" "$QBIT_URL" ;;
esac
case "$PROWLARR_MODE" in
  local) update_env "NUXT_PROWLARR_URL" "http://prowlarr:9696" ;;
  external) update_env "NUXT_PROWLARR_URL" "$PROWLARR_URL" ;;
esac
case "$MEDIA_MODE" in
  local) update_env "NUXT_JELLYFIN_URL" "http://jellyfin:8096" ;;
  external) update_env "NUXT_JELLYFIN_URL" "$JELLYFIN_URL" ;;
esac
if [ "$USE_FLARESOLVERR" = true ]; then
  update_env "NUXT_FLARESOLVERR_URL" "http://flaresolverr:8191"
else
  update_env "NUXT_FLARESOLVERR_URL" ""
fi

if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  PG_PASS=$(read_env_value "POSTGRES_PASSWORD")
  update_env "DATABASE_URL" "postgresql://lode:${PG_PASS}@postgres:5432/lode"
fi

info "Starting Lode..."
dc up -d lode || true

if ! service_running lode; then
  err "Lode container failed to start. Check logs:"
  err "  $(dc_cmd_prefix) logs lode"
  exit 1
fi

info "Waiting for Lode to start (first start may take 1-2 minutes)..."
wait_for_port "localhost" "5757" 120 || true

ok "Lode is running at $(hyperlink 'http://localhost:5757')"

# -- Extract admin password from logs ---------------------------------

ADMIN_PASS=""
for _retry in 1 2 3 4 5; do
  ADMIN_PASS=$(dc logs --no-color --tail 200 lode 2>&1 \
    | grep 'Admin password:' \
    | sed 's/.*Admin password: //' | sed 's/".*//' | head -1) || true
  if [ -n "$ADMIN_PASS" ]; then break; fi
  sleep 2
done

# -- Summary -----------------------------------------------------------

echo ""
echo -e "${BOLD}${GREEN}Lode is ready!${NC}"
echo ""

# -- Services table
ROWS=("$(summary_row "Lode" "http://localhost:5757")")
case "$QBIT_MODE" in
  local) ROWS+=("$(summary_row "qBittorrent" "http://localhost:8080")") ;;
  external) ROWS+=("$(summary_row "qBittorrent" "$QBIT_URL")") ;;
esac
case "$PROWLARR_MODE" in
  local) ROWS+=("$(summary_row "Prowlarr" "http://localhost:9900")") ;;
  external) ROWS+=("$(summary_row "Prowlarr" "$PROWLARR_URL")") ;;
esac
case "$MEDIA_MODE" in
  local) ROWS+=("$(summary_row "Jellyfin" "http://localhost:8096")") ;;
  external) ROWS+=("$(summary_row "Jellyfin" "$JELLYFIN_URL")") ;;
  none) ROWS+=("$(summary_row "Jellyfin" "(disabled)")") ;;
esac
if [ "$USE_FLARESOLVERR" = true ]; then
  ROWS+=("$(summary_row "FlareSolverr" "http://localhost:8191")")
fi
ROWS+=("$(summary_row "Database" "$DB_DRIVER_CHOICE")")
if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  ROWS+=("$(summary_row "PostgreSQL" "localhost:5432 / lode")")
fi
if [ "$USE_DOZZLE" = true ]; then
  ROWS+=("$(summary_row "Dozzle" "http://localhost:8082")")
fi
summary_section "$(printf '%s\n' "${ROWS[@]}")"

echo ""

# -- Credentials
echo "Username: $(bold admin)"
if [ -n "$ADMIN_PASS" ]; then
  copy_to_clipboard "$ADMIN_PASS"
  echo "Password: $(bold "$ADMIN_PASS")"
  dim "✓ Copied to clipboard (this replaces your previous clipboard contents)"
else
  dim "Password: check '$(dc_cmd_prefix) logs lode'"
fi
dim "Change this password after first login."

echo ""

# -- Required before first use
echo -e "${BOLD}${YELLOW}Required before first use:${NC}"
if [ "$PROWLARR_MODE" = "local" ]; then
  dim "  Prowlarr has no indexers yet - Lode cannot find torrents until you add them."
  dim "  Open $(hyperlink 'http://localhost:9900') and add at least one indexer (e.g. YTS)."
  if [ "$USE_FLARESOLVERR" = true ]; then
    dim "  For private trackers: Settings > Indexers > Add > FlareSolverr, URL: http://flaresolverr:8191"
  fi
else
  dim "  Your external Prowlarr needs at least one indexer before Lode can find torrents."
fi

exit 0
