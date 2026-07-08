#!/bin/bash
set -euo pipefail

# ── StreamHub Auto-Setup Script ─────────────────────────────────────
# Sets up the full self-hosted stack: Redis, qBittorrent, qui, Prowlarr,
# Jellyfin, and StreamHub with zero manual configuration.
#
# Usage: ./setup.sh
# ─────────────────────────────────────────────────────────────────────

# ── gum bootstrap ────────────────────────────────────────────────────

HAS_GUM=false

install_gum() {
  if command -v gum &> /dev/null; then
    HAS_GUM=true
    return 0
  fi

  echo "Installing gum (charm) for beautiful output..."

  if command -v apt-get &> /dev/null; then
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
    # Fallback: download binary directly
    local arch
    arch=$(uname -m)
    case "$arch" in
      x86_64)  arch="x86_64" ;;
      aarch64) arch="arm64" ;;
      *)       echo "Unsupported architecture: $arch"; return 1 ;;
    esac
    local tmp
    tmp=$(mktemp -d)
    curl -fsSL "https://github.com/charmbracelet/gum/releases/latest/download/gum_*_Linux_${arch}.tar.gz" \
      | tar xz -C "$tmp" gum 2>/dev/null
    mv "$tmp/gum" /usr/local/bin/gum 2>/dev/null
    rm -rf "$tmp"
  fi

  if command -v gum &> /dev/null; then
    HAS_GUM=true
  fi
}

install_gum

# ── Output helpers ───────────────────────────────────────────────────

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
else
  # Fallback: ANSI colors
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

  header() { echo -e "\n${BOLD}${CYAN}═══ $1 ═══${NC}\n"; }
  step()   { echo -e "\n${BOLD}${CYAN}── $1 ──${NC}"; }

  spinner() {
    local title="$1"; shift
    info "$title"
    "$@"
  }

  summary_box() { echo -e "\n${GREEN}$1${NC}\n"; }
fi

# ── Helpers ──────────────────────────────────────────────────────────

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
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  elif grep -q "^# *${key}=" .env 2>/dev/null; then
    sed -i "s|^# *${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

# ── Banner ───────────────────────────────────────────────────────────

header "StreamHub Auto-Setup v1.0"

# ── 1. Prerequisites ────────────────────────────────────────────────

step "[1/9] Checking prerequisites"

if ! command -v docker &> /dev/null; then
  err "Docker is not installed. Install: https://docs.docker.com/get-docker/"
  exit 1
fi
ok "Docker $(docker --version | grep -oP 'version \K[^ ,]+')"

if ! docker compose version &> /dev/null 2>&1; then
  err "Docker Compose plugin is not installed."
  exit 1
fi
ok "Docker Compose $(docker compose version --short 2>/dev/null || echo 'available')"

if ! command -v openssl &> /dev/null; then
  err "openssl is required for generating secrets."
  exit 1
fi
ok "openssl available"

if ! command -v curl &> /dev/null; then
  err "curl is required for API calls."
  exit 1
fi
ok "curl available"

# ── 2. Create .env ──────────────────────────────────────────────────

step "[2/9] Setting up .env file"

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    ok "Created .env from .env.example"
  else
    err ".env.example not found."
    exit 1
  fi
else
  warn ".env exists — keeping existing config"
fi

# ── 3. Generate secrets ─────────────────────────────────────────────

step "[3/9] Generating secrets"

SESSION_PASSWORD=$(generate_password 32)
TRACKER_KEY=$(generate_hex 32)
PROWLARR_API_KEY=$(generate_hex 16)

update_env "NUXT_SESSION_PASSWORD" "$SESSION_PASSWORD"
update_env "NUXT_TRACKER_ENCRYPTION_KEY" "$TRACKER_KEY"
ok "Session password generated"
ok "Tracker encryption key generated"

# ── 4. Pre-seed Prowlarr config ────────────────────────────────────

step "[4/9] Pre-seeding Prowlarr configuration"

PROWLARR_CONFIG_DIR="./prowlarr-config"
mkdir -p "$PROWLARR_CONFIG_DIR"

cat > "$PROWLARR_CONFIG_DIR/config.xml" << PROWLARR_XML
<?xml version="1.0" encoding="utf-8"?>
<Config>
  <LogLevel>Info</LogLevel>
  <Server>
    <Port>9696</Port>
    <ApiKey>${PROWLARR_API_KEY}</ApiKey>
    <AuthenticationMethod>None</AuthenticationMethod>
  </Server>
