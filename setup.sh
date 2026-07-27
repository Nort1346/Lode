#!/bin/bash
set -euo pipefail

# -- StreamHub Auto-Setup Script --------------------------------------
# Sets up the full self-hosted stack: Redis, qBittorrent, Prowlarr,
# Jellyfin, and StreamHub with guided manual configuration.
#
# Usage: ./setup.sh
# ----------------------------------------------------------------------

# -- gum bootstrap -----------------------------------------------------

HAS_GUM=false

install_gum() {
  if command -v gum &> /dev/null; then
    HAS_GUM=true
    return 0
  fi

  if ! command -v curl &> /dev/null; then
    return 0
  fi

  echo "Installing gum (charm) for beautiful output..."

  if command -v brew &> /dev/null; then
    brew install gum
  elif command -v apt-get &> /dev/null; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://repo.charm.sh/apt/gpg.key | gpg --dearmor -o /etc/apt/keyrings/charm.gpg 2>/dev/null
    echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" \
      > /etc/apt/sources.list.d/charm.list
    apt-get update -qq && apt-get install -y -qq gum > /dev/null 2>&1
  elif command -v yum &> /dev/null; then
    cat > /etc/yum.repos.d/charm.repo << 'EOF'
[charm]
name=Charm
baseurl=https://repo.charm.sh/yum/
enabled=1
gpgcheck=1
gpgkey=https://repo.charm.sh/yum/gpg.key
EOF
    yum install -y gum > /dev/null 2>&1
  elif command -v dnf &> /dev/null; then
    cat > /etc/yum.repos.d/charm.repo << 'EOF'
[charm]
name=Charm
baseurl=https://repo.charm.sh/yum/
enabled=1
gpgcheck=1
gpgkey=https://repo.charm.sh/yum/gpg.key
EOF
    dnf install -y gum > /dev/null 2>&1
  elif command -v apk &> /dev/null; then
    apk add --no-cache gum 2>/dev/null
  else
    local os arch
    os=$(uname -s)
    arch=$(uname -m)
    case "$arch" in
      x86_64)  arch="x86_64" ;;
      arm64|aarch64) arch="arm64" ;;
      *)       echo "Unsupported architecture: $arch"; return 1 ;;
    esac
    local tmp
    tmp=$(mktemp -d)
    curl -fsSL "https://github.com/charmbracelet/gum/releases/latest/download/gum_*_${os}_${arch}.tar.gz" \
      | tar xz -C "$tmp" gum 2>/dev/null
    mkdir -p /usr/local/bin
    mv "$tmp/gum" /usr/local/bin/gum 2>/dev/null
    rm -rf "$tmp"
  fi

  if command -v gum &> /dev/null; then
    HAS_GUM=true
  fi
}

install_gum

# -- Output helpers ----------------------------------------------------

if [ "$HAS_GUM" = true ]; then
  info()  { gum log --level info "$*"; }
  ok()    { gum log --level info "$*"; }
  warn()  { gum log --level warn "$*"; }
  err()   { gum log --level error "$*"; }

  header() {
    gum style \
      --foreground "#FAFAFA" --background "#6C91BF" \
      --padding "0 2" --bold "$1"
  }

  step() {
    echo ""
    gum style \
      --foreground "#E0E0E0" --background "#333333" \
      --padding "0 1" --bold "$1"
  }

  spinner() {
    local title="$1"; shift
    gum spin --spinner dot --title "$title" -- "$@"
  }

  summary_box() {
    gum style \
      --border double --border-foreground 2 \
      --align center \
      --padding "1 2" "$1"
  }

  summary_section() {
    gum style \
      --border normal --border-foreground 240 \
      --padding "0 2" "$1"
  }

  summary_row() {
    local label="$1" url="$2"
    printf "  %-18s %s\n" "$label" "$url"
  }

  read_input() {
    gum input --placeholder "$1"
  }

  gum_menu() {
    local prompt="$1"; shift
    gum choose --header "$prompt" "$@"
  }
