#!/bin/bash
set -euo pipefail

# -- StreamHub Auto-Setup Script --------------------------------------
# Sets up the full self-hosted stack: Redis, qBittorrent, Prowlarr,
# Jellyfin, and StreamHub with guided manual configuration.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Nort1346/StreamHub/main/setup.sh | bash
#   ./setup.sh
# ----------------------------------------------------------------------

# -- Constants ---------------------------------------------------------

REPO_RAW="https://raw.githubusercontent.com/Nort1346/StreamHub/main"
SETUP_URL="${REPO_RAW}/setup.sh"
SETUP_SELF="$0"
SETUP_NEW="$(mktemp)"
COMPOSE_TMP="$(mktemp)"

cleanup() {
  rm -f "$SETUP_NEW" "$COMPOSE_TMP"
}
trap cleanup EXIT

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
if [ ! -t 0 ] && [ -z "${STREAMHUB_SETUP_REEXEC:-}" ]; then
  # Note: `[ -r /dev/tty ]` is unreliable here (access() succeeds even
  # without a controlling terminal) - actually opening it is the real test.
  if { : < /dev/tty; } 2>/dev/null && curl -fsSL "$SETUP_URL" -o "$SETUP_NEW" 2>/dev/null; then
    export STREAMHUB_SETUP_REEXEC=1
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
  info() { gum log --level info "$*"; }
  ok()   { gum log --level info "$*"; }
  warn() { gum log --level warn "$*"; }
  err()  { gum log --level error "$*"; }

  summary_section() {
    gum style \
      --border normal --border-foreground 240 \
      --padding "0 2" "$1"
  }

  summary_row() {
    local label="$1" url="$2"
    printf "  %-18s %s\n" "$label" "$url"
  }

  bold() { gum style --bold --foreground 11 "$1"; }
  dim()  { gum style --foreground 14 "$1"; }

  read_input() {
    gum input --placeholder "$1"
  }

  gum_menu() {
    local prompt="$1"; shift
    gum choose --header "$prompt" "$@"
  }
else
  summary_section() { echo -e "${CYAN}$1${NC}"; }

  summary_row() {
    local label="$1" url="$2"
    printf "  %-18s %s\n" "$label" "$url"
  }

  bold() { echo -e "${BOLD}$1${NC}"; }
  dim()  { echo -e "${GRAY}$1${NC}"; }

  read_input() {
    local result=""
    read -rp "$1: " result || result=""
    echo "$result"
  }

  gum_menu() {
    local prompt="$1"; shift
    local options=("$@")
    local i=1
    echo "$prompt"
    for opt in "${options[@]}"; do
      echo "  $i) $opt"
      i=$((i + 1))
    done
    local choice=""
    while true; do
      if ! read -rp "Enter choice [1-${#options[@]}] (default 1): " choice; then
        choice="1"
        break
      fi
      if [ -n "$choice" ] && [[ ! "$choice" =~ ^[0-9]+$ ]]; then
        echo "  Invalid choice. Please enter a number between 1 and ${#options[@]}."
        continue
      fi
      if [ -z "$choice" ]; then
        choice="1"
      fi
      if [ "$choice" -ge 1 ] && [ "$choice" -le "${#options[@]}" ]; then
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
  value=$(grep "^${key}=" .env 2>/dev/null | cut -d= -f2-)
  if [ -z "$value" ] || [ ${#value} -lt "$min" ]; then
    return 1
  fi
  return 0
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

service_running() {
  # `ps -q` is stable across Compose versions (the JSON output format
  # changed in Compose 2.21, so it is not used for state checks).
  [ -n "$(docker compose -f "$COMPOSE_FILE" ps -q "$1" 2>/dev/null)" ]
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
        cp "$SETUP_NEW" "$SETUP_SELF"
        chmod +x "$SETUP_SELF"
        ok "Updated setup.sh. Restarting..."
        exec "$SETUP_SELF" "$@"
      }
    else
      read -rp "Update setup.sh and restart? [y/N] " answer || answer=""
      if [[ "$answer" =~ ^[Yy]$ ]]; then
        cp "$SETUP_SELF" "${SETUP_SELF}.bak"
        cp "$SETUP_NEW" "$SETUP_SELF"
        chmod +x "$SETUP_SELF"
        ok "Updated setup.sh. Restarting..."
        exec "$SETUP_SELF" "$@"
      fi
    fi
    warn "Continuing with current version..."
  fi
fi

# -- Banner ------------------------------------------------------------

header "StreamHub Auto-Setup v1.0"

echo ""
dim "This will set up StreamHub and all required services."
dim "All data will be stored in Docker volumes."
echo ""

if [ "$HAS_GUM" = true ]; then
  gum confirm --default=false "Do you want to continue?" || { echo "Aborted."; exit 0; }
else
  read -rp "Do you want to continue? (y/N) " confirm || confirm=""
  [[ "$confirm" =~ ^[yY] ]] || { echo "Aborted."; exit 0; }
fi

# -- 1. Prerequisites --------------------------------------------------

step "[1/14] Checking prerequisites"

if ! command -v docker &> /dev/null; then
  err "Docker is not installed."
  case "$(uname -s)" in
    Darwin)
      echo "  Install Docker Desktop for macOS:"
      echo "    https://docs.docker.com/desktop/install/mac-install/"
      ;;
    Linux)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        echo "  Install Docker Desktop for Windows (WSL2):"
        echo "    https://docs.docker.com/desktop/wsl/"
      else
        echo "  Install Docker Engine for Linux:"
        echo "    https://docs.docker.com/engine/install/"
      fi
      ;;
    *)
      echo "  Install Docker:"
      echo "    https://docs.docker.com/get-docker/"
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
  echo "      https://docs.docker.com/get-docker/"
  echo "    Linux: Install the Docker Compose plugin"
  echo "      https://docs.docker.com/compose/install/linux/"
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
      echo "  Download from: https://curl.se/download.html"
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

