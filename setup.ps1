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

function Test-GumUsable {
    # gum prompts are TUIs: they only render in a real terminal and need
    # v0.12.0+ (gum log). On any failure we fall back to plain output.
    if (-not (Get-Command gum -ErrorAction SilentlyContinue)) { return $false }
    if ([System.Console]::IsInputRedirected) { return $false }
    if ([System.Console]::IsOutputRedirected) { return $false }
    if ($env:NO_COLOR) { return $false }
    if ($env:TERM -eq "dumb") { return $false }
    try {
        $verRaw = (gum --version 2>$null) -join " "
        if ($verRaw -match '(\d+\.\d+\.\d+)') {
            return ([version]$Matches[1]) -ge ([version]"0.12.0")
        }
    } catch {
        # version check failed
    }
    return $false
}

function Install-Gum {
    if (Test-GumUsable) {
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
        # Fallback: official release binary. gum publishes exact-version
        # assets only (no "latest" alias, no glob), so resolve the tag first.
        $arch = switch ($env:PROCESSOR_ARCHITECTURE) {
            "ARM64" { "x86_64" }
            default { "x86_64" }
        }
        try {
            $tag = (Invoke-RestMethod -Uri "https://api.github.com/repos/charmbracelet/gum/releases/latest").tag_name
            $url = "https://github.com/charmbracelet/gum/releases/download/$tag/gum_$($tag.TrimStart('v'))_Windows_${arch}.zip"
            $tmp = Join-Path $env:TEMP "gum-download"
            New-Item -ItemType Directory -Path $tmp -Force | Out-Null
            $zip = Join-Path $tmp "gum.zip"
            Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
            Expand-Archive -Path $zip -DestinationPath $tmp -Force
            $gumExe = Get-ChildItem -Path $tmp -Filter "gum.exe" -Recurse | Select-Object -First 1
            if ($gumExe) {
                $destDir = Join-Path $env:LOCALAPPDATA "Programs\gum"
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                Copy-Item $gumExe.FullName (Join-Path $destDir "gum.exe") -Force
                $env:Path = "$destDir;$env:Path"
            }
        }
        catch {
            Write-Host "Could not install gum automatically - continuing without it."
        }
        finally {
            Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
        }
    }

    $gumCmd = Get-Command gum -ErrorAction SilentlyContinue
    if ($gumCmd) {
        $script:HAS_GUM = Test-GumUsable
        if (-not $script:HAS_GUM) {
            Write-Host "gum cannot render prompts in this terminal - using plain output." -ForegroundColor Yellow
        }
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
        Write-Host ""
        gum style --bold $Msg
    } else {
        Write-Host ""
        Write-Host $Msg -ForegroundColor White
        Write-Host ""
    }
}

function Write-Step {
    param([string]$Msg)
    if ($script:HAS_GUM) {
        Write-Host ""
        gum style --bold --foreground cyan $Msg
    } else {
        Write-Host ""
        Write-Host $Msg -ForegroundColor Cyan
    }
}

function Write-Dim {
    param([string]$Msg)
    if ($script:HAS_GUM) {
        gum style --foreground 14 $Msg
    } else {
        Write-Host $Msg -ForegroundColor DarkGray
    }
}

function Write-Callout {
    param([string]$Title, [string]$Body)
    if ($script:HAS_GUM) {
        gum style --bold --foreground 11 $Title
        gum style --foreground 14 $Body
    } else {
        Write-Host $Title -ForegroundColor Yellow
        Write-Host $Body -ForegroundColor DarkGray
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
        while ($true) {
            $choice = Read-Host "Enter choice [1-$($Options.Count)]"
            $num = [int]$choice - 1
            if ($choice -match '^\d+$' -and $num -ge 0 -and $num -lt $Options.Count) {
                return $Options[$num]
            }
            Write-Host "  Invalid choice. Please enter a number between 1 and $($Options.Count)." -ForegroundColor Yellow
        }
    }
}

# -- Self-update check --------------------------------------------------

$REPO_RAW = "https://raw.githubusercontent.com/Nort1346/StreamHub/main"
$SETUP_URL = "$REPO_RAW/setup.ps1"
$SETUP_NEW = Join-Path $env:TEMP "setup.ps1.new"
$SETUP_SELF = $MyInvocation.MyCommand.Path

