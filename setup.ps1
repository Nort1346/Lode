<#
.SYNOPSIS
    StreamHub Auto-Setup Script for Windows
.DESCRIPTION
    Sets up the full self-hosted stack: Redis, qBittorrent, qui, Prowlarr,
    Jellyfin, and StreamHub with guided manual configuration.
.EXAMPLE
    .\setup.ps1
#>

$ErrorActionPreference = "Continue"

# -- gum bootstrap ----------------------------------------------------

$script:HAS_GUM = $false

function Install-Gum {
    if (Get-Command gum -ErrorAction SilentlyContinue) {
        $script:HAS_GUM = $true
        return
    }

    Write-Host "Installing gum (charm) for beautiful output..."

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install Charmbracelet.Gum --accept-source-agreements --accept-package-agreements 2>$null
    }
    elseif (Get-Command scoop -ErrorAction SilentlyContinue) {
        scoop install gum
    }
    else {
        $arch = if ([Environment]::Is64BitOperatingSystem) { "x86_64" } else { "386" }
        $tmp = Join-Path $env:TEMP "gum-download"
        New-Item -ItemType Directory -Path $tmp -Force | Out-Null

        $url = "https://github.com/charmbracelet/gum/releases/latest/download/gum_*_Windows_${arch}.zip"
        $zip = Join-Path $tmp "gum.zip"

        try {
            Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing 2>$null
            Expand-Archive -Path $zip -DestinationPath $tmp -Force
            $gumExe = Get-ChildItem -Path $tmp -Filter "gum.exe" -Recurse | Select-Object -First 1
            if ($gumExe) {
                Copy-Item $gumExe.FullName "$env:LOCALAPPDATA\Microsoft\WinGet\Links\gum.exe" -Force -ErrorAction SilentlyContinue
                $script:HAS_GUM = $true
            }
        }
        catch {
            Write-Host "Could not install gum automatically."
        }
        finally {
            Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
        }
    }

    if (Get-Command gum -ErrorAction SilentlyContinue) {
        $script:HAS_GUM = $true
    }
}

Install-Gum

# -- Output helpers ---------------------------------------------------

function Write-Info    { param([string]$Msg) if ($script:HAS_GUM) { gum log --level info $Msg } else { Write-Host "[INFO]  $Msg" -ForegroundColor Blue } }
function Write-Ok      { param([string]$Msg) if ($script:HAS_GUM) { gum log --level info $Msg } else { Write-Host "[ OK ]  $Msg" -ForegroundColor Green } }
function Write-Warn    { param([string]$Msg) if ($script:HAS_GUM) { gum log --level warn $Msg } else { Write-Host "[WARN]  $Msg" -ForegroundColor Yellow } }
function Write-Err     { param([string]$Msg) if ($script:HAS_GUM) { gum log --level error $Msg } else { Write-Host "[ERR ]  $Msg" -ForegroundColor Red } }

function Write-Header {
    param([string]$Msg)
    if ($script:HAS_GUM) {
        gum style --foreground "#FAFAFA" --background "#6C91BF" --padding "0 2" --bold $Msg
    } else {
        Write-Host ""
        Write-Host "=== $Msg ===" -ForegroundColor Cyan
        Write-Host ""
    }
}

function Write-Step {
    param([string]$Msg)
    if ($script:HAS_GUM) {
        Write-Host ""
        gum style --foreground "#E0E0E0" --background "#333333" --padding "0 1" --bold $Msg
    } else {
        Write-Host ""
        Write-Host "--- $Msg ---" -ForegroundColor Cyan
    }
}

function Invoke-Spinner {
    param([string]$Title, [scriptblock]$Command)
    if ($script:HAS_GUM) {
        gum spin --spinner dot --title $Title -- $Command
    } else {
        Write-Info $Title
        & $Command
    }
}

function Write-SummaryBox {
    param([string]$Msg)
    if ($script:HAS_GUM) {
        gum style --border double --border-foreground 2 --padding "1 2" $Msg
    } else {
        Write-Host ""
        Write-Host $Msg -ForegroundColor Green
        Write-Host ""
    }
}

# -- Helpers ----------------------------------------------------------

function New-SecretPassword {
    param([int]$Length = 32)
    $bytes = [byte[]]::new($Length)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    $result = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
    return $result.Substring(0, $Length)
}

