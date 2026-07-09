#!/bin/bash
set -euo pipefail

# -- StreamHub Auto-Setup Script --------------------------------------
# Sets up the full self-hosted stack: Redis, qBittorrent, qui, Prowlarr,
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
      --padding "1 2" "$1"
  }

  read_input() {
    gum input --placeholder "$1"
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
fi

# -- Helpers -----------------------------------------------------------

generate_password() {
  openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c "$1"
}

generate_hex() {
  openssl rand -hex "$1"
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

# -- Banner ------------------------------------------------------------

header "StreamHub Auto-Setup v1.0"

echo ""
echo "This will start the following services:"
echo "  Redis, qBittorrent, qui, Prowlarr, Jellyfin"
echo ""
echo "Data will be stored in Docker volumes."
echo "Default passwords: admin / admin"
echo ""

if [ "$HAS_GUM" = true ]; then
  gum confirm --default=false "Do you want to continue?" || { echo "Aborted."; exit 0; }
else
  read -rp "Do you want to continue? (y/N) " confirm
  [[ "$confirm" =~ ^[yY] ]] || { echo "Aborted."; exit 0; }
fi

# -- 1. Prerequisites --------------------------------------------------

step "[1/11] Checking prerequisites"

if ! command -v docker &> /dev/null; then
  err "Docker is not installed. Install: https://docs.docker.com/get-docker/"
  exit 1
fi
ok "Docker $(docker --version | sed -n 's/.*version \([^ ,]*\).*/\1/p')"

if ! docker compose version &> /dev/null 2>&1; then
  err "Docker Compose plugin is not installed."
  exit 1
fi
ok "Docker Compose $(docker compose version --short 2>/dev/null || echo 'available')"

if ! command -v curl &> /dev/null; then
  err "curl is required for API calls."
  exit 1
fi
ok "curl available"

# -- 2. Create .env ----------------------------------------------------

step "[2/11] Setting up .env file"

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    ok "Created .env from .env.example"
  else
    err ".env.example not found."
    exit 1
  fi
else
  warn ".env exists -- keeping existing config"
fi

mkdir -p media
ok "Created media directory"

# -- 3. Generate secrets -----------------------------------------------

step "[3/11] Generating secrets"

SESSION_PASSWORD=$(generate_password 32)
TRACKER_KEY=$(generate_hex 32)

update_env "NUXT_SESSION_PASSWORD" "$SESSION_PASSWORD"
update_env "NUXT_TRACKER_ENCRYPTION_KEY" "$TRACKER_KEY"
ok "Session password generated"
ok "Tracker encryption key generated"

# -- 4. Start infrastructure services ---------------------------------

step "[4/11] Starting infrastructure services"

if [ "$HAS_GUM" = true ]; then
  gum spin --spinner dot --title "Pulling images..." -- docker compose pull redis qbittorrent prowlarr qui jellyfin || true
else
  info "Pulling images..."
  docker compose pull redis qbittorrent prowlarr qui jellyfin || true
fi

docker compose up -d --remove-orphans redis qbittorrent prowlarr qui jellyfin

info "Waiting for Redis..."
wait_for_port "localhost" "6379" 30 || true

info "Waiting for qBittorrent..."
wait_for_port "localhost" "8080" 60 || true

sleep 3

QBIT_TEMP_PASS=$(docker logs streamhub-qbittorrent 2>&1 | sed -n 's/.*A temporary password is provided for this session: *//p' | tail -1) || true

info "Waiting for Prowlarr..."
wait_for_port "localhost" "9696" 60 || true

info "Waiting for qui..."
wait_for_port "localhost" "7476" 60 || true

info "Waiting for Jellyfin..."
wait_for_port "localhost" "8096" 90 || true

ok "All infrastructure services are running"

info "Waiting 10s for services to fully initialize..."
sleep 10

# -- 5. Jellyfin API Key -----------------------------------------------

step "[5/11] Jellyfin API Key"

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

# -- 6. qui setup + qBittorrent connection ----------------------------

step "[6/11] qui setup + qBittorrent connection"

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

echo "FIRST -- configure qBittorrent:"
echo "  1. Open http://localhost:8080 in your browser"
echo "  2. Login with:"
echo "       Username: admin"
echo "       Password: [temporary password shown above]"
echo "  3. Go to Settings > Web UI"
echo "  4. Change the password to something you remember"
echo "  5. Save changes"
echo ""
echo "THEN -- configure qui:"
echo "  6. Open http://localhost:7476 in your browser"
echo "  7. Create your admin account"
echo "  8. Go to Settings > Clients"
echo "  9. Click Add New, fill in:"
echo "       Name:    qBittorrent"
echo "       Host:    qbittorrent"
echo "       Port:    8080"
echo "       User:    admin"
echo "       Pass:    [the password you just set]"
echo "  10. Test the connection, then save"
echo "  11. Go to Settings > API Keys"
echo '  12. Click "Create", name it "streamhub"'
echo "  13. Copy the generated key"
echo ""
echo "LAST STEP: Go to Settings > Clients, click your qBittorrent"
echo "connection, and copy the full Proxy URL (looks like:"
echo "  http://qui:7476/proxy/YOUR_KEY_HERE )"
echo ""

quiKey=$(read_input "Paste your full qui proxy URL (Enter to skip)")

if [ -n "$quiKey" ]; then
  update_env "NUXT_QUI_PROXY_URL" "$quiKey"
  ok "qui proxy URL saved"
else
  warn "Skipping qui proxy key -- set it later in .env"
fi

# -- 7. Prowlarr API Key -----------------------------------------------

step "[7/11] Prowlarr API Key"

echo ""
echo "Follow these steps to get your Prowlarr API key:"
echo "  1. Open http://localhost:9696 in your browser"
echo "  2. Go to Settings > General"
echo "  3. Find the API Key field"
echo "  4. Copy the API key"
echo ""
echo "Tip: You can also add indexers here later."
echo ""

prowlarrKey=$(read_input "Paste your Prowlarr API key (Enter to skip)")

if [ -n "$prowlarrKey" ]; then
  update_env "NUXT_PROWLARR_API_KEY" "$prowlarrKey"
  ok "Prowlarr API key saved"
else
  warn "Skipping Prowlarr API key -- set it later in .env"
fi

# -- 8. TMDB API Key ---------------------------------------------------

step "[8/11] TMDB API Key"

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

step "[9/11] Discord Webhook (optional)"

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

step "[10/11] Pulling StreamHub"

if [ "$HAS_GUM" = true ]; then
  gum spin --spinner dot --title "Pulling StreamHub image..." -- docker compose pull streamhub || true
else
  info "Pulling StreamHub image..."
  docker compose pull streamhub || true
fi

if ! docker image inspect ghcr.io/nort1346/streamhub:latest &> /dev/null; then
  err "Failed to pull StreamHub image. Check your network and try again."
  err "You can also try manually: docker compose pull streamhub"
  exit 1
fi

ok "StreamHub image pulled"

# -- 10. Start StreamHub -----------------------------------------------

step "[11/11] Starting StreamHub"

update_env "NUXT_JELLYFIN_URL" "http://jellyfin:8096"
update_env "NUXT_REDIS_URL" "redis://redis:6379"
update_env "NUXT_PROWLARR_URL" "http://prowlarr:9696"
update_env "DB_DRIVER" "sqlite"

if [ "$HAS_GUM" = true ]; then
  gum spin --spinner dot --title "Starting StreamHub..." -- docker compose up -d streamhub || true
else
  info "Starting StreamHub..."
  docker compose up -d streamhub || true
fi

if ! docker compose ps streamhub 2>/dev/null | grep -q "Up"; then
  err "StreamHub container failed to start. Check logs:"
  err "  docker compose logs streamhub"
fi

info "Waiting for StreamHub to start (first start may take 1-2 minutes)..."
wait_for_port "localhost" "5757" 120 || true

ok "StreamHub is running at http://localhost:5757"

# -- Summary -----------------------------------------------------------

SUMMARY=$(cat << EOF
  StreamHub is ready!

  +-----------------+--------------------------+
  | Service         | URL                      |
  +-----------------+--------------------------+
  | StreamHub       | http://localhost:5757    |
  | qBittorrent     | http://localhost:8080    |
  | qui             | http://localhost:7476    |
  | Prowlarr        | http://localhost:9696    |
  | Jellyfin        | http://localhost:8096    |
  | Dozzle (logs)   | http://localhost:8082    |
  +-----------------+--------------------------+

  Credentials:
    Jellyfin:      admin / admin
    qBittorrent:   admin / admin
    qui:           admin / admin

  Next steps:
    1. http://localhost:5757 -- Create your StreamHub account
    2. http://localhost:8080 -- Change qBittorrent password
    3. http://localhost:7476 -- Verify qBittorrent is connected in qui
    4. http://localhost:8096 -- Add media libraries in Jellyfin
    5. http://localhost:9696 -- Add indexers in Prowlarr
    6. http://localhost:8082 -- View logs in Dozzle
EOF
)

summary_box "$SUMMARY"