step "[2/14] Setting up .env file"

if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    info "Downloading .env.example from GitHub..."
    curl -fsSL "${REPO_RAW}/.env.example" -o .env.example || {
      err "Failed to download .env.example from GitHub."
      echo "  Check your internet connection and try again."
      exit 1
    }
  fi
  cp .env.example .env
  ok "Created .env from .env.example"
else
  warn ".env exists -- keeping existing config"
fi

mkdir -p media/Movies media/Series
ok "Created media directories (media/Movies, media/Series)"

# -- 3. Generate secrets -----------------------------------------------

step "[3/14] Generating secrets"

SESSION_PASSWORD=$(generate_password 32)
TRACKER_KEY=$(generate_hex 32)

update_env "NUXT_SESSION_PASSWORD" "$SESSION_PASSWORD"
update_env "NUXT_TRACKER_ENCRYPTION_KEY" "$TRACKER_KEY"

if ! validate_env_min_length "NUXT_SESSION_PASSWORD" 32; then
  warn "Session password too short, regenerating..."
  SESSION_PASSWORD=$(generate_password 32)
  update_env "NUXT_SESSION_PASSWORD" "$SESSION_PASSWORD"
fi

if ! validate_env_min_length "NUXT_TRACKER_ENCRYPTION_KEY" 32; then
  warn "Tracker key too short, regenerating..."
  TRACKER_KEY=$(generate_hex 32)
  update_env "NUXT_TRACKER_ENCRYPTION_KEY" "$TRACKER_KEY"
fi

ok "Session password generated"
ok "Tracker encryption key generated"

# -- 4. StreamHub version choice --------------------------------------

step "[4/14] StreamHub version"

STREAMHUB_TAG="latest"

if [ "$HAS_GUM" != true ]; then
  echo ""
  echo "Which StreamHub image do you want to use?"
  echo "  latest  - Stable release (recommended)"
  echo "  nightly - Latest dev build from main (may be unstable)"
  echo ""
fi

STREAMHUB_TAG_CHOICE=$(gum_menu "Select version:" "latest (recommended)" "nightly")

if [[ "$STREAMHUB_TAG_CHOICE" == *"nightly"* ]]; then
  STREAMHUB_TAG="nightly"
else
  STREAMHUB_TAG="latest"
fi

ok "StreamHub version: $STREAMHUB_TAG"