function New-SecretHex {
    param([int]$Bytes = 16)
    $buf = [byte[]]::new($Bytes)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($buf)
    return ([System.BitConverter]::ToString($buf) -replace '-', '').ToLower()
}

function Test-Port {
    param([string]$Host_, [int]$Port, [int]$Timeout = 60)
    $elapsed = 0
    while ($elapsed -lt $Timeout) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect($Host_, $Port)
            $tcp.Close()
            return $true
        }
        catch {
            Start-Sleep -Seconds 2
            $elapsed += 2
        }
    }
    Write-Err "Timeout waiting for ${Host_}:${Port} after ${Timeout}s"
    return $false
}

function Update-EnvFile {
    param([string]$Key, [string]$Value)
    $envPath = ".env"
    if (-not (Test-Path $envPath)) { return }

    $content = Get-Content $envPath -Raw
    $pattern = "(?m)^$([regex]::Escape($Key))=.*"
    $replacement = "$Key=$Value"

    if ($content -match $pattern) {
        $content = $content -replace $pattern, $replacement
    }
    elseif ($content -match "(?m)^#\s*$([regex]::Escape($Key))=.*") {
        $content = $content -replace "(?m)^#\s*$([regex]::Escape($Key))=.*", $replacement
    }
    else {
        $content = $content.TrimEnd() + "`n$Key=$Value`n"
    }

    Set-Content -Path $envPath -Value $content -NoNewline
}

function Read-GumInput {
    param([string]$Placeholder)
    if ($script:HAS_GUM) {
        return gum input --placeholder $Placeholder
    } else {
        return Read-Host $Placeholder
    }
}

# -- Banner -----------------------------------------------------------

Write-Header "StreamHub Auto-Setup v1.0"

Write-Host ""
Write-Host "This will start the following services:" -ForegroundColor White
Write-Host "  Redis, qBittorrent, qui, Prowlarr, Jellyfin" -ForegroundColor Gray
Write-Host ""
Write-Host "Data will be stored in Docker volumes." -ForegroundColor Gray
Write-Host "Default passwords: admin / admin" -ForegroundColor Yellow
Write-Host ""

if ($script:HAS_GUM) {
    gum confirm --default=false "Do you want to continue?" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }
} else {
    $confirm = Read-Host "Do you want to continue? (y/N)"
    if ($confirm -notmatch '^[yY]') {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }
}

# -- 1. Prerequisites -------------------------------------------------

Write-Step "[1/10] Checking prerequisites"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Err "Docker is not installed. Install: https://docs.docker.com/get-docker/"
    exit 1
}
Write-Ok "Docker $(docker --version)"

try {
    $composeVersion = docker compose version 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose not found" }
} catch {
    Write-Err "Docker Compose plugin is not installed."
    exit 1
}
Write-Ok "Docker Compose available"

if (-not (Get-Command curl -ErrorAction SilentlyContinue)) {
    Write-Err "curl is required for API calls."
    exit 1
}
Write-Ok "curl available"

# -- 2. Create .env ---------------------------------------------------

Write-Step "[2/10] Setting up .env file"

if (-not (Test-Path .env)) {
    if (Test-Path .env.example) {
        Copy-Item .env.example .env
        Write-Ok "Created .env from .env.example"
    } else {
        Write-Err ".env.example not found."
        exit 1
    }
} else {
    Write-Warn ".env exists - keeping existing config"
}

# -- 3. Generate secrets ----------------------------------------------

Write-Step "[3/10] Generating secrets"

$SESSION_PASSWORD = New-SecretPassword -Length 32
$TRACKER_KEY = New-SecretHex -Bytes 32

Update-EnvFile "NUXT_SESSION_PASSWORD" $SESSION_PASSWORD
Update-EnvFile "NUXT_TRACKER_ENCRYPTION_KEY" $TRACKER_KEY
Write-Ok "Session password generated"
Write-Ok "Tracker encryption key generated"

# -- 4. Start infrastructure services --------------------------------

Write-Step "[4/10] Starting infrastructure services"

Invoke-Spinner "Pulling images..." { docker compose pull redis qbittorrent prowlarr qui jellyfin 2>$null }

docker compose up -d --remove-orphans redis qbittorrent prowlarr qui jellyfin

Write-Info "Waiting for Redis..."
Test-Port -Host_ "localhost" -Port 6379 -Timeout 30 | Out-Null