try {
    Invoke-WebRequest -Uri $SETUP_URL -OutFile $SETUP_NEW -UseBasicParsing 2>$null
    # $LASTEXITCODE is not set by cmdlets like Invoke-WebRequest, and
    # $SETUP_SELF is empty when the script is piped via irm | iex.
    if ($SETUP_SELF -and (Test-Path $SETUP_NEW)) {
        $currentHash = (Get-FileHash $SETUP_SELF -Algorithm SHA256).Hash
        $newHash = (Get-FileHash $SETUP_NEW -Algorithm SHA256).Hash
        if ($currentHash -ne $newHash) {
            Write-Host ""
            if ($script:HAS_GUM) {
                gum style --foreground 11 --bold "A newer version of setup.ps1 is available."
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
Write-Dim "This will set up StreamHub and all required services."
Write-Dim "All data will be stored in Docker volumes."
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
    Write-Err "Docker is not installed."
    Write-Host "  Install Docker Desktop for Windows:" -ForegroundColor Yellow
    Write-Host "    https://docs.docker.com/desktop/windows-install/" -ForegroundColor Cyan
    exit 1
}
Write-Ok "Docker $((docker --version) -replace '.*version ([^ ,]+).*', '$1')"

$dockerInfo = docker info 2>&1 | ForEach-Object { $_.ToString() }
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker daemon is not running or not reachable from this shell."
    # docker info prints the whole client section before the failure -
    # show only the error lines (fall back to the last lines).
    $dockerErrLines = @($dockerInfo | Where-Object { $_ -match 'failed to connect|cannot connect|permission denied|connection refused|cannot find the file' } | Select-Object -First 3)
    if (-not $dockerErrLines) { $dockerErrLines = @($dockerInfo | Select-Object -Last 3) }
    foreach ($line in $dockerErrLines) { Write-Host "    $line" }
    Write-Host "  Start Docker Desktop (WSL2 backend) and try again." -ForegroundColor Yellow
    exit 1
}
Write-Ok "Docker daemon running"

try {
    $composeVersion = docker compose version 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose not found" }
} catch {
    Write-Err "Docker Compose plugin is not installed."
    Write-Host "  Install or update Docker Desktop (includes Compose):" -ForegroundColor Yellow
    Write-Host "    https://docs.docker.com/get-docker/" -ForegroundColor Cyan
    exit 1
}
Write-Ok "Docker Compose available"

if (-not (Get-Command curl -ErrorAction SilentlyContinue)) {
    Write-Err "curl is not installed."
    Write-Host "  On Windows 10+ curl is built-in." -ForegroundColor Yellow
    Write-Host "  If missing, download from: https://curl.se/windows/" -ForegroundColor Yellow
    exit 1
}
Write-Ok "curl available"

# -- 2. Create .env ---------------------------------------------------

Write-Step "[2/14] Setting up .env file"

if (-not (Test-Path .env)) {
    if (-not (Test-Path .env.example)) {
        Write-Info "Downloading .env.example from GitHub..."
        try {
            Invoke-WebRequest -Uri "$REPO_RAW/.env.example" -OutFile .env.example -UseBasicParsing 2>$null
        } catch {
            Write-Err "Failed to download .env.example"
            exit 1
        }
    }
    Copy-Item .env.example .env
    Write-Ok "Created .env from .env.example"
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

if (-not $script:HAS_GUM) {
    Write-Host ""
    Write-Host "Which StreamHub image do you want to use?" -ForegroundColor White
    Write-Dim "  latest  - Stable release (recommended)"
    Write-Dim "  nightly - Latest dev build from main (may be unstable)"
    Write-Host ""
}

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

$dbLine = Select-String -Path ".env" -Pattern "^DB_DRIVER=(.*)" -ErrorAction SilentlyContinue | Select-Object -First 1
$existingDbDriver = if ($dbLine) { $dbLine.Matches[0].Groups[1].Value } else { "" }

if ($existingDbDriver -and $existingDbDriver -ne "sqlite") {
    if ($script:HAS_GUM) {
        gum style --foreground 11 --bold "Existing database driver: $existingDbDriver"
    } else {
        Write-Host "  Existing database driver: $existingDbDriver" -ForegroundColor Yellow
    }
}

if (-not $script:HAS_GUM) {
    Write-Host ""
    Write-Host "Choose your database driver:" -ForegroundColor White
    Write-Dim "  SQLite    - Zero config, file-based, recommended for most users"
    Write-Dim "  PostgreSQL - Full-featured, requires more resources"
    Write-Host ""
}

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

$COMPOSE_TMP = Join-Path $env:TEMP "docker-compose.new.yml"

if (Test-Path $COMPOSE_FILE) {
    if ($script:HAS_GUM) {
        gum confirm --default=false "$COMPOSE_FILE already exists. Download latest version from GitHub?"
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Downloading $COMPOSE_FILE..."
            try {
                Invoke-WebRequest -Uri "$REPO_RAW/$COMPOSE_FILE" -OutFile $COMPOSE_TMP -UseBasicParsing 2>$null
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
                Invoke-WebRequest -Uri "$REPO_RAW/$COMPOSE_FILE" -OutFile $COMPOSE_TMP -UseBasicParsing 2>$null
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
    try {
        Invoke-WebRequest -Uri "$REPO_RAW/$COMPOSE_FILE" -OutFile $COMPOSE_FILE -UseBasicParsing
    } catch {
        Write-Err "Failed to download $COMPOSE_FILE from GitHub."
        Write-Host "  Check your internet connection and try again." -ForegroundColor Yellow
        exit 1
    }
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

Write-Info "Pulling images..."
docker compose -f $COMPOSE_FILE pull $INFRA_SERVICES

docker compose -f $COMPOSE_FILE up -d --remove-orphans $INFRA_SERVICES

# `ps -q` is stable across Compose versions (the JSON output format
# changed in Compose 2.21, so it is not used for state checks).
$failedServices = @()
foreach ($svc in $INFRA_SERVICES) {
    $svcId = docker compose -f $COMPOSE_FILE ps -q $svc 2>$null
    if (-not $svcId) {
        $failedServices += $svc
        $lastLog = docker compose -f $COMPOSE_FILE logs $svc --tail 3 2>&1 | Select-Object -Last 1
        Write-Warn "$svc failed to start: $lastLog"
    }
}

if ($failedServices -contains 'redis') {
    Write-Err "Redis failed to start. Cannot continue."
    Write-Host "  Check logs: docker compose -f $COMPOSE_FILE logs redis" -ForegroundColor Yellow
    exit 1
}
if ($failedServices -contains 'qbittorrent') {
    Write-Err "qBittorrent failed to start. Cannot continue."
    Write-Host "  Check logs: docker compose -f $COMPOSE_FILE logs qbittorrent" -ForegroundColor Yellow
    exit 1
}
if ($failedServices -contains 'postgres') {
    Write-Err "PostgreSQL failed to start. Cannot continue."
    Write-Host "  Check logs: docker compose -f $COMPOSE_FILE logs postgres" -ForegroundColor Yellow
    exit 1
}

Write-Info "Waiting for Redis..."
Test-Port -Host_ "localhost" -Port 6379 -Timeout 30 | Out-Null

Write-Info "Waiting for qBittorrent..."
Test-Port -Host_ "localhost" -Port 8080 -Timeout 60 | Out-Null

Start-Sleep -Seconds 3

$QBIT_TEMP_PASS = docker compose -f $COMPOSE_FILE logs qbittorrent 2>&1 |
    Select-String 'A temporary password is provided for this session:' |
    ForEach-Object { ($_ -replace '.*A temporary password is provided for this session:\s*', '').Trim() } |
    Select-Object -First 1

if ($failedServices -notcontains 'prowlarr') {
    Write-Info "Waiting for Prowlarr..."
    Test-Port -Host_ "localhost" -Port 9900 -Timeout 60 | Out-Null
} else {
    Write-Warn "Prowlarr not running -- you can configure it later (step 10)"
}

if ($failedServices -notcontains 'jellyfin') {
    Write-Info "Waiting for Jellyfin..."
    Test-Port -Host_ "localhost" -Port 8096 -Timeout 90 | Out-Null
} else {
    Write-Warn "Jellyfin not running -- you can configure it later (step 8)"
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
Write-Dim "  1. Open http://localhost:8096 in your browser"
Write-Dim "  2. Complete the setup wizard (create your admin account)"
Write-Dim "  3. Go to Dashboard (gear icon) > API Keys"
Write-Dim '  4. Click "+", name it "StreamHub", click OK'
Write-Dim "  5. Copy the generated API key"
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
    Write-Host "qBittorrent temporary password: $QBIT_TEMP_PASS" -ForegroundColor Yellow
    Write-Dim "Copy this - you will need it below"
    Write-Host ""
} else {
    Write-Warn "Could not extract qBittorrent temp password - check: docker compose -f $COMPOSE_FILE logs qbittorrent"
}

Write-Host "Follow these steps to configure qBittorrent:" -ForegroundColor White
Write-Dim "  1. Open http://localhost:8080 in your browser"
Write-Dim "  2. Login with:"
Write-Dim "       Username: admin"
Write-Dim "       Password: [temporary password shown above]"
Write-Dim "  3. Go to Tools > Options > Web UI"
Write-Dim "  4. Change the password to something you remember"
Write-Dim "  5. Save changes"
Write-Dim "  6. Go to Tools > Options > Web UI > API Key section"
Write-Dim "  7. Copy the API Key"
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
Write-Dim "  1. Open http://localhost:9900 in your browser"
Write-Dim "  2. Go to Settings > General"
Write-Dim "  3. Find the API Key field"
Write-Dim "  4. Copy the API key"
Write-Host ""
Write-Callout "IMPORTANT: Prowlarr needs indexers before StreamHub can find anything." (@(
    "  1. Add at least one indexer (e.g. YTS): Settings > Indexers > Add",
    "  2. For private trackers: Settings > Indexers > Add > FlareSolverr",
    "     Set URL: http://flaresolverr:8191"
) -join "`n")
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
Write-Dim "  1. Go to https://www.themoviedb.org/settings/api"
Write-Dim "  2. Create a free account (or log in)"
Write-Dim '  3. Click "Click here to generate an API key"'
Write-Dim "  4. Fill in the form:"
Write-Dim "       Application Name:  StreamHub"
Write-Dim "       Application URL:   http://localhost:5757"
Write-Dim "  5. Copy your API Key (v3 auth)"
Write-Host ""
Write-Dim "This is required for movie/TV metadata."
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
Write-Dim "Get notified when downloads complete."
Write-Host "To set up a Discord webhook:" -ForegroundColor Gray
Write-Dim "  1. Open your Discord server"
Write-Dim "  2. Go to Server Settings > Integrations > Webhooks"
Write-Dim '  3. Click "New Webhook"'
Write-Dim "  4. Name it, choose a channel, click Copy Webhook URL"
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

Write-Info "Pulling StreamHub image..."
docker compose -f $COMPOSE_FILE pull streamhub

if (-not (docker image inspect "ghcr.io/nort1346/streamhub:$STREAMHUB_TAG" 2>$null)) {
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
$streamhubId = docker compose -f $COMPOSE_FILE ps -q streamhub 2>$null
if (-not $streamhubId) {
    Write-Err "StreamHub container is not running. Check logs:"
    Write-Err "  docker compose -f $COMPOSE_FILE logs streamhub"
    exit 1
}

Write-Info "Waiting for StreamHub to start (first start may take 1-2 minutes)..."
Test-Port -Host_ "localhost" -Port 5757 -Timeout 120 | Out-Null

Write-Ok "StreamHub is running at http://localhost:5757"

# -- Extract admin password from logs ---------------------------------

$adminPass = $null
for ($retry = 1; $retry -le 5; $retry++) {
    $adminPass = docker compose -f $COMPOSE_FILE logs --no-color --tail 200 streamhub 2>&1 |
        Select-String 'Admin password:' |
        ForEach-Object { if ($_ -match 'Admin password: ([^"]+)') { $matches[1].Trim() } } |
        Select-Object -First 1
    if ($adminPass) { break }
    Start-Sleep -Seconds 2
}

# -- Summary ----------------------------------------------------------

$hasDozzle = [bool](docker compose -f $COMPOSE_FILE ps -q dozzle 2>$null)

Write-Host ""
Write-Host "StreamHub is ready!" -ForegroundColor Green
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
if ($DB_DRIVER_CHOICE -eq "postgres") {
    $services += (Get-SummaryRow "PostgreSQL" "localhost:5432 / streamhub")
}
if ($hasDozzle) {
    $services += (Get-SummaryRow "Dozzle" "http://localhost:8082")
}
$servicesMsg = $services -join "`n"
Write-SummarySection $servicesMsg

Write-Host ""

# -- Credentials
$credsUser = if ($script:HAS_GUM) { gum style --bold --foreground 11 'admin' } else { 'admin' }
Write-Host "Username: $credsUser"
if ($adminPass) {
    $credsPass = if ($script:HAS_GUM) { gum style --bold --foreground 11 $adminPass } else { $adminPass }
    Write-Host "Password: $credsPass"
} else {
    Write-Dim "Password: check 'docker compose -f $COMPOSE_FILE logs streamhub'"
}
Write-Dim "Change this password after first login."

Write-Host ""

# -- Required before first use
Write-Callout "Required before first use:" (@(
    "  Prowlarr has no indexers yet - StreamHub cannot find torrents until you add them.",
    "  Open http://localhost:9900 and add at least one indexer (e.g. YTS).",
    "  For private trackers: Settings > Indexers > Add > FlareSolverr, URL: http://flaresolverr:8191"
) -join "`n")