# -- 5. Database driver choice ----------------------------------------

step "[5/14] Database driver"

DB_DRIVER_CHOICE="sqlite"

existing_db_driver=$(grep "^DB_DRIVER=" .env 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')

if [ -n "$existing_db_driver" ] && [ "$existing_db_driver" != "sqlite" ]; then
  if [ "$HAS_GUM" = true ]; then
    gum style --foreground 11 --bold "Existing database driver: $existing_db_driver"
  else
    echo -e "${YELLOW}${BOLD}  Existing database driver: ${existing_db_driver}${NC}"
  fi
fi

if [ "$HAS_GUM" != true ]; then
  echo ""
  echo "Choose your database driver:"
  echo "  SQLite    - Zero config, file-based, recommended for most users"
  echo "  PostgreSQL - Full-featured, requires more resources"
  echo ""
fi

DB_DRIVER_CHOICE=$(gum_menu "Select database driver:" "SQLite (recommended)" "PostgreSQL")

if [[ "$DB_DRIVER_CHOICE" == *"PostgreSQL"* ]]; then
  DB_DRIVER_CHOICE="postgres"
else
  DB_DRIVER_CHOICE="sqlite"
fi

ok "Database driver: $DB_DRIVER_CHOICE"

if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  COMPOSE_FILE="docker-compose.postgres.yml"
else
  COMPOSE_FILE="docker-compose.sqlite.yml"
fi

if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  POSTGRES_PASSWORD=$(generate_password 32)
  update_env "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
  ok "PostgreSQL password generated"
fi

# -- 5. Download docker-compose if needed -------------------------------

step "[6/14] Downloading $COMPOSE_FILE"

if [ -f "$COMPOSE_FILE" ]; then
  if [ "$HAS_GUM" = true ]; then
    gum confirm --default=false "$COMPOSE_FILE already exists. Download latest version from GitHub?" && {
      info "Downloading $COMPOSE_FILE..."
      if curl -fsSL "${REPO_RAW}/${COMPOSE_FILE}" -o "$COMPOSE_TMP" 2>/dev/null; then
        if ! diff -q "$COMPOSE_FILE" "$COMPOSE_TMP" &>/dev/null; then
          warn "$COMPOSE_FILE has changed"
          diff --color=auto "$COMPOSE_FILE" "$COMPOSE_TMP" || true
          echo ""
          gum confirm --default=false "Replace $COMPOSE_FILE with latest version?" && {
            cp "$COMPOSE_FILE" "${COMPOSE_FILE}.bak"
            cp "$COMPOSE_TMP" "$COMPOSE_FILE"
            ok "$COMPOSE_FILE updated (backup saved as ${COMPOSE_FILE}.bak)"
          } || {
            warn "Keeping existing $COMPOSE_FILE"
          }
        else
          ok "$COMPOSE_FILE is already up to date"
        fi
      else
        err "Failed to download $COMPOSE_FILE"
      fi
    }
  else
    read -rp "$COMPOSE_FILE already exists. Download latest version? [y/N] " answer || answer=""
    if [[ "$answer" =~ ^[Yy]$ ]]; then
      info "Downloading $COMPOSE_FILE..."
      if curl -fsSL "${REPO_RAW}/${COMPOSE_FILE}" -o "$COMPOSE_TMP" 2>/dev/null; then
        if ! diff -q "$COMPOSE_FILE" "$COMPOSE_TMP" &>/dev/null; then
          warn "$COMPOSE_FILE has changed"
          diff "$COMPOSE_FILE" "$COMPOSE_TMP" || true
          echo ""
          read -rp "Replace $COMPOSE_FILE with latest version? [y/N] " replace || replace=""
          if [[ "$replace" =~ ^[Yy]$ ]]; then
            cp "$COMPOSE_FILE" "${COMPOSE_FILE}.bak"
            cp "$COMPOSE_TMP" "$COMPOSE_FILE"
            ok "$COMPOSE_FILE updated (backup saved as ${COMPOSE_FILE}.bak)"
          else
            warn "Keeping existing $COMPOSE_FILE"
          fi
        else
          ok "$COMPOSE_FILE is already up to date"
        fi
      else
        err "Failed to download $COMPOSE_FILE"
      fi
    fi
  fi
  ok "Using $COMPOSE_FILE"
else
  info "Downloading $COMPOSE_FILE..."
  curl -fsSL "${REPO_RAW}/${COMPOSE_FILE}" -o "$COMPOSE_FILE" || {
    err "Failed to download $COMPOSE_FILE from GitHub."
    echo "  Check your internet connection and try again."
    exit 1
  }
  ok "$COMPOSE_FILE downloaded"
fi

if [ "$STREAMHUB_TAG" = "nightly" ]; then
  if grep -q 'ghcr.io/nort1346/streamhub:latest' "$COMPOSE_FILE"; then
    sed -i.bak "s|ghcr.io/nort1346/streamhub:latest|ghcr.io/nort1346/streamhub:nightly|" "$COMPOSE_FILE" && rm -f "${COMPOSE_FILE}.bak"
    ok "Configured for nightly builds"
  else
    warn "$COMPOSE_FILE does not reference streamhub:latest - check the image tag manually"
  fi
fi

# -- 6. Start infrastructure services ---------------------------------

step "[7/14] Starting infrastructure services"

INFRA_SERVICES=(redis qbittorrent prowlarr flaresolverr jellyfin dozzle)
if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  INFRA_SERVICES+=(postgres)
fi

info "Pulling images..."
docker compose -f "$COMPOSE_FILE" pull "${INFRA_SERVICES[@]}" || true

docker compose -f "$COMPOSE_FILE" up -d --remove-orphans "${INFRA_SERVICES[@]}"

failed_services=""
for svc in "${INFRA_SERVICES[@]}"; do
  if ! service_running "$svc"; then
    failed_services="$failed_services $svc"
    last_log=$(docker compose -f "$COMPOSE_FILE" logs "$svc" --tail 3 2>&1 | tail -1)
    warn "$svc failed to start: $last_log"
  fi
done

if [[ " $failed_services " =~ " redis " ]]; then
  err "Redis failed to start. Cannot continue."
  echo "  Check logs: docker compose -f $COMPOSE_FILE logs redis"
  exit 1
fi
if [[ " $failed_services " =~ " qbittorrent " ]]; then
  err "qBittorrent failed to start. Cannot continue."
  echo "  Check logs: docker compose -f $COMPOSE_FILE logs qbittorrent"
  exit 1
fi
if [[ " $failed_services " =~ " postgres " ]]; then
  err "PostgreSQL failed to start. Cannot continue."
  echo "  Check logs: docker compose -f $COMPOSE_FILE logs postgres"
  exit 1
fi

info "Waiting for Redis..."
wait_for_port "localhost" "6379" 30 || true

info "Waiting for qBittorrent..."
wait_for_port "localhost" "8080" 60 || true

sleep 3

QBIT_TEMP_PASS=$(docker compose -f "$COMPOSE_FILE" logs qbittorrent 2>&1 | sed -n 's/.*A temporary password is provided for this session: *//p' | tail -1) || true

if [[ " $failed_services " =~ " prowlarr " ]]; then
  warn "Prowlarr not running -- you can configure it later (step 10)"
else
  info "Waiting for Prowlarr..."
  wait_for_port "localhost" "9900" 60 || true
fi

if [[ " $failed_services " =~ " jellyfin " ]]; then
  warn "Jellyfin not running -- you can configure it later (step 8)"
else
  info "Waiting for Jellyfin..."
  wait_for_port "localhost" "8096" 90 || true
fi

ok "All infrastructure services are running"

if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  info "Waiting for PostgreSQL..."
  wait_for_port "localhost" "5432" 30 || true
fi

info "Waiting 10s for services to fully initialize..."
sleep 10

# -- 5. Jellyfin API Key -----------------------------------------------

step "[8/14] Jellyfin API Key"

echo ""
echo "Follow these steps to get your Jellyfin API key:"
dim "  1. Open http://localhost:8096 in your browser"
dim "  2. Complete the setup wizard (create your admin account)"
dim "  3. Go to Dashboard (gear icon) > API Keys"
dim '  4. Click the + button, name it StreamHub, click OK'
dim "  5. Copy the generated API key"
echo ""

jellyfinKey=$(read_input "Paste your Jellyfin API key (Enter to skip)")

if [ -n "$jellyfinKey" ]; then
  update_env "NUXT_JELLYFIN_API_KEY" "$jellyfinKey"
  ok "Jellyfin API key saved"
else
  warn "Skipping Jellyfin API key -- set it later in .env"
fi

# -- 6. qBittorrent WebUI + API Key -----------------------------------

step "[9/14] qBittorrent WebUI + API Key"

if [ -n "${QBIT_TEMP_PASS:-}" ]; then
  echo ""
  echo -e "${BOLD}${YELLOW}qBittorrent temporary password: ${QBIT_TEMP_PASS}${NC}"
  dim "Copy this - you will need it below"
  echo ""
else
  warn "Could not extract qBittorrent temp password - check: docker compose -f $COMPOSE_FILE logs qbittorrent"
fi

echo "Follow these steps to configure qBittorrent:"
dim "  1. Open http://localhost:8080 in your browser"
dim "  2. Login with:"
dim "       Username: admin"
dim "       Password: [temporary password shown above]"
dim "  3. Go to Tools > Options > Web UI"
dim "  4. Change the password to something you remember"
dim "  5. Save changes"
dim "  6. Go to Tools > Options > Web UI > API Key section"
dim "  7. Copy the API Key"
echo ""

qbitKey=$(read_input "Paste your qBittorrent API Key (Enter to skip)")

if [ -n "$qbitKey" ]; then
  update_env "NUXT_QBITTORRENT_API_KEY" "$qbitKey"
  ok "qBittorrent API key saved"
else
  warn "Skipping qBittorrent API key -- set it later in .env"
fi

# -- 7. Prowlarr API Key -----------------------------------------------

step "[10/14] Prowlarr API Key"

echo ""
echo "Follow these steps to get your Prowlarr API key:"
dim "  1. Open http://localhost:9900 in your browser"
dim "  2. Go to Settings > General"
dim "  3. Find the API Key field"
dim "  4. Copy the API key"
echo ""
echo -e "${BOLD}${YELLOW}IMPORTANT: Prowlarr needs indexers before StreamHub can find anything.${NC}"
dim "  1. Add at least one indexer (e.g. YTS): Settings > Indexers > Add"
dim "  2. For private trackers: Settings > Indexers > Add > FlareSolverr"
dim "     Set URL: http://flaresolverr:8191"
echo ""

prowlarrKey=$(read_input "Paste your Prowlarr API key (Enter to skip)")

if [ -n "$prowlarrKey" ]; then
  update_env "NUXT_PROWLARR_API_KEY" "$prowlarrKey"
  ok "Prowlarr API key saved"
else
  warn "Skipping Prowlarr API key -- set it later in .env"
fi

# -- 8. TMDB API Key ---------------------------------------------------

step "[11/14] TMDB API Key"

echo ""
echo "Follow these steps to get your TMDB API key:"
dim "  1. Go to https://www.themoviedb.org/settings/api"
dim "  2. Create a free account (or log in)"
dim '  3. Click the link to generate an API key'
dim "  4. Fill in the form:"
dim "       Application Name:  StreamHub"
dim "       Application URL:   http://localhost:5757"
dim "  5. Copy your API Key (v3 auth)"
echo ""
dim "This is required for movie/TV metadata."
echo ""

tmdbKey=$(read_input "Paste your TMDB API key (Enter to skip)")

if [ -n "$tmdbKey" ]; then
  update_env "NUXT_TMDB_API_KEY" "$tmdbKey"
  ok "TMDB API key saved"
else
  warn "Skipping TMDB API key -- set it later in .env"
fi

# -- 9. Discord Webhook (optional) ------------------------------------

step "[12/14] Discord Webhook (optional)"

echo ""
dim "Get notified when downloads complete."
echo "To set up a Discord webhook:"
dim "  1. Open your Discord server"
dim "  2. Go to Server Settings > Integrations > Webhooks"
dim '  3. Click New Webhook'
dim "  4. Name it, choose a channel, click Copy Webhook URL"
echo ""

discordKey=$(read_input "Paste your Discord Webhook URL (Enter to skip)")

if [ -n "$discordKey" ]; then
  update_env "NUXT_DISCORD_WEBHOOK_URL" "$discordKey"
  ok "Discord webhook URL saved"
else
  warn "Skipping Discord webhook -- set it later in .env"
fi

# -- 10. Pull StreamHub ------------------------------------------------

step "[13/14] Pulling StreamHub"

info "Pulling StreamHub image..."
docker compose -f "$COMPOSE_FILE" pull streamhub || true

if ! docker image inspect "ghcr.io/nort1346/streamhub:${STREAMHUB_TAG}" &> /dev/null; then
  err "Failed to pull StreamHub image. Check your network and try again."
  err "You can also try manually: docker compose -f $COMPOSE_FILE pull streamhub"
  exit 1
fi

ok "StreamHub image pulled"

# -- 10. Start StreamHub -----------------------------------------------

step "[14/14] Starting StreamHub"

update_env "NUXT_JELLYFIN_URL" "http://jellyfin:8096"
update_env "NUXT_REDIS_URL" "redis://redis:6379"
update_env "NUXT_PROWLARR_URL" "http://prowlarr:9696"
update_env "DB_DRIVER" "$DB_DRIVER_CHOICE"

if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  update_env "DATABASE_URL" "postgresql://streamhub:${POSTGRES_PASSWORD}@postgres:5432/streamhub"
fi

info "Starting StreamHub..."
docker compose -f "$COMPOSE_FILE" up -d streamhub || true

if ! service_running streamhub; then
  err "StreamHub container failed to start. Check logs:"
  err "  docker compose -f $COMPOSE_FILE logs streamhub"
  exit 1
fi

info "Waiting for StreamHub to start (first start may take 1-2 minutes)..."
wait_for_port "localhost" "5757" 120 || true

ok "StreamHub is running at http://localhost:5757"

# -- Extract admin password from logs ---------------------------------

ADMIN_PASS=""
for _retry in 1 2 3 4 5; do
  ADMIN_PASS=$(docker compose -f "$COMPOSE_FILE" logs --no-color --tail 200 streamhub 2>&1 \
    | grep 'Admin password:' \
    | sed 's/.*Admin password: //' | sed 's/".*//' | head -1) || true
  if [ -n "$ADMIN_PASS" ]; then break; fi
  sleep 2
done

# -- Summary -----------------------------------------------------------

HAS_DOZZLE=false
if service_running dozzle; then
  HAS_DOZZLE=true
fi

echo ""
echo -e "${BOLD}${GREEN}StreamHub is ready!${NC}"
echo ""

# -- Services table
SERVICES_TABLE=$(cat <<TABLE
$(summary_row "StreamHub" "http://localhost:5757")
$(summary_row "qBittorrent" "http://localhost:8080")
$(summary_row "Prowlarr" "http://localhost:9900")
$(summary_row "Jellyfin" "http://localhost:8096")
$(summary_row "FlareSolverr" "http://localhost:8191")
$(summary_row "Database" "$DB_DRIVER_CHOICE")
TABLE
)

if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  SERVICES_TABLE="$SERVICES_TABLE
$(summary_row "PostgreSQL" "localhost:5432 / streamhub")"
fi

if [ "$HAS_DOZZLE" = true ]; then
  SERVICES_TABLE="$SERVICES_TABLE
$(summary_row "Dozzle" "http://localhost:8082")"
fi

summary_section "$SERVICES_TABLE"

echo ""

# -- Credentials
echo "Username: $(bold admin)"
if [ -n "$ADMIN_PASS" ]; then
  echo "Password: $(bold "$ADMIN_PASS")"
else
  dim "Password: check 'docker compose -f $COMPOSE_FILE logs streamhub'"
fi
dim "Change this password after first login."

echo ""

# -- Required before first use
echo -e "${BOLD}${YELLOW}Required before first use:${NC}"
dim "  Prowlarr has no indexers yet - StreamHub cannot find torrents until you add them."
dim "  Open http://localhost:9900 and add at least one indexer (e.g. YTS)."
dim "  For private trackers: Settings > Indexers > Add > FlareSolverr, URL: http://flaresolverr:8191"