Write-Info "Waiting for qBittorrent..."
Test-Port -Host_ "localhost" -Port 8080 -Timeout 60 | Out-Null

Start-Sleep -Seconds 3

$QBIT_TEMP_PASS = docker logs streamhub-qbittorrent 2>&1 |
    Select-String 'A temporary password is provided for this session:' |
    ForEach-Object { ($_ -replace '.*A temporary password is provided for this session:\s*', '').Trim() } |
    Select-Object -First 1

Write-Info "Waiting for Prowlarr..."
Test-Port -Host_ "localhost" -Port 9696 -Timeout 60 | Out-Null

Write-Info "Waiting for qui..."
Test-Port -Host_ "localhost" -Port 7476 -Timeout 60 | Out-Null

Write-Info "Waiting for Jellyfin..."
Test-Port -Host_ "localhost" -Port 8096 -Timeout 90 | Out-Null

Write-Ok "All infrastructure services are running"

Write-Info "Waiting 10s for services to fully initialize..."
Start-Sleep -Seconds 10

# -- 5. Jellyfin API Key ----------------------------------------------

Write-Step "[5/10] Jellyfin API Key"

Write-Host ""
Write-Host "Follow these steps to get your Jellyfin API key:" -ForegroundColor White
Write-Host "  1. Open http://localhost:8096 in your browser" -ForegroundColor Gray
Write-Host "  2. Complete the setup wizard (create your admin account)" -ForegroundColor Gray
Write-Host "  3. Go to Dashboard (gear icon) > API Keys" -ForegroundColor Gray
Write-Host '  4. Click "+", name it "StreamHub", click OK' -ForegroundColor Gray
Write-Host "  5. Copy the generated API key" -ForegroundColor Gray
Write-Host ""

$jellyfinKey = Read-GumInput -Placeholder "Paste your Jellyfin API key (Enter to skip)"

if ($jellyfinKey) {
    Update-EnvFile "NUXT_JELLYFIN_API_KEY" $jellyfinKey
    Write-Ok "Jellyfin API key saved"
} else {
    Write-Warn "Skipping Jellyfin API key -- set it later in .env"
}

# -- 6. qui setup + proxy key -----------------------------------------

Write-Step "[6/10] qui setup + qBittorrent connection"

if ($QBIT_TEMP_PASS) {
    Write-Host ""
    Write-Host "  +--------------------------------------------+" -ForegroundColor Yellow
    Write-Host "  | qBittorrent temporary password: $QBIT_TEMP_PASS" -ForegroundColor Yellow
    Write-Host "  | Copy this -- you will need it below        |" -ForegroundColor Yellow
    Write-Host "  +--------------------------------------------+" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Warn "Could not extract qBittorrent temp password -- check: docker logs streamhub-qbittorrent"
}

Write-Host "FIRST -- configure qBittorrent:" -ForegroundColor White
Write-Host "  1. Open http://localhost:8080 in your browser" -ForegroundColor Gray
Write-Host "  2. Login with:" -ForegroundColor Gray
Write-Host "       Username: admin" -ForegroundColor Yellow
Write-Host "       Password: [temporary password shown above]" -ForegroundColor Yellow
Write-Host "  3. Go to Settings > Web UI" -ForegroundColor Gray
Write-Host "  4. Change the password to something you remember" -ForegroundColor Gray
Write-Host "  5. Save changes" -ForegroundColor Gray
Write-Host ""
Write-Host "THEN -- configure qui:" -ForegroundColor White
Write-Host "  6. Open http://localhost:7476 in your browser" -ForegroundColor Gray
Write-Host "  7. Create your admin account" -ForegroundColor Gray
Write-Host "  8. Go to Settings > Clients" -ForegroundColor Gray
Write-Host "  9. Click Add New, fill in:" -ForegroundColor Gray
Write-Host "       Name:    qBittorrent" -ForegroundColor Yellow
Write-Host "       Host:    qbittorrent" -ForegroundColor Yellow
Write-Host "       Port:    8080" -ForegroundColor Yellow
Write-Host "       User:    admin" -ForegroundColor Yellow
Write-Host "       Pass:    [the password you just set]" -ForegroundColor Yellow
Write-Host "  10. Test the connection, then save" -ForegroundColor Gray
Write-Host "  11. Go to Settings > API Keys" -ForegroundColor Gray
Write-Host '  12. Click "Create", name it "streamhub"' -ForegroundColor Gray
Write-Host "  13. Copy the generated key" -ForegroundColor Gray
Write-Host ""
Write-Host "LAST STEP: Go to Settings > Clients, click your qBittorrent" -ForegroundColor DarkGray
Write-Host "connection, and copy the full Proxy URL (looks like:" -ForegroundColor DarkGray
Write-Host "  http://qui:7476/proxy/YOUR_KEY_HERE )" -ForegroundColor DarkGray
Write-Host ""

