<#
.SYNOPSIS
    StreamHub Auto-Setup Script for Windows
.DESCRIPTION
    Sets up the full self-hosted stack: Redis, qBittorrent, Prowlarr,
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
        $arch = switch ($env:PROCESSOR_ARCHITECTURE) {
            "ARM64" { "x86_64" }
            "x86"   { "i386" }
            default { "x86_64" }
        }
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
        gum style --border double --border-foreground 2 --align center --padding "1 2" $Msg
    } else {
        Write-Host ""
        Write-Host $Msg -ForegroundColor Green
        Write-Host ""
    }
}

function Write-SummarySection {
    param([string]$Msg)
    if ($script:HAS_GUM) {
        gum style --border normal --border-foreground 240 --padding "0 2" $Msg
    } else {
        Write-Host $Msg -ForegroundColor Gray
    }
}

function Get-SummaryRow {
    param([string]$Label, [string]$Url)
    return ("  {0,-18} {1}" -f $Label, $Url)
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

function Test-EnvMinLength {
    param([string]$Key, [int]$MinLength)
    $line = Select-String -Path ".env" -Pattern "^$Key=(.*)" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) {
        $value = $line.Matches[0].Groups[1].Value
        return $value.Length -ge $MinLength
    }
    return $false
}

function Test-Port {
    param([string]$Host_, [int]$Port, [int]$Timeout = 60)
    $elapsed = 0
    while ($elapsed -lt $Timeout) {
        $tcp = $null
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $task = $tcp.ConnectAsync($Host_, $Port)
            if ($task.Wait(5000)) {
                $tcp.Close()
                return $true
            }
        }
        catch {
            # connection failed
        }
        finally {
            if ($tcp) { $tcp.Dispose() }
        }
        Start-Sleep -Seconds 2
        $elapsed += 2
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

function Select-GumMenu {
    param([string]$Prompt, [string[]]$Options)
    if ($script:HAS_GUM) {
        return gum choose --header $Prompt $Options
    } else {
        Write-Host $Prompt
        for ($i = 0; $i -lt $Options.Count; $i++) {
            Write-Host "  $($i + 1)) $($Options[$i])"
        }
        $choice = Read-Host "Enter choice [1-$($Options.Count)]"
        return $Options[[int]$choice - 1]
    }
}

# -- Self-update check --------------------------------------------------

$SETUP_URL = "https://raw.githubusercontent.com/Nort1346/StreamHub/main/setup.ps1"
$SETUP_NEW = Join-Path $env:TEMP "setup.ps1.new"
$SETUP_SELF = $MyInvocation.MyCommand.Path

try {
    Invoke-WebRequest -Uri $SETUP_URL -OutFile $SETUP_NEW -UseBasicParsing 2>$null
    if ($LASTEXITCODE -eq 0 -and (Test-Path $SETUP_NEW)) {
        $currentHash = (Get-FileHash $SETUP_SELF -Algorithm SHA256).Hash
        $newHash = (Get-FileHash $SETUP_NEW -Algorithm SHA256).Hash
        if ($currentHash -ne $newHash) {
            Write-Host ""
            if ($script:HAS_GUM) {
                gum style --foreground "#FFD700" --border normal --border-foreground "#FFD700" --padding "0 1" --bold "A newer version of setup.ps1 is available."
            } else {
                Write-Host "  A newer version of setup.ps1 is available." -ForegroundColor Yellow
            }
            Write-Host ""
            if ($script:HAS_GUM) {
                gum confirm --default=false "Update setup.ps1 and restart?"
                if ($LASTEXITCODE -eq 0) {
                    Copy-Item $SETUP_SELF "$SETUP_SELF.bak" -Force
                    Copy-Item $SETUP_NEW $SETUP_SELF -Force
                    Write-Ok "Updated setup.ps1. Restarting..."
                    & $SETUP_SELF
                    exit
                }
            } else {
                $answer = Read-Host "Update setup.ps1 and restart? (y/N)"
                if ($answer -match '^[Yy]$') {
                    Copy-Item $SETUP_SELF "$SETUP_SELF.bak" -Force
                    Copy-Item $SETUP_NEW $SETUP_SELF -Force
                    Write-Ok "Updated setup.ps1. Restarting..."
                    & $SETUP_SELF
                    exit
                }
            }
            Write-Warn "Continuing with current version..."
        }
    }
} catch {
    # Silently continue if update check fails
} finally {
    if (Test-Path $SETUP_NEW) { Remove-Item $SETUP_NEW -Force -ErrorAction SilentlyContinue }
}

# -- Banner -----------------------------------------------------------

Write-Header "StreamHub Auto-Setup v1.0"

Write-Host ""
Write-Host "This will start the following services:" -ForegroundColor White
Write-Host "  Redis, qBittorrent, Prowlarr, FlareSolverr, Jellyfin, Dozzle" -ForegroundColor Gray
Write-Host ""
Write-Host "Data will be stored in Docker volumes." -ForegroundColor Gray
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

Write-Step "[1/14] Checking prerequisites"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Err "Docker is not installed. Install: https://docs.docker.com/get-docker/"
    exit 1
}
Write-Ok "Docker $(docker --version)"