else
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  NC='\033[0m'

  info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
  ok()    { echo -e "${GREEN}[ OK ]${NC}  $*"; }
  warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
  err()   { echo -e "${RED}[ERR ]${NC}  $*"; }

  header() { echo -e "\n${BOLD}${CYAN}=== $1 ===${NC}\n"; }
  step()   { echo -e "\n${BOLD}${CYAN}--- $1 ---${NC}"; }

  spinner() {
    local title="$1"; shift
    info "$title"
    "$@"
  }

  summary_box() { echo -e "\n${GREEN}$1${NC}\n"; }

  read_input() {
    read -rp "$1: " result
    echo "$result"
  }

  gum_menu() {
    local prompt="$1"; shift
    local options=("$@")
    echo "$prompt"
    local i=1
    for opt in "${options[@]}"; do
      echo "  $i) $opt"
      i=$((i + 1))
    done
    local choice
    while true; do
      read -rp "Enter choice [1-${#options[@]}]: " choice
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
  openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c "$1"
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

# -- Self-update check --------------------------------------------------

REPO_RAW="https://raw.githubusercontent.com/Nort1346/StreamHub/main"
SETUP_URL="${REPO_RAW}/setup.sh"
SETUP_NEW=$(mktemp)
SETUP_SELF="$0"
COMPOSE_TMP=$(mktemp)

cleanup() {
  rm -f "$SETUP_NEW" "$COMPOSE_TMP"
}
trap cleanup EXIT

if curl -fsSL "$SETUP_URL" -o "$SETUP_NEW" 2>/dev/null; then
  if ! diff -q "$SETUP_SELF" "$SETUP_NEW" &>/dev/null; then
    echo ""
    if [ "$HAS_GUM" = true ]; then
      gum style --foreground "#FFD700" --border normal --border-foreground "#FFD700" \
        --padding "0 1" --bold "A newer version of setup.sh is available."
    else
      echo -e "  A newer version of setup.sh is available."
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
      read -rp "Update setup.sh and restart? [y/N] " answer
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
echo "This will set up StreamHub and all required services."
echo "All data will be stored in Docker volumes."
echo ""

if [ "$HAS_GUM" = true ]; then
  gum confirm --default=false "Do you want to continue?" || { echo "Aborted."; exit 0; }
else
  read -rp "Do you want to continue? (y/N) " confirm
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

if ! docker info &> /dev/null; then
  err "Docker daemon is not running. Start Docker Desktop and try again."
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

echo ""
echo "Which StreamHub image do you want to use?"
echo "  latest  - Stable release (recommended)"
echo "  nightly - Latest dev build from main (may be unstable)"
echo ""

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
    gum style --foreground "#FFD700" --border normal --border-foreground "#FFD700" \
      --padding "0 1" --bold "Existing database driver: $existing_db_driver"
  else
    echo -e "  Existing database driver: $existing_db_driver"
  fi
fi

echo ""
echo "Choose your database driver:"
echo "  SQLite    - Zero config, file-based, recommended for most users"
echo "  PostgreSQL - Full-featured, requires more resources"
echo ""

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
    read -rp "$COMPOSE_FILE already exists. Download latest version? [y/N] " answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
      info "Downloading $COMPOSE_FILE..."
      if curl -fsSL "${REPO_RAW}/${COMPOSE_FILE}" -o "$COMPOSE_TMP" 2>/dev/null; then
        if ! diff -q "$COMPOSE_FILE" "$COMPOSE_TMP" &>/dev/null; then
          warn "$COMPOSE_FILE has changed"
          diff "$COMPOSE_FILE" "$COMPOSE_TMP" || true
          echo ""
          read -rp "Replace $COMPOSE_FILE with latest version? [y/N] " replace
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
  sed -i.bak "s|ghcr.io/nort1346/streamhub:latest|ghcr.io/nort1346/streamhub:nightly|" "$COMPOSE_FILE" && rm -f "${COMPOSE_FILE}.bak"
  ok "Configured for nightly builds"
fi

# -- 6. Start infrastructure services ---------------------------------

step "[7/14] Starting infrastructure services"

INFRA_SERVICES="redis qbittorrent prowlarr flaresolverr jellyfin dozzle"
if [ "$DB_DRIVER_CHOICE" = "postgres" ]; then
  INFRA_SERVICES="redis qbittorrent prowlarr flaresolverr jellyfin dozzle postgres"
fi

if [ "$HAS_GUM" = true ]; then
  gum spin --spinner dot --title "Pulling images..." -- docker compose -f "$COMPOSE_FILE" pull $INFRA_SERVICES || true
else
  info "Pulling images..."
  docker compose -f "$COMPOSE_FILE" pull $INFRA_SERVICES || true
fi

docker compose -f "$COMPOSE_FILE" up -d --remove-orphans $INFRA_SERVICES

failed_services=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  svc=$(echo "$line" | grep -o '"Service":"[^"]*"' | cut -d'"' -f4)
  state=$(echo "$line" | grep -o '"State":"[^"]*"' | cut -d'"' -f4)
  if [ "$state" != "running" ] && [ -n "$svc" ]; then
    failed_services="$failed_services $svc"
    last_log=$(docker compose -f "$COMPOSE_FILE" logs "$svc" --tail 3 2>&1 | tail -1)
    warn "$svc failed to start: $last_log"
  fi
done < <(docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null)

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

QBIT_TEMP_PASS=$(docker logs streamhub-qbittorrent 2>&1 | sed -n 's/.*A temporary password is provided for this session: *//p' | tail -1) || true

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
echo "  1. Open http://localhost:8096 in your browser"
echo "  2. Complete the setup wizard (create your admin account)"
echo "  3. Go to Dashboard (gear icon) > API Keys"
echo '  4. Click "+", name it "StreamHub", click OK'
echo "  5. Copy the generated API key"
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
  if [ "$HAS_GUM" = true ]; then
    gum style --foreground "#FFD700" --border normal --border-foreground "#FFD700" \
      --padding "0 1" --bold "qBittorrent temporary password: ${QBIT_TEMP_PASS}" \
      "Copy this -- you will need it below"
  else
    echo -e "  +--------------------------------------------+"
    echo -e "  | ${YELLOW}qBittorrent temporary password: ${QBIT_TEMP_PASS}${NC}"
    echo -e "  | ${YELLOW}Copy this -- you will need it below        ${NC}"
    echo -e "  +--------------------------------------------+"
  fi
  echo ""
else
  warn "Could not extract qBittorrent temp password -- check: docker logs streamhub-qbittorrent"
fi

echo "Follow these steps to configure qBittorrent:"
echo "  1. Open http://localhost:8080 in your browser"
echo "  2. Login with:"
echo "       Username: admin"
echo "       Password: [temporary password shown above]"
echo "  3. Go to Tools > Options > Web UI"
echo "  4. Change the password to something you remember"
echo "  5. Save changes"
echo "  6. Go to Tools > Options > Web UI > API Key section"
echo "  7. Copy the API Key"
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
echo "  1. Open http://localhost:9900 in your browser"
echo "  2. Go to Settings > General"
echo "  3. Find the API Key field"
echo "  4. Copy the API key"
echo ""
echo "Tip: You can also add indexers here later."
echo ""
echo "For private trackers: go to Settings > Indexers > Add > FlareSolverr"
echo "  Set URL: http://flaresolverr:8191"
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
echo "  1. Go to https://www.themoviedb.org/settings/api"
echo "  2. Create a free account (or log in)"
echo '  3. Click "Click here to generate an API key"'
echo "  4. Fill in the form:"
echo "       Application Name:  StreamHub"
echo "       Application URL:   http://localhost:5757"
echo "  5. Copy your API Key (v3 auth)"
echo ""
echo "This is required for movie/TV metadata."
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
echo "Get notified when downloads complete."
echo "To set up a Discord webhook:"
echo "  1. Open your Discord server"
echo "  2. Go to Server Settings > Integrations > Webhooks"
echo '  3. Click "New Webhook"'
echo "  4. Name it, choose a channel, click Copy Webhook URL"
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

if [ "$HAS_GUM" = true ]; then
  gum spin --spinner dot --title "Pulling StreamHub image..." -- docker compose -f "$COMPOSE_FILE" pull streamhub || true
else
  info "Pulling StreamHub image..."
  docker compose -f "$COMPOSE_FILE" pull streamhub || true
fi

if ! docker image inspect ghcr.io/nort1346/streamhub:$STREAMHUB_TAG &> /dev/null; then
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

if [ "$HAS_GUM" = true ]; then
  gum spin --spinner dot --title "Starting StreamHub..." -- docker compose -f "$COMPOSE_FILE" up -d streamhub || true
else
  info "Starting StreamHub..."
  docker compose -f "$COMPOSE_FILE" up -d streamhub || true
fi

if ! docker compose -f "$COMPOSE_FILE" ps streamhub 2>/dev/null | grep -q "Up"; then
  err "StreamHub container failed to start. Check logs:"
  err "  docker compose -f $COMPOSE_FILE logs streamhub"
  exit 1
fi

info "Waiting for StreamHub to start (first start may take 1-2 minutes)..."
wait_for_port "localhost" "5757" 120 || true

ok "StreamHub is running at http://localhost:5757"

# -- Extract admin password from logs ---------------------------------

ADMIN_PASS=$(docker compose -f "$COMPOSE_FILE" logs streamhub 2>&1 \
  | grep 'Admin password:' \
  | sed 's/.*Admin password: //' | sed 's/".*//' | head -1) || true

# -- Summary -----------------------------------------------------------

HAS_DOZZLE=false
if docker compose -f "$COMPOSE_FILE" ps dozzle 2>/dev/null | grep -q "Up"; then
  HAS_DOZZLE=true
fi

# -- Header
summary_box "$(gum style --bold --foreground 2 'StreamHub is ready!')"

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
$(summary_row "PostgreSQL" "localhost:5432 / streamhub)"
fi

if [ "$HAS_DOZZLE" = true ]; then
  SERVICES_TABLE="$SERVICES_TABLE
$(summary_row "Dozzle" "http://localhost:8082")"
fi

summary_section "$SERVICES_TABLE"

echo ""

# -- Credentials
CREDS=$(gum style --bold --foreground 11 'admin')
summary_section "  Username: $CREDS"
if [ -n "$ADMIN_PASS" ]; then
  summary_section "  Password: $(gum style --bold --foreground 11 "$ADMIN_PASS")"
else
  summary_section "  Password: check 'docker compose -f $COMPOSE_FILE logs streamhub'"
fi
summary_section "  Change this password after first login!"

echo ""

# -- Next steps
STEPS=$(cat <<STEPS
$(gum style --foreground 14 '  Next steps:')
$(gum style --foreground 14 '   1. Login with admin -> Admin > Users to change the password')
$(gum style --foreground 14 '   2. Jellyfin libraries (Movies/Series) are created automatically on startup')
$(gum style --foreground 14 '   3. Prowlarr -> Add indexers + FlareSolverr proxy')
STEPS
)

summary_section "$STEPS"