$quiKey = Read-GumInput -Placeholder "Paste your full qui proxy URL (Enter to skip)"

if ($quiKey) {
    Update-EnvFile "NUXT_QUI_PROXY_URL" $quiKey
    Write-Ok "qui proxy URL saved"
} else {
    Write-Warn "Skipping qui proxy key -- set it later in .env"
}

# -- 7. Prowlarr API Key ----------------------------------------------

Write-Step "[7/10] Prowlarr API Key"

Write-Host ""
Write-Host "Follow these steps to get your Prowlarr API key:" -ForegroundColor White
Write-Host "  1. Open http://localhost:9696 in your browser" -ForegroundColor Gray
Write-Host "  2. Go to Settings > General" -ForegroundColor Gray
Write-Host "  3. Find the API Key field" -ForegroundColor Gray
Write-Host "  4. Copy the API key" -ForegroundColor Gray
Write-Host ""
Write-Host "Tip: You can also add indexers here ( torrent ) later." -ForegroundColor DarkGray
Write-Host ""

$prowlarrKey = Read-GumInput -Placeholder "Paste your Prowlarr API key (Enter to skip)"

if ($prowlarrKey) {
    Update-EnvFile "NUXT_PROWLARR_API_KEY" $prowlarrKey
    Write-Ok "Prowlarr API key saved"
} else {
    Write-Warn "Skipping Prowlarr API key -- set it later in .env"
}

# -- 8. TMDB API Key --------------------------------------------------

Write-Step "[8/10] TMDB API Key"

Write-Host ""
Write-Host "Follow these steps to get your TMDB API key:" -ForegroundColor White
Write-Host "  1. Go to https://www.themoviedb.org/settings/api" -ForegroundColor Gray
Write-Host "  2. Create a free account (or log in)" -ForegroundColor Gray
Write-Host '  3. Click "Click here to generate an API key"' -ForegroundColor Gray
Write-Host "  4. Fill in the form:" -ForegroundColor Gray
Write-Host "       Application Name:  StreamHub" -ForegroundColor Yellow
Write-Host "       Application URL:   http://localhost:5757" -ForegroundColor Yellow
Write-Host "  5. Copy your API Key (v3 auth)" -ForegroundColor Gray
Write-Host ""
Write-Host "This is required for movie/TV metadata." -ForegroundColor DarkGray
Write-Host ""

$tmdbKey = Read-GumInput -Placeholder "Paste your TMDB API key (Enter to skip)"

if ($tmdbKey) {
    Update-EnvFile "NUXT_TMDB_API_KEY" $tmdbKey
    Write-Ok "TMDB API key saved"
} else {
    Write-Warn "Skipping TMDB API key -- set it later in .env"
}

# -- 9. Pull StreamHub ------------------------------------------------

Write-Step "[9/10] Pulling StreamHub"

Invoke-Spinner "Pulling StreamHub image..." { docker compose pull streamhub }

Write-Ok "StreamHub image pulled"

# -- 10. Start StreamHub ----------------------------------------------

Write-Step "[10/10] Starting StreamHub"

Update-EnvFile "NUXT_JELLYFIN_URL" "http://jellyfin:8096"
Update-EnvFile "NUXT_REDIS_URL" "redis://redis:6379"
Update-EnvFile "NUXT_PROWLARR_URL" "http://prowlarr:9696"
Update-EnvFile "DB_DRIVER" "sqlite"

Invoke-Spinner "Starting StreamHub..." { docker compose up -d streamhub }

Write-Info "Waiting for StreamHub to start (first start may take 1-2 minutes)..."
Test-Port -Host_ "localhost" -Port 5757 -Timeout 120 | Out-Null

Write-Ok "StreamHub is running at http://localhost:5757"

# -- Summary ----------------------------------------------------------

$summary = @"
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
"@

Write-SummaryBox $summary