try {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker daemon not running" }
} catch {
    Write-Err "Docker daemon is not running. Start Docker Desktop and try again."
    exit 1
}
Write-Ok "Docker daemon running"

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

Write-Step "[2/14] Setting up .env file"

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

New-Item -ItemType Directory -Path "media/Movies" -Force | Out-Null
New-Item -ItemType Directory -Path "media/Series" -Force | Out-Null
Write-Ok "Created media directories (media/Movies, media/Series)"

# -- 3. Generate secrets ----------------------------------------------

Write-Step "[3/14] Generating secrets"

$SESSION_PASSWORD = New-SecretPassword -Length 32
$TRACKER_KEY = New-SecretHex -Bytes 32

Update-EnvFile "NUXT_SESSION_PASSWORD" $SESSION_PASSWORD
Update-EnvFile "NUXT_TRACKER_ENCRYPTION_KEY" $TRACKER_KEY

if (-not (Test-EnvMinLength -Key "NUXT_SESSION_PASSWORD" -MinLength 32)) {
    Write-Warn "Session password too short, regenerating..."
    $SESSION_PASSWORD = New-SecretPassword -Length 32
    Update-EnvFile "NUXT_SESSION_PASSWORD" $SESSION_PASSWORD
}

if (-not (Test-EnvMinLength -Key "NUXT_TRACKER_ENCRYPTION_KEY" -MinLength 32)) {
    Write-Warn "Tracker key too short, regenerating..."
    $TRACKER_KEY = New-SecretHex -Bytes 32
    Update-EnvFile "NUXT_TRACKER_ENCRYPTION_KEY" $TRACKER_KEY
}

Write-Ok "Session password generated"
Write-Ok "Tracker encryption key generated"

# -- 4. StreamHub version choice --------------------------------------

Write-Step "[4/14] StreamHub version"

$STREAMHUB_TAG = "latest"

Write-Host ""
Write-Host "Which StreamHub image do you want to use?" -ForegroundColor White
Write-Host "  latest  - Stable release (recommended)" -ForegroundColor Gray
Write-Host "  nightly - Latest dev build from main (may be unstable)" -ForegroundColor Gray
Write-Host ""

$versionChoice = Select-GumMenu -Prompt "Select version:" -Options @("latest (recommended)", "nightly")

if ($versionChoice -match "nightly") {
    $STREAMHUB_TAG = "nightly"
} else {
    $STREAMHUB_TAG = "latest"
}

Write-Ok "StreamHub version: $STREAMHUB_TAG"

# -- 5. Database driver choice ----------------------------------------

Write-Step "[5/14] Database driver"

$DB_DRIVER_CHOICE = "sqlite"

$existingDbDriver = (Select-String -Path ".env" -Pattern "^DB_DRIVER=(.*)" -ErrorAction SilentlyContinue | Select-Object -First 1).Matches[0].Groups[1].Value