</Config>
PROWLARR_XML

ok "Prowlarr config created"

# ── 5. Start infrastructure services ────────────────────────────────

step "[5/9] Starting infrastructure services"

if [ "$HAS_GUM" = true ]; then
  gum spin --spinner dot --title "Pulling images..." -- docker compose pull redis qbittorrent prowlarr qui jellyfin 2>/dev/null || true
else
  info "Pulling images..."
  docker compose pull redis qbittorrent prowlarr qui jellyfin 2>/dev/null || true
fi

docker compose up -d redis qbittorrent prowlarr qui jellyfin

info "Waiting for Redis..."
wait_for_port "localhost" "6379" 30

info "Waiting for qBittorrent..."
wait_for_port "localhost" "8080" 60

info "Waiting for Prowlarr..."
wait_for_port "localhost" "9696" 60

info "Waiting for qui..."
wait_for_port "localhost" "7476" 60

info "Waiting for Jellyfin..."
wait_for_port "localhost" "8096" 90

ok "All infrastructure services are running"

info "Waiting 10s for services to fully initialize..."
sleep 10

# ── 6. Configure Jellyfin ──────────────────────────────────────────

step "[6/9] Configuring Jellyfin"

JELLYFIN_URL="http://localhost:8096"

if curl -sf "$JELLYFIN_URL/System/Info" -H "X-Emby-Token: dummy" 2>/dev/null | grep -q '"ServerName"'; then
  warn "Jellyfin already configured — skipping setup"
else
  info "Running Jellyfin startup wizard..."

  curl -sf -X POST "$JELLYFIN_URL/Startup/Configuration" \
    -H 'Content-Type: application/json' \
    -d '{"UICulture":"pl-PL","MetadataCountryCode":"PL","PreferredMetadataLanguage":"pl"}' \
    > /dev/null 2>&1 || true

  curl -sf -X POST "$JELLYFIN_URL/Startup/User" \
    -H 'Content-Type: application/json' \
    -d '{"Name":"admin","Password":"admin"}' \
    > /dev/null 2>&1 || true

  curl -sf -X POST "$JELLYFIN_URL/Startup/Complete" \
    -H 'Content-Type: application/json' \
    -d '{}' \
    > /dev/null 2>&1 || true

  ok "Jellyfin admin created: admin / admin"
fi

JELLYFIN_TOKEN=$(curl -sf -X POST "$JELLYFIN_URL/Users/AuthenticateByName" \
  -H 'Content-Type: application/json' \
  -H 'X-Emby-Authorization: MediaBrowser Client="SetupScript", Device="Docker", DeviceId="setup-script-001", Version="1.0.0"' \
  -d '{"Username":"admin","Pw":"admin"}' 2>/dev/null \
  | grep -o '"AccessToken":"[^"]*"' | head -1 | cut -d'"' -f4) || true