if ($existingDbDriver -and $existingDbDriver -ne "sqlite") {
    if ($script:HAS_GUM) {
        gum style --foreground "#FFD700" --border normal --border-foreground "#FFD700" --padding "0 1" --bold "Existing database driver: $existingDbDriver"
    } else {
        Write-Host "  Existing database driver: $existingDbDriver" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Choose your database driver:" -ForegroundColor White
Write-Host "  SQLite    - Zero config, file-based, recommended for most users" -ForegroundColor Gray
Write-Host "  PostgreSQL - Full-featured, requires more resources" -ForegroundColor Gray
Write-Host ""

$dbChoice = Select-GumMenu -Prompt "Select database driver:" -Options @("SQLite (recommended)", "PostgreSQL")

if ($dbChoice -match "PostgreSQL") {
    $DB_DRIVER_CHOICE = "postgres"
} else {
    $DB_DRIVER_CHOICE = "sqlite"
}

Write-Ok "Database driver: $DB_DRIVER_CHOICE"

if ($DB_DRIVER_CHOICE -eq "postgres") {
    $COMPOSE_FILE = "docker-compose.postgres.yml"
} else {
    $COMPOSE_FILE = "docker-compose.sqlite.yml"
}

if ($DB_DRIVER_CHOICE -eq "postgres") {
    $POSTGRES_PASSWORD = New-SecretPassword -Length 32
    Update-EnvFile "POSTGRES_PASSWORD" $POSTGRES_PASSWORD
    Write-Ok "PostgreSQL password generated"
}

# -- 6. Download docker-compose if needed ------------------------------

Write-Step "[6/14] Downloading $COMPOSE_FILE"

$COMPOSE_URL_BASE = "https://raw.githubusercontent.com/Nort1346/StreamHub/main"
$COMPOSE_TMP = Join-Path $env:TEMP "docker-compose.new.yml"

if (Test-Path $COMPOSE_FILE) {
    if ($script:HAS_GUM) {
        gum confirm --default=false "$COMPOSE_FILE already exists. Download latest version from GitHub?"
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Downloading $COMPOSE_FILE..."
            try {
                Invoke-WebRequest -Uri "$COMPOSE_URL_BASE/$COMPOSE_FILE" -OutFile $COMPOSE_TMP -UseBasicParsing 2>$null
                $currentHash = (Get-FileHash $COMPOSE_FILE -Algorithm SHA256).Hash
                $newHash = (Get-FileHash $COMPOSE_TMP -Algorithm SHA256).Hash
                if ($currentHash -ne $newHash) {
                    Write-Warn "$COMPOSE_FILE has changed"
                    Write-Host (Compare-Object (Get-Content $COMPOSE_FILE) (Get-Content $COMPOSE_TMP) | ForEach-Object {
                        $prefix = if ($_.SideIndicator -eq "<=") { "-" } else { "+" }
                        "$prefix $($_.InputObject)"
                    }) -ForegroundColor Yellow
                    Write-Host ""
                    gum confirm --default=false "Replace $COMPOSE_FILE with latest version?"
                    if ($LASTEXITCODE -eq 0) {
                        Copy-Item $COMPOSE_FILE "$COMPOSE_FILE.bak" -Force
                        Copy-Item $COMPOSE_TMP $COMPOSE_FILE -Force
                        Write-Ok "$COMPOSE_FILE updated (backup saved as $COMPOSE_FILE.bak)"
                    } else {
                        Write-Warn "Keeping existing $COMPOSE_FILE"
                    }
                } else {
                    Write-Ok "$COMPOSE_FILE is already up to date"
                }
            } catch {
                Write-Err "Failed to download $COMPOSE_FILE"
            }
        }
    } else {
        $answer = Read-Host "$COMPOSE_FILE already exists. Download latest version? (y/N)"
        if ($answer -match '^[Yy]$') {
            Write-Info "Downloading $COMPOSE_FILE..."
            try {
                Invoke-WebRequest -Uri "$COMPOSE_URL_BASE/$COMPOSE_FILE" -OutFile $COMPOSE_TMP -UseBasicParsing 2>$null
                $currentHash = (Get-FileHash $COMPOSE_FILE -Algorithm SHA256).Hash
                $newHash = (Get-FileHash $COMPOSE_TMP -Algorithm SHA256).Hash
                if ($currentHash -ne $newHash) {
                    Write-Warn "$COMPOSE_FILE has changed"
                    Write-Host (Compare-Object (Get-Content $COMPOSE_FILE) (Get-Content $COMPOSE_TMP) | ForEach-Object {
                        $prefix = if ($_.SideIndicator -eq "<=") { "-" } else { "+" }
                        "$prefix $($_.InputObject)"
                    })
                    Write-Host ""
                    $replace = Read-Host "Replace $COMPOSE_FILE with latest version? (y/N)"
                    if ($replace -match '^[Yy]$') {
                        Copy-Item $COMPOSE_FILE "$COMPOSE_FILE.bak" -Force
                        Copy-Item $COMPOSE_TMP $COMPOSE_FILE -Force
                        Write-Ok "$COMPOSE_FILE updated (backup saved as $COMPOSE_FILE.bak)"
                    } else {
                        Write-Warn "Keeping existing $COMPOSE_FILE"
                    }
                } else {
                    Write-Ok "$COMPOSE_FILE is already up to date"
                }
            } catch {
                Write-Err "Failed to download $COMPOSE_FILE"
            }
        }
    }
    Write-Ok "Using $COMPOSE_FILE"
} else {
    Write-Info "Downloading $COMPOSE_FILE..."
    Invoke-WebRequest -Uri "$COMPOSE_URL_BASE/$COMPOSE_FILE" -OutFile $COMPOSE_FILE
    Write-Ok "$COMPOSE_FILE downloaded"
}

if (Test-Path $COMPOSE_TMP) { Remove-Item $COMPOSE_TMP -Force -ErrorAction SilentlyContinue }

if ($STREAMHUB_TAG -eq "nightly") {
    $content = Get-Content $COMPOSE_FILE -Raw
    $content = $content -replace 'ghcr\.io/nort1346/streamhub:latest', 'ghcr.io/nort1346/streamhub:nightly'
    Set-Content -Path $COMPOSE_FILE -Value $content -NoNewline
    Write-Ok "Configured for nightly builds"
}

# -- 7. Start infrastructure services --------------------------------

Write-Step "[7/14] Starting infrastructure services"

$INFRA_SERVICES = @("redis", "qbittorrent", "prowlarr", "flaresolverr", "jellyfin", "dozzle")
if ($DB_DRIVER_CHOICE -eq "postgres") {
    $INFRA_SERVICES += "postgres"
}

Invoke-Spinner "Pulling images..." { docker compose -f $COMPOSE_FILE pull $INFRA_SERVICES 2>$null }

docker compose -f $COMPOSE_FILE up -d --remove-orphans $INFRA_SERVICES

$failedServices = @()
$psOutput = docker compose -f $COMPOSE_FILE ps --format json 2>$null
if ($psOutput) {
    foreach ($line in ($psOutput -split "`n")) {
        if (-not $line) { continue }
        try {
            $json = $line | ConvertFrom-Json
            if ($json.State -ne "running") {
                $failedServices += $json.Service
                $lastLog = docker compose -f $COMPOSE_FILE logs $json.Service --tail 3 2>&1 | Select-Object -Last 1
                Write-Warn "$($json.Service) failed to start: $lastLog"
            }
        } catch { }
    }
}

if ($failedServices -contains 'redis') {
    Write-Err "Redis failed to start. Cannot continue."
    exit 1
}
if ($failedServices -contains 'qbittorrent') {
    Write-Err "qBittorrent failed to start. Cannot continue."
    exit 1
}
if ($failedServices -contains 'postgres') {
    Write-Err "PostgreSQL failed to start. Cannot continue."
    exit 1
}

Write-Info "Waiting for Redis..."
Test-Port -Host_ "localhost" -Port 6379 -Timeout 30 | Out-Null

Write-Info "Waiting for qBittorrent..."
Test-Port -Host_ "localhost" -Port 8080 -Timeout 60 | Out-Null

Start-Sleep -Seconds 3

$QBIT_TEMP_PASS = docker logs streamhub-qbittorrent 2>&1 |
    Select-String 'A temporary password is provided for this session:' |
    ForEach-Object { ($_ -replace '.*A temporary password is provided for this session:\s*', '').Trim() } |
    Select-Object -First 1

if ($failedServices -notcontains 'prowlarr') {
    Write-Info "Waiting for Prowlarr..."
    Test-Port -Host_ "localhost" -Port 9900 -Timeout 60 | Out-Null
} else {
    Write-Warn "Prowlarr not running -- you can configure it later (step 8)"
}

if ($failedServices -notcontains 'jellyfin') {
    Write-Info "Waiting for Jellyfin..."
    Test-Port -Host_ "localhost" -Port 8096 -Timeout 90 | Out-Null
} else {
    Write-Warn "Jellyfin not running -- you can configure it later (step 6)"
}

Write-Ok "All infrastructure services are running"

if ($DB_DRIVER_CHOICE -eq "postgres") {
    Write-Info "Waiting for PostgreSQL..."
    Test-Port -Host_ "localhost" -Port 5432 -Timeout 30 | Out-Null
}

Write-Info "Waiting 10s for services to fully initialize..."
Start-Sleep -Seconds 10

# -- 5. Jellyfin API Key ----------------------------------------------

Write-Step "[8/14] Jellyfin API Key"

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

# -- 6. qBittorrent WebUI + API Key ------------------------------------

Write-Step "[9/14] qBittorrent WebUI + API Key"

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

Write-Host "Follow these steps to configure qBittorrent:" -ForegroundColor White
Write-Host "  1. Open http://localhost:8080 in your browser" -ForegroundColor Gray
Write-Host "  2. Login with:" -ForegroundColor Gray
Write-Host "       Username: admin" -ForegroundColor Yellow
Write-Host "       Password: [temporary password shown above]" -ForegroundColor Yellow
Write-Host "  3. Go to Tools > Options > Web UI" -ForegroundColor Gray
Write-Host "  4. Change the password to something you remember" -ForegroundColor Gray
Write-Host "  5. Save changes" -ForegroundColor Gray
Write-Host "  6. Go to Tools > Options > Web UI > API Key section" -ForegroundColor Gray
Write-Host "  7. Copy the API Key" -ForegroundColor Gray
Write-Host ""

$qbitKey = Read-GumInput -Placeholder "Paste your qBittorrent API Key (Enter to skip)"

if ($qbitKey) {
    Update-EnvFile "NUXT_QBITTORRENT_API_KEY" $qbitKey
    Write-Ok "qBittorrent API key saved"
} else {
    Write-Warn "Skipping qBittorrent API key -- set it later in .env"
}

# -- 7. Prowlarr API Key ----------------------------------------------

Write-Step "[10/14] Prowlarr API Key"

Write-Host ""
Write-Host "Follow these steps to get your Prowlarr API key:" -ForegroundColor White
Write-Host "  1. Open http://localhost:9900 in your browser" -ForegroundColor Gray
Write-Host "  2. Go to Settings > General" -ForegroundColor Gray
Write-Host "  3. Find the API Key field" -ForegroundColor Gray
Write-Host "  4. Copy the API key" -ForegroundColor Gray
Write-Host ""
Write-Host "Tip: You can also add indexers here ( torrent ) later." -ForegroundColor DarkGray
Write-Host ""
Write-Host "For private trackers: go to Settings > Indexers > Add > FlareSolverr" -ForegroundColor DarkGray
Write-Host "  Set URL: http://flaresolverr:8191" -ForegroundColor DarkGray
Write-Host ""

$prowlarrKey = Read-GumInput -Placeholder "Paste your Prowlarr API key (Enter to skip)"

if ($prowlarrKey) {
    Update-EnvFile "NUXT_PROWLARR_API_KEY" $prowlarrKey
    Write-Ok "Prowlarr API key saved"
} else {
    Write-Warn "Skipping Prowlarr API key -- set it later in .env"
}

# -- 8. TMDB API Key --------------------------------------------------

Write-Step "[11/14] TMDB API Key"

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

# -- 9. Discord Webhook (optional) ------------------------------------

Write-Step "[12/14] Discord Webhook (optional)"

Write-Host ""
Write-Host "Get notified when downloads complete." -ForegroundColor White
Write-Host "To set up a Discord webhook:" -ForegroundColor Gray
Write-Host "  1. Open your Discord server" -ForegroundColor Gray
Write-Host "  2. Go to Server Settings > Integrations > Webhooks" -ForegroundColor Gray
Write-Host '  3. Click "New Webhook"' -ForegroundColor Gray
Write-Host "  4. Name it, choose a channel, click Copy Webhook URL" -ForegroundColor Gray
Write-Host ""

$discordKey = Read-GumInput -Placeholder "Paste your Discord Webhook URL (Enter to skip)"

if ($discordKey) {
    Update-EnvFile "NUXT_DISCORD_WEBHOOK_URL" $discordKey
    Write-Ok "Discord webhook URL saved"
} else {
    Write-Warn "Skipping Discord webhook -- set it later in .env"
}

# -- 10. Pull StreamHub -----------------------------------------------

Write-Step "[13/14] Pulling StreamHub"

Invoke-Spinner "Pulling StreamHub image..." { docker compose -f $COMPOSE_FILE pull streamhub 2>$null }

if (-not (docker image inspect ghcr.io/nort1346/streamhub:$STREAMHUB_TAG 2>$null)) {
    Write-Err "Failed to pull StreamHub image. Check your network."
    Write-Err "You can also try manually: docker compose -f $COMPOSE_FILE pull streamhub"
    exit 1
}

Write-Ok "StreamHub image pulled"

# -- 10. Start StreamHub ----------------------------------------------

Write-Step "[14/14] Starting StreamHub"

Update-EnvFile "NUXT_JELLYFIN_URL" "http://jellyfin:8096"
Update-EnvFile "NUXT_REDIS_URL" "redis://redis:6379"
Update-EnvFile "NUXT_PROWLARR_URL" "http://prowlarr:9696"
Update-EnvFile "DB_DRIVER" $DB_DRIVER_CHOICE

if ($DB_DRIVER_CHOICE -eq "postgres") {
    Update-EnvFile "DATABASE_URL" "postgresql://streamhub:${POSTGRES_PASSWORD}@postgres:5432/streamhub"
}

docker compose -f $COMPOSE_FILE up -d streamhub 2>$null

Start-Sleep -Seconds 3
$streamhubUp = docker compose -f $COMPOSE_FILE ps streamhub 2>$null | Select-String "Up"
if (-not $streamhubUp) {
    Write-Err "StreamHub container is not running. Check logs:"
    Write-Err "  docker compose -f $COMPOSE_FILE logs streamhub"
    exit 1
}

Write-Info "Waiting for StreamHub to start (first start may take 1-2 minutes)..."
Test-Port -Host_ "localhost" -Port 5757 -Timeout 120 | Out-Null

Write-Ok "StreamHub is running at http://localhost:5757"

# -- Summary ----------------------------------------------------------

$dozzleUp = docker compose -f $COMPOSE_FILE ps dozzle 2>$null | Select-String "Up"
$hasDozzle = $dozzleUp -ne $null

# -- Header
$headerMsg = if ($script:HAS_GUM) { gum style --bold --foreground 2 'StreamHub is ready!' } else { 'StreamHub is ready!' }
Write-SummaryBox $headerMsg

Write-Host ""

# -- Services table
$services = @(
    (Get-SummaryRow "StreamHub" "http://localhost:5757"),
    (Get-SummaryRow "qBittorrent" "http://localhost:8080"),
    (Get-SummaryRow "Prowlarr" "http://localhost:9900"),
    (Get-SummaryRow "Jellyfin" "http://localhost:8096"),
    (Get-SummaryRow "FlareSolverr" "http://localhost:8191"),
    (Get-SummaryRow "Database" $DB_DRIVER_CHOICE)
)
if ($hasDozzle) {
    $services += (Get-SummaryRow "Dozzle" "http://localhost:8082")
}
$servicesMsg = $services -join "`n"
Write-SummarySection $servicesMsg

Write-Host ""

# -- Credentials
$credsLabel = "  Default StreamHub credentials: "
$credsValue = if ($script:HAS_GUM) { gum style --bold --foreground 11 'admin / admin' } else { 'admin / admin' }
Write-SummarySection "$credsLabel$credsValue (change after first login!)"

Write-Host ""

# -- Next steps
$steps = @(
    $(if ($script:HAS_GUM) { gum style --foreground 14 '  Next steps:' } else { '  Next steps:' }),
    $(if ($script:HAS_GUM) { gum style --foreground 14 '   1. Login with admin / admin -> Admin > Users' } else { '   1. Login with admin / admin -> Admin > Users' }),
    $(if ($script:HAS_GUM) { gum style --foreground 14 '   2. Jellyfin -> Add libraries: Movies (/media/Movies) and Series (/media/Series)' } else { '   2. Jellyfin -> Add libraries: Movies (/media/Movies) and Series (/media/Series)' }),
    $(if ($script:HAS_GUM) { gum style --foreground 14 '   3. Prowlarr -> Add indexers + FlareSolverr proxy' } else { '   3. Prowlarr -> Add indexers + FlareSolverr proxy' })
)
$stepsMsg = $steps -join "`n"
Write-SummarySection $stepsMsg