if [ -n "${JELLYFIN_TOKEN:-}" ]; then
  JELLYFIN_API_KEY=$(curl -sf -X POST "$JELLYFIN_URL/ApiKeys/Keys" \
    -H "X-Emby-Token: $JELLYFIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"Name":"StreamHub","Expiry":"2030-12-31T23:59:59Z"}' 2>/dev/null \
    | grep -o '"ApiKey":"[^"]*"' | head -1 | cut -d'"' -f4) || true

  if [ -n "${JELLYFIN_API_KEY:-}" ]; then
    update_env "NUXT_JELLYFIN_API_KEY" "$JELLYFIN_API_KEY"
    ok "Jellyfin API key created"
  else
    warn "Could not create Jellyfin API key — set manually in Dashboard"
  fi
else
  warn "Could not authenticate to Jellyfin — configure API key manually"
fi

# ── 7. Configure qui ───────────────────────────────────────────────

step "[7/9] Configuring qui"

QUI_URL="http://localhost:7476"

QUI_SETUP=$(curl -sf -X POST "$QUI_URL/api/auth/setup" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' 2>&1) || true

if echo "$QUI_SETUP" | grep -q '"token"'; then
  QUI_TOKEN=$(echo "$QUI_SETUP" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

  QUI_API_KEY=$(curl -sf -X POST "$QUI_URL/api/api-keys" \
    -H "Authorization: Bearer $QUI_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"name":"streamhub","expiresAt":"2030-12-31T23:59:59Z"}' 2>/dev/null \
    | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4) || true

  if [ -n "${QUI_TOKEN:-}" ]; then
    QUI_CLIENT_KEY=$(curl -sf -X POST "$QUI_URL/api/client-api-keys" \
      -H "Authorization: Bearer $QUI_TOKEN" \
      -H 'Content-Type: application/json' \
      -d '{"name":"qbittorrent-proxy","expiresAt":"2030-12-31T23:59:59Z"}' 2>/dev/null \
      | grep -o '"key":"[^"]*"' | head -1 | cut -d'"' -f4) || true

    if [ -n "${QUI_CLIENT_KEY:-}" ]; then
      update_env "NUXT_QUI_PROXY_URL" "http://qui:7476/proxy/${QUI_CLIENT_KEY}"
      ok "qui admin created and proxy key generated"
    else
      warn "Could not create qui proxy key — configure manually"
    fi
  else
    warn "Could not authenticate to qui — configure manually"
  fi
else
  warn "qui admin setup may have failed — check http://localhost:7476"
fi

# ── 8. Configure qBittorrent ───────────────────────────────────────

step "[8/9] Configuring qBittorrent"

QBIT_URL="http://localhost:8080"

QBIT_TEMP_PASS=$(docker logs streamhub-qbittorrent 2>&1 | grep -oP 'temporary password is: \K.*' | tail -1) || true

if [ -n "${QBIT_TEMP_PASS:-}" ]; then
  QBIT_COOKIE=$(mktemp)
  curl -sf -c "$QBIT_COOKIE" \
    -H 'Referer: http://localhost:8080' \
    --data-urlencode "username=admin" \
    --data-urlencode "password=$QBIT_TEMP_PASS" \
    "$QBIT_URL/api/v2/auth/login" 2>/dev/null || true

  curl -sf -b "$QBIT_COOKIE" \
    -H 'Referer: http://localhost:8080' \
    --data-urlencode "username=admin" \
    --data-urlencode "password=admin" \
    --data-urlencode "newPassword=admin" \
    "$QBIT_URL/api/v2/auth/changePassword" 2>/dev/null || true

  rm -f "$QBIT_COOKIE"
  ok "qBittorrent password set to: admin"
else
  warn "Could not get qBittorrent temp password — check container logs"
fi

# ── 9. Finalize ─────────────────────────────────────────────────────

step "[9/9] Finalizing configuration"

update_env "NUXT_JELLYFIN_URL" "http://jellyfin:8096"
update_env "NUXT_REDIS_URL" "redis://redis:6379"
update_env "NUXT_PROWLARR_URL" "http://prowlarr:9696"
update_env "NUXT_PROWLARR_API_KEY" "$PROWLARR_API_KEY"
update_env "DB_DRIVER" "sqlite"

info "Starting full stack..."

if [ "$HAS_GUM" = true ]; then
  gum spin --spinner dot --title "Starting all services..." -- docker compose up -d
else
  docker compose up -d
fi

ok "All services started"

# ── Summary ─────────────────────────────────────────────────────────

SUMMARY=$(cat << EOF
  StreamHub is ready!

  ┌─────────────────┬──────────────────────────┐
  │ Service         │ URL                      │
  ├─────────────────┼──────────────────────────┤
  │ StreamHub       │ http://localhost:3000    │
  │ qBittorrent     │ http://localhost:8080    │
  │ qui             │ http://localhost:7476    │
  │ Prowlarr        │ http://localhost:9696    │
  │ Jellyfin        │ http://localhost:8096    │
  │ Dozzle (logs)   │ http://localhost:8082    │
  └─────────────────┴──────────────────────────┘

  Credentials:
    Jellyfin:      admin / admin
    qBittorrent:   admin / admin
    qui:           admin / admin

  Prowlarr API Key: ${PROWLARR_API_KEY}

  Next steps:
    1. Open http://localhost:3000 and create your StreamHub account
    2. Change default passwords in each service
    3. Add qBittorrent in qui (Settings > Clients)
    4. Configure media libraries in Jellyfin
    5. Add indexers in Prowlarr
EOF
)

summary_box "$SUMMARY"
