<#
.SYNOPSIS
    Lode Auto-Setup Script for Windows
.DESCRIPTION
    Sets up Lode with the services you choose. The Docker stack is split
    into a base compose file (Lode + Redis) plus per-service overlays
    (postgres, qbittorrent, prowlarr, jellyfin, flaresolverr, dozzle).
    This script downloads the files that match your selection and starts
    them with `docker compose -f <base> -f <overlay>...`, so the compose
    files stay small, readable, and usable manually.

    Your selection is saved in .lode-setup so re-runs can prefill
    the prompts; .env keeps all secrets and URLs.
.EXAMPLE
    .\setup.ps1
#>

$ErrorActionPreference = "Continue"

# -- Keep window open on exit ----------------------------------------
# When the script runs in a console window that closes when the script
# exits (double-click, Start Menu launch, Windows Terminal, VS Code, RDP),
# the window vanishes before the user can read the summary or any error.
# Walk the parent chain to detect that; set SETUP_PAUSE so Stop-Setup
# waits for Enter before exiting.

function Test-TransientWindow {
    $transient = @('explorer.exe', 'conhost.exe', 'openconsole.exe', 'WindowsTerminal.exe', 'Code.exe')
    $passthrough = @('cmd.exe', 'conhost.exe', 'openconsole.exe')
    try {
        $id = $PID
        for ($i = 0; $i -lt 6; $i++) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $id"
            if (-not $proc -or -not $proc.ParentProcessId) { break }
            $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.ParentProcessId)"
            if (-not $parent) { break }
            if ($transient -contains $parent.Name) { return $true }
            if ($passthrough -notcontains $parent.Name) { return $false }
            $id = $proc.ParentProcessId
        }
    } catch {
        # Process info unavailable - assume the window will close so the
        # user keeps the output
        return $true
    }
    return $false
}

if (Test-TransientWindow) {
    $env:SETUP_PAUSE = 1
}

# A file run (powershell -File, double-click) is its own process, so exit
# is safe. A piped run (irm | iex) executes inside the user's session,
# where exit would kill the whole terminal - always pause first so the
# result is readable.
$script:IsScriptFile = [bool]$MyInvocation.MyCommand.Path

function Stop-Setup {
    param([int]$Code = 0)
    if ($env:SETUP_PAUSE) {
        Write-Host ""
        Read-Host "Press Enter to continue" | Out-Null
    }
    exit $Code
}

# -- Constants --------------------------------------------------------

$REPO_RAW = "https://raw.githubusercontent.com/Nort1346/Lode/main"
$SETUP_URL = "$REPO_RAW/setup.ps1"
$SETUP_NEW = Join-Path $env:TEMP "setup.ps1.new"
$SETUP_SELF = $MyInvocation.MyCommand.Path

$COMPOSE_BASE = "docker-compose.yml"
$script:STATE_FILE = ".lode-setup"
# Legacy state file name (pre-rename) - migrate it once on re-run.
if (-not (Test-Path $script:STATE_FILE) -and (Test-Path ".lode-setup.json")) {
    Rename-Item ".lode-setup.json" ".lode-setup"
}
$script:COMPOSE_FILES = @()

# Option labels (also used for --selected prefill, so keep them stable)
$QBIT_OPT_LOCAL = "Local qBittorrent container (recommended)"
$QBIT_OPT_EXTERNAL = "External qBittorrent (you host it)"
$PROWLARR_OPT_LOCAL = "Local Prowlarr container (recommended)"
$PROWLARR_OPT_EXTERNAL = "External Prowlarr (you host it)"
$MEDIA_OPT_JELLYFIN_LOCAL = "Jellyfin (local container)"
$MEDIA_OPT_JELLYFIN_EXTERNAL = "Jellyfin (external)"
$MEDIA_OPT_NONE = "No media server"
$ADDON_OPT_FLARESOLVERR = "FlareSolverr - CAPTCHA bypass for private trackers"
$ADDON_OPT_DOZZLE = "Dozzle - Docker log viewer"

# Captured before .env is created in step 2: a pre-existing .env without
# a state file means the old all-or-nothing installer was used.
$script:LEGACY_INSTALL = $false
if ((Test-Path ".env") -and -not (Test-Path $script:STATE_FILE)) {
    $script:LEGACY_INSTALL = $true
}

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
        scoop install charm-gum
    }
    else {
        # Fallback: official release binary. gum publishes exact-version
        # assets only (no "latest" alias, no glob), so resolve the tag
        # first. Windows assets exist for x86_64 and i386 only - ARM64
        # runs the x86_64 binary through WoW64 emulation.
        $arch = "x86_64"
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

    # winget/scoop update the persistent PATH, but this process still
    # holds the PATH from startup - merge the fresh machine+user values
    # into the current session PATH (replacing it would drop entries
    # added by the current shell).
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @()
    foreach ($entry in (($env:Path + ';' + $machinePath + ';' + $userPath) -split ';')) {
        if ($entry -and $entries -notcontains $entry) { $entries += $entry }
    }
    $env:Path = $entries -join ';'

    $gumCmd = Get-Command gum -ErrorAction SilentlyContinue
    if ($gumCmd) {
        $script:HAS_GUM = Test-GumUsable
        if (-not $script:HAS_GUM) {
            Write-Host "gum cannot render prompts in this terminal - using plain output." -ForegroundColor Yellow
        }
    }
}

Install-Gum

# -- Hyperlinks (OSC 8) ------------------------------------------------
# OSC 8 is emitted unconditionally for http(s) URLs. ECMA-48-compliant
# terminals ignore unknown OSC sequences. This is deliberately separate
# from SGR color support: NO_COLOR / TERM=dumb affect colors only.

$script:VT_ENABLED = $false
$script:ConsoleNative = $null

function Enable-VirtualTerminalProcessing {
    if ($script:VT_ENABLED) { return $true }

    if ($env:OS -eq "Windows_NT") {
        if (-not $script:ConsoleNative) {
            try {
                Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class LodeSetupConsoleNative
{
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
}
'@ -ErrorAction Stop
                $script:ConsoleNative = [LodeSetupConsoleNative]
            } catch {
                return $false
            }
        }

        try {
            $handle = $script:ConsoleNative::GetStdHandle(-11)
            $mode = [uint32]0
            if ($script:ConsoleNative::GetConsoleMode($handle, [ref]$mode)) {
                [void]$script:ConsoleNative::SetConsoleMode($handle, $mode -bor 0x4)
                $script:VT_ENABLED = $true
            }
        } catch {
            # Leave VT disabled; hyperlink output falls back to plain text.
        }
    } else {
        $script:VT_ENABLED = $true
    }

    return $script:VT_ENABLED
}

function Get-Hyperlink {
    param([string]$Url, [string]$Label = '')
    $urlOnly = [string]::IsNullOrWhiteSpace($Label) -or $Label -eq $Url
    if ($urlOnly) { $Label = $Url }

    if ($Url -match '^https?://') {
        $esc = [char]27
        $bs = [char]92
        return "${esc}]8;;${Url}${esc}${bs}${Label}${esc}]8;;${esc}${bs}"
    }

    if ($urlOnly) { return $Url }
    return "${Label}: ${Url}"
}

function Write-RawLine {
    param([string]$Msg)
    [void](Enable-VirtualTerminalProcessing)
    [Console]::Out.Write("${Msg}`n")
}

# -- Output helpers ---------------------------------------------------

function Write-Info {
    param([string]$Msg)
    $esc = [char]27
    if ($Msg.Contains("${esc}]8")) {
        Write-RawLine "[INFO]  $Msg"
        return
    }
    if ($script:HAS_GUM) { gum log --level info $Msg } else { Write-Host "[INFO]  $Msg" -ForegroundColor Blue }
}

function Write-Ok {
    param([string]$Msg)
    $esc = [char]27
    if ($Msg.Contains("${esc}]8")) {
        Write-RawLine "[ OK ]  $Msg"
        return
    }
    if ($script:HAS_GUM) { gum log --level info $Msg } else { Write-Host "[ OK ]  $Msg" -ForegroundColor Green }
}

function Write-Warn {
    param([string]$Msg)
    $esc = [char]27
    if ($Msg.Contains("${esc}]8")) {
        Write-RawLine "[WARN]  $Msg"
        return
    }
    if ($script:HAS_GUM) { gum log --level warn $Msg } else { Write-Host "[WARN]  $Msg" -ForegroundColor Yellow }
}

function Write-Err {
    param([string]$Msg)
    $esc = [char]27
    if ($Msg.Contains("${esc}]8")) {
        Write-RawLine "[ERR ]  $Msg"
        return
    }
    if ($script:HAS_GUM) { gum log --level error $Msg } else { Write-Host "[ERR ]  $Msg" -ForegroundColor Red }
}

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
    $esc = [char]27
    if ($Msg.Contains("${esc}]8")) {
        Write-RawLine $Msg
        return
    }
    if ($script:HAS_GUM) {
        gum style --foreground 14 $Msg
    } else {
        Write-Host $Msg -ForegroundColor DarkGray
    }
}

function Write-Callout {
    param([string]$Title, [string]$Body)
    $esc = [char]27
    if ($Body.Contains("${esc}]8")) {
        Write-RawLine $Title
        Write-RawLine $Body
        return
    }
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
    $esc = [char]27
    if ($Msg.Contains("${esc}]8")) {
        Write-RawLine $Msg
        return
    }
    if ($script:HAS_GUM) {
        gum style --border normal --border-foreground 240 --padding "0 2" $Msg
    } else {
        Write-Host $Msg -ForegroundColor Gray
    }
}

function Get-SummaryRow {
    param([string]$Label, [string]$Url)
    return ("  {0,-18} {1}" -f $Label, (Get-Hyperlink $Url))
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
    $line = Select-String -Path ".env" -Pattern "^$([regex]::Escape($Key))=(.*)" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) {
        $value = $line.Matches[0].Groups[1].Value
        return $value.Length -ge $MinLength
    }
    return $false
}

function Read-EnvValue {
    param([string]$Key)
    $line = Select-String -Path ".env" -Pattern "^$([regex]::Escape($Key))=(.*)" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) { return $line.Matches[0].Groups[1].Value }
    return ""
}

function Test-UrlValue {
    param([string]$Url)
    return ($Url -match '^https?://')
}

# Returns the current .env value unless it is the internal (in-network)
# URL, which is not a useful default for an external instance.
function Get-ExternalUrlDefault {
    param([string]$EnvKey, [string]$InternalUrl)
    $v = Read-EnvValue $EnvKey
    if ($v -and $v -ne $InternalUrl) { return $v }
    return ""
}

function Test-Port {
    param([string]$Host_, [int]$Port, [int]$Timeout = 60, [int]$Interval = 2)
    try {
        $ips = [System.Net.Dns]::GetHostAddresses($Host_)
    }
    catch {
        Write-Err "Could not resolve host: ${Host_}"
        return $false
    }
    $maxAttempts = [Math]::Max(1, [Math]::Floor($Timeout / $Interval))
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        $connected = $false
        foreach ($ip in $ips) {
            $client = $null
            try {
                $client = New-Object System.Net.Sockets.TcpClient
                $ar = $client.BeginConnect($ip, $Port, $null, $null)
                # Bound the wait: a refused port fails fast, a dropped one does not
                if ($ar.AsyncWaitHandle.WaitOne(2000)) {
                    try {
                        $client.EndConnect($ar)
                        $connected = $client.Connected
                    }
                    catch {
                        # connection failed
                    }
                }
            }
            catch { }
            finally {
                if ($client) { $client.Close() }
            }
            if ($connected) { break }
        }
        if ($connected) { return $true }
        if ($attempt -lt $maxAttempts) {
            Write-Dim "Waiting for ${Host_}:${Port}... ($attempt/$maxAttempts)"
            Start-Sleep -Seconds $Interval
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
    # Escape $ so values like "a$b1" survive -replace (where $1 is a group ref)
    $replacement = ("$Key=$Value").Replace('$', '$$')

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

# -- State file (selection memory for re-runs) ------------------------
# Flat key=value file - no JSON parser needed in PowerShell or bash.
# Only selection state lives here; secrets and URLs stay in .env.

function Get-StateValue {
    param([string]$Key)
    if (-not (Test-Path $script:STATE_FILE)) { return $null }
    $line = Select-String -Path $script:STATE_FILE -Pattern "^$([regex]::Escape($Key))=(.*)" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) { return $line.Matches[0].Groups[1].Value }
    return $null
}

function Write-StateFile {
    $lines = @(
        "version=1",
        "dbDriver=$DB_DRIVER_CHOICE",
        "imageTag=$LODE_TAG",
        "qbittorrent=$QBIT_MODE",
        "prowlarr=$PROWLARR_MODE",
        "mediaProvider=$MEDIA_PROVIDER",
        "mediaMode=$MEDIA_MODE",
        "flaresolverr=$(if ($USE_FLARESOLVERR) { 'true' } else { 'false' })",
        "dozzle=$(if ($USE_DOZZLE) { 'true' } else { 'false' })"
    )
    # Temp file + rename: an interrupted run (Ctrl+C, kill, closed terminal) can never leave a corrupt state file behind.
    $tmp = "$($script:STATE_FILE).tmp"
    try {
        Set-Content -Path $tmp -Value (($lines -join "`n") + "`n") -NoNewline
        Move-Item -Path $tmp -Destination $script:STATE_FILE -Force
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

# -- Compose file helpers ---------------------------------------------

# Every docker compose call takes the -f file list built in the
# selection step, so it stays in one place.
function Get-DcFileArgs {
    if (-not $script:COMPOSE_FILES.Count) {
        Write-Err "No compose files selected - internal error."
        Stop-Setup 1
    }
    $args_ = @()
    foreach ($f in $script:COMPOSE_FILES) { $args_ += @('-f', $f) }
    return $args_
}

function Get-DcCommandPrefix {
    $parts = @()
    foreach ($f in $script:COMPOSE_FILES) { $parts += "-f $f" }
    return "docker compose " + ($parts -join " ")
}

# Pre-split compose files defined every service inline. The new postgres
# overlay only defines postgres, so a qbittorrent service block marks a
# file as a legacy monolith.
function Test-LegacyMonolith {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $content = Get-Content $Path -Raw
    return ($content -match '(?m)^  qbittorrent:\s*$')
}

# On re-runs, a service that used to be deployed locally but is no longer
# selected leaves a stopped container behind (we never use
# --remove-orphans). Confirm, then stop and remove the container; its
# volume is kept so switching back keeps all data.
function Remove-DeselectedService {
    param([string]$Service, [string]$StateKey, [string]$ActiveValue, [string]$CurrentValue)
    $oldValue = Get-StateValue $StateKey
    if ($oldValue -ne $ActiveValue) { return }
    if ($CurrentValue -eq $ActiveValue) { return }
    $container = "lode-$Service"
    $running = docker ps -q --filter ('name=^' + $container + '$') 2>$null
    if (-not $running) { return }
    $keep = $true
    $msg = "$container is no longer selected. Stop and remove the container? (its volume is kept)"
    if ($script:HAS_GUM) {
        gum confirm --default=true $msg | Out-Null
        if ($LASTEXITCODE -ne 0) { $keep = $false }
    } else {
        $answer = Read-Host "$msg [Y/n]"
        if ($answer -match '^[Nn]') { $keep = $false }
    }
    if ($keep) {
        docker stop $container 2>$null | Out-Null
        docker rm $container 2>$null | Out-Null
        Write-Ok "Removed $container (volume kept)"
    } else {
        Write-Warn "Keeping $container - remove it manually with: docker rm $container"
    }
}

# -- Prompt helpers (gum-aware) ----------------------------------------

function Read-GumInput {
    param([string]$Placeholder)
    if ($script:HAS_GUM) {
        return gum input --placeholder $Placeholder
    }
    return Read-Host $Placeholder
}

function Read-GumInputDefault {
    param([string]$Placeholder, [string]$Default)
    if ($script:HAS_GUM) {
        if ($Default) {
            return gum input --value $Default --placeholder $Placeholder
        }
        return gum input --placeholder $Placeholder
    }
    $prompt = $Placeholder
    if ($Default) { $prompt = "$Placeholder [$Default]" }
    $result = Read-Host $prompt
    if (-not $result) { return $Default }
    return $result
}

function ConvertFrom-SecureStringPlaintext {
    param([System.Security.SecureString]$Secure)
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

# Masked input for API keys (gum --password, SecureString fallback).
function Read-GumPassword {
    param([string]$Placeholder)
    if ($script:HAS_GUM) {
        return gum input --password --placeholder $Placeholder
    }
    $secure = Read-Host $Placeholder -AsSecureString
    return ConvertFrom-SecureStringPlaintext $secure
}

function Select-GumMenu {
    param([string]$Prompt, [string[]]$Options, [string]$Preselect = "")
    if ($script:HAS_GUM) {
        $gumArgs = @('choose', '--header', $Prompt)
        if ($Preselect -and ($Options -contains $Preselect)) {
            $gumArgs += @('--selected', $Preselect)
        }
        return gum @gumArgs $Options
    }
    # Plain numbered menu; the preselected option is the default answer.
    $default = 1
    for ($i = 0; $i -lt $Options.Count; $i++) {
        if ($Preselect -and $Options[$i] -eq $Preselect) { $default = $i + 1; break }
    }
    Write-Host $Prompt
    for ($i = 0; $i -lt $Options.Count; $i++) {
        Write-Host "  $($i + 1)) $($Options[$i])"
    }
    while ($true) {
        $choice = Read-Host "Enter choice [1-$($Options.Count)] (default $default)"
        if (-not $choice) { $choice = "$default" }
        if ($choice -match '^\d+$') {
            $num = [int]$choice - 1
            if ($num -ge 0 -and $num -lt $Options.Count) {
                return $Options[$num]
            }
        }
        Write-Host "  Invalid choice. Please enter a number between 1 and $($Options.Count)." -ForegroundColor Yellow
    }
}

function Select-GumAddons {
    param([string[]]$Options, [string[]]$Preselected = @())
    if ($script:HAS_GUM) {
        $gumArgs = @('choose', '--no-limit', '--header', 'Select optional add-ons:')
        foreach ($sel in $Preselected) {
            if ($Options -contains $sel) { $gumArgs += @('--selected', $sel) }
        }
        return @(gum @gumArgs $Options)
    }
    # Plain: numbered comma input; Enter keeps the preselection.
    $preSel = ""
    for ($i = 0; $i -lt $Options.Count; $i++) {
        if ($Preselected -contains $Options[$i]) { $preSel += "$($i + 1)," }
    }
    $preSel = $preSel.TrimEnd(',')
    if ($preSel) { $defaultNote = "keep current ($preSel)" } else { $defaultNote = "none" }
    Write-Host "Select optional add-ons (numbers separated by commas, e.g. 1,2 - Enter for $defaultNote):"
    for ($i = 0; $i -lt $Options.Count; $i++) {
        Write-Host "  $($i + 1)) $($Options[$i])"
    }
    $result = @()
    $input = Read-Host "Add-ons"
    if (-not $input) {
        $result = @($Preselected)
    } else {
        foreach ($part in ($input -split ',')) {
            $n = $part.Trim()
            if ($n -match '^\d+$') {
                $num = [int]$n
                if ($num -ge 1 -and $num -le $Options.Count) {
                    $result += $Options[$num - 1]
                } else {
                    Write-Host "  Invalid selection: $n" -ForegroundColor Yellow
                }
            } elseif ($n) {
                Write-Host "  Invalid selection: $n" -ForegroundColor Yellow
            }
        }
    }
    return $result
}

# -- Self-update check --------------------------------------------------

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
                    Copy-Item $SETUP_NEW "$SETUP_SELF.tmp" -Force
                    Move-Item -Path "$SETUP_SELF.tmp" -Destination $SETUP_SELF -Force
                    Write-Ok "Updated setup.ps1. Restarting..."
                    & $SETUP_SELF
                    exit $LASTEXITCODE
                }
            } else {
                $answer = Read-Host "Update setup.ps1 and restart? (y/N)"
                if ($answer -match '^[Yy]$') {
                    Copy-Item $SETUP_SELF "$SETUP_SELF.bak" -Force
                    Copy-Item $SETUP_NEW "$SETUP_SELF.tmp" -Force
                    Move-Item -Path "$SETUP_SELF.tmp" -Destination $SETUP_SELF -Force
                    Write-Ok "Updated setup.ps1. Restarting..."
                    & $SETUP_SELF
                    exit $LASTEXITCODE
                }
            }
            Write-Warn "Continuing with current version..."
        }
    }
} catch {
    # Silently continue if update check fails
} finally {
    if ($script:IsScriptFile -and (Test-Path $SETUP_NEW)) { Remove-Item $SETUP_NEW -Force -ErrorAction SilentlyContinue }
    Remove-Item "$SETUP_SELF.tmp" -Force -ErrorAction SilentlyContinue
}

# -- Re-exec as child process (piped mode safety) ----------------------
# When run via 'irm | iex', the script executes in the user's current
# PowerShell session. Calling 'exit' anywhere (via Stop-Setup) would
# close that session. Re-launch as a real file process so exit is safe.

if (-not $script:IsScriptFile) {
    Write-Host ""
    Write-Warn "Running via 'irm | iex' - restarting as a standalone process so this terminal isn't affected."
    $proceed = $true
    if ($script:HAS_GUM) {
        gum confirm --default=true "Continue?"
        $proceed = ($LASTEXITCODE -eq 0)
    } else {
        $answer = Read-Host "Continue? [Y/n]"
        $proceed = -not ($answer -match '^[Nn]')
    }
    if (-not $proceed) {
        Write-Warn "Aborted."
        return
    }
    $childScript = Join-Path $env:TEMP "lode-setup-run.ps1"
    try {
        if (Test-Path $SETUP_NEW) {
            Copy-Item $SETUP_NEW $childScript -Force
        } else {
            Invoke-WebRequest -Uri $SETUP_URL -OutFile $childScript -UseBasicParsing
        }
    } catch {
        Write-Err "Could not download setup.ps1 to run as a standalone process. Check your connection and try again."
        return
    }
    & powershell -NoProfile -ExecutionPolicy Bypass -File $childScript
    Remove-Item $childScript -Force -ErrorAction SilentlyContinue
    if (Test-Path $SETUP_NEW) { Remove-Item $SETUP_NEW -Force -ErrorAction SilentlyContinue }
    return
}

# -- Banner -----------------------------------------------------------

Write-Header "Lode Auto-Setup v1.0"

Write-Host ""
Write-Dim "This will set up Lode and the services you choose."
Write-Dim "All data will be stored in Docker volumes."
Write-Host ""

if ($script:HAS_GUM) {
    gum confirm --default=false "Do you want to continue?" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Aborted." -ForegroundColor Yellow
        Stop-Setup 0
    }
} else {
    $confirm = Read-Host "Do you want to continue? (y/N)"
    if ($confirm -notmatch '^[yY]') {
        Write-Host "Aborted." -ForegroundColor Yellow
        Stop-Setup 0
    }
}

# -- 1. Prerequisites -------------------------------------------------

Write-Step "[1/15] Checking prerequisites"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Err "Docker is not installed."
    Write-Host "  Install Docker Desktop for Windows:" -ForegroundColor Yellow
    Write-RawLine "    $(Get-Hyperlink 'https://docs.docker.com/desktop/windows-install/')"
    Stop-Setup 1
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
    Stop-Setup 1
}
Write-Ok "Docker daemon running"

try {
    $composeVersion = docker compose version 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose not found" }
} catch {
    Write-Err "Docker Compose plugin is not installed."
    Write-Host "  Install or update Docker Desktop (includes Compose):" -ForegroundColor Yellow
    Write-RawLine "    $(Get-Hyperlink 'https://docs.docker.com/get-docker/')"
    Stop-Setup 1
}
Write-Ok "Docker Compose available"

if (-not (Get-Command curl -ErrorAction SilentlyContinue)) {
    Write-Err "curl is not installed."
    Write-Host "  On Windows 10+ curl is built-in." -ForegroundColor Yellow
    Write-RawLine "  If missing, download from: $(Get-Hyperlink 'https://curl.se/windows/')"
    Stop-Setup 1
}
Write-Ok "curl available"

# -- 2. Create .env ---------------------------------------------------

Write-Step "[2/15] Setting up .env file"

if (-not (Test-Path .env)) {
    if (-not (Test-Path .env.example)) {
        Write-Info "Downloading .env.example from GitHub..."
        try {
            Invoke-WebRequest -Uri "$REPO_RAW/.env.example" -OutFile ".env.example.tmp" -UseBasicParsing 2>$null
            Move-Item -Path ".env.example.tmp" -Destination ".env.example" -Force
        } catch {
            Write-Err "Failed to download .env.example"
            Stop-Setup 1
        } finally {
            Remove-Item ".env.example.tmp" -Force -ErrorAction SilentlyContinue
        }
    }
    try {
        Copy-Item .env.example ".env.tmp"
        Move-Item -Path ".env.tmp" -Destination ".env" -Force
    } finally {
        Remove-Item ".env.tmp" -Force -ErrorAction SilentlyContinue
    }
    Write-Ok "Created .env from .env.example"
} else {
    Write-Warn ".env exists - keeping existing config"
}

New-Item -ItemType Directory -Path "media/Movies" -Force | Out-Null
New-Item -ItemType Directory -Path "media/Series" -Force | Out-Null
Write-Ok "Created media directories (media/Movies, media/Series)"

# -- 3. Detect existing setup ------------------------------------------

Write-Step "[3/15] Detecting existing setup"

$stateFileFound = Test-Path $script:STATE_FILE
if ($stateFileFound) {
    Write-Info "Existing setup found ($($script:STATE_FILE)):"
    Write-Dim "  Database:    $(Get-StateValue 'dbDriver')"
    Write-Dim "  qBittorrent: $(Get-StateValue 'qbittorrent')"
    Write-Dim "  Prowlarr:    $(Get-StateValue 'prowlarr')"
    Write-Dim "  Media:       $(Get-StateValue 'mediaProvider') ($(Get-StateValue 'mediaMode'))"
    Write-Dim "  Add-ons:     FlareSolverr=$(Get-StateValue 'flaresolverr') Dozzle=$(Get-StateValue 'dozzle')"
    Write-Host ""
    $reconf = $true
    if ($script:HAS_GUM) {
        gum confirm --default=true "Reconfigure your existing Lode setup?" | Out-Null
        $reconf = ($LASTEXITCODE -eq 0)
    } else {
        $answer = Read-Host "Reconfigure your existing Lode setup? [Y/n]"
        $reconf = -not ($answer -match '^[Nn]')
    }
    if (-not $reconf) {
        Write-Ok "Keeping existing setup - no changes made."
        Stop-Setup 0
    }
}

# Legacy installs (old all-or-nothing installer) deployed the full
# stack, so preselect everything local including Dozzle.
if ($script:LEGACY_INSTALL) {
    Write-Info "Existing .env without $($script:STATE_FILE) - assuming a previous full-stack install."
}

# Migrate legacy monolith compose files (they predate the split).
if (Test-LegacyMonolith "docker-compose.sqlite.yml") {
    Move-Item "docker-compose.sqlite.yml" "docker-compose.sqlite.yml.legacy" -Force
    Write-Warn "Moved legacy docker-compose.sqlite.yml to docker-compose.sqlite.yml.legacy"
}
if (Test-LegacyMonolith "docker-compose.postgres.yml") {
    Move-Item "docker-compose.postgres.yml" "docker-compose.postgres.yml.legacy" -Force
    Write-Warn "Moved legacy docker-compose.postgres.yml to docker-compose.postgres.yml.legacy"
}
Write-Ok "Setup detection complete"

# -- 4. Generate secrets (idempotent) ----------------------------------
# Secrets are only generated when missing or too short, so re-running
# the script never invalidates existing sessions or encrypted data.

Write-Step "[4/15] Generating secrets"

if (Test-EnvMinLength -Key "NUXT_SESSION_PASSWORD" -MinLength 32) {
    Write-Ok "Session password already set - keeping it"
} else {
    Update-EnvFile "NUXT_SESSION_PASSWORD" (New-SecretPassword -Length 32)
    Write-Ok "Session password generated"
}

if (Test-EnvMinLength -Key "NUXT_TRACKER_ENCRYPTION_KEY" -MinLength 32) {
    Write-Ok "Tracker encryption key already set - keeping it"
} else {
    Update-EnvFile "NUXT_TRACKER_ENCRYPTION_KEY" (New-SecretHex -Bytes 32)
    Write-Ok "Tracker encryption key generated"
}

# -- 5. Database driver choice ----------------------------------------

Write-Step "[5/15] Database driver"

$DB_DRIVER_CHOICE = "sqlite"

$dbChoicePre = ""
if ($stateFileFound) {
    switch (Get-StateValue 'dbDriver') {
        'postgres' { $dbChoicePre = "PostgreSQL" }
        'sqlite'   { $dbChoicePre = "SQLite (recommended)" }
    }
} else {
    $existingDbDriver = Read-EnvValue "DB_DRIVER"
    if ($existingDbDriver -eq "postgres") {
        $dbChoicePre = "PostgreSQL"
    } elseif ($existingDbDriver -and $existingDbDriver -ne "sqlite") {
        Write-Info "Existing database driver: $existingDbDriver"
    }
}

if (-not $script:HAS_GUM) {
    Write-Host ""
    Write-Host "Choose your database driver:" -ForegroundColor White
    Write-Dim "  SQLite    - Zero config, file-based, recommended for most users"
    Write-Dim "  PostgreSQL - Full-featured, requires more resources"
    Write-Host ""
}

$dbChoice = Select-GumMenu -Prompt "Select database driver:" -Options @("SQLite (recommended)", "PostgreSQL") -Preselect $dbChoicePre

if ($dbChoice -match "PostgreSQL") {
    $DB_DRIVER_CHOICE = "postgres"
} else {
    $DB_DRIVER_CHOICE = "sqlite"
}

Write-Ok "Database driver: $DB_DRIVER_CHOICE"

if ($DB_DRIVER_CHOICE -eq "postgres") {
    if (Test-EnvMinLength -Key "POSTGRES_PASSWORD" -MinLength 32) {
        Write-Ok "PostgreSQL password already set - keeping it"
    } else {
        Update-EnvFile "POSTGRES_PASSWORD" (New-SecretPassword -Length 32)
        Write-Ok "PostgreSQL password generated"
    }
}

# -- 6. Component selection ---------------------------------------------

Write-Step "[6/15] Selecting components"

Write-Host ""
Write-Dim "Lode and Redis are always deployed. Choose the rest:"
Write-Host ""

# Preselect: state file (re-run) > legacy full-stack install > defaults.
$qbitPre = $QBIT_OPT_LOCAL
$prowlarrPre = $PROWLARR_OPT_LOCAL
$mediaPre = $MEDIA_OPT_JELLYFIN_LOCAL
$USE_FLARESOLVERR = $false
$USE_DOZZLE = $false

if ($stateFileFound) {
    switch (Get-StateValue 'qbittorrent') {
        'external' { $qbitPre = $QBIT_OPT_EXTERNAL }
    }
    switch (Get-StateValue 'prowlarr') {
        'external' { $prowlarrPre = $PROWLARR_OPT_EXTERNAL }
    }
    switch (Get-StateValue 'mediaMode') {
        'external' { $mediaPre = $MEDIA_OPT_JELLYFIN_EXTERNAL }
        'none'     { $mediaPre = $MEDIA_OPT_NONE }
    }
    $USE_FLARESOLVERR = ((Get-StateValue 'flaresolverr') -eq 'true')
    $USE_DOZZLE = ((Get-StateValue 'dozzle') -eq 'true')
} elseif ($script:LEGACY_INSTALL) {
    # The old installer ran Dozzle as part of the full stack.
    $USE_DOZZLE = $true
}

# 6a. Torrent client
$qbitChoice = Select-GumMenu -Prompt "How should Lode download torrents?" -Options @($QBIT_OPT_LOCAL, $QBIT_OPT_EXTERNAL) -Preselect $qbitPre
if ($qbitChoice -match "External qBittorrent") {
    $QBIT_MODE = "external"
    $QBIT_URL = Read-GumInputDefault "External qBittorrent URL (http://host:8080)" (Get-ExternalUrlDefault "NUXT_QBITTORRENT_URL" "http://qbittorrent:8080")
    if (-not (Test-UrlValue $QBIT_URL)) {
        Write-Warn "External qBittorrent URL does not start with http(s):// - Lode will not be able to reach it"
    }
} else {
    $QBIT_MODE = "local"
    $QBIT_URL = ""
}
Write-Ok "qBittorrent: $QBIT_MODE"

# 6b. Indexer
$prowlarrChoice = Select-GumMenu -Prompt "How should Lode index torrents?" -Options @($PROWLARR_OPT_LOCAL, $PROWLARR_OPT_EXTERNAL) -Preselect $prowlarrPre
if ($prowlarrChoice -match "External Prowlarr") {
    $PROWLARR_MODE = "external"
    $PROWLARR_URL = Read-GumInputDefault "External Prowlarr URL (http://host:9696)" (Get-ExternalUrlDefault "NUXT_PROWLARR_URL" "http://prowlarr:9696")
} else {
    $PROWLARR_MODE = "local"
    $PROWLARR_URL = ""
}
if ($PROWLARR_MODE -eq "external" -and -not (Test-UrlValue $PROWLARR_URL)) {
    Write-Warn "External Prowlarr URL does not start with http(s):// - Lode will not be able to reach it"
}
Write-Ok "Prowlarr: $PROWLARR_MODE"

# 6c. Media server
$mediaChoice = Select-GumMenu -Prompt "Media server (library detection)?" -Options @($MEDIA_OPT_JELLYFIN_LOCAL, $MEDIA_OPT_JELLYFIN_EXTERNAL, $MEDIA_OPT_NONE) -Preselect $mediaPre
switch -regex ($mediaChoice) {
    'Jellyfin \(external\)' {
        $MEDIA_PROVIDER = "jellyfin"
        $MEDIA_MODE = "external"
        $JELLYFIN_URL = Read-GumInputDefault "External Jellyfin URL (http://host:8096)" (Get-ExternalUrlDefault "NUXT_JELLYFIN_URL" "http://jellyfin:8096")
    }
    'No media server' {
        $MEDIA_PROVIDER = "none"
        $MEDIA_MODE = "none"
        $JELLYFIN_URL = ""
    }
    default {
        $MEDIA_PROVIDER = "jellyfin"
        $MEDIA_MODE = "local"
        $JELLYFIN_URL = ""
    }
}
if ($MEDIA_MODE -eq "external" -and -not (Test-UrlValue $JELLYFIN_URL)) {
    Write-Warn "External Jellyfin URL does not start with http(s):// - Lode will not be able to reach it"
}
Write-Ok "Media server: $MEDIA_PROVIDER ($MEDIA_MODE)"

# 6d. Add-ons (multi-select)
$preselectedAddons = @()
if ($USE_FLARESOLVERR) { $preselectedAddons += $ADDON_OPT_FLARESOLVERR }
if ($USE_DOZZLE) { $preselectedAddons += $ADDON_OPT_DOZZLE }
$chosenAddons = @(Select-GumAddons -Options @($ADDON_OPT_FLARESOLVERR, $ADDON_OPT_DOZZLE) -Preselected $preselectedAddons)
$USE_FLARESOLVERR = ($chosenAddons -contains $ADDON_OPT_FLARESOLVERR)
$USE_DOZZLE = ($chosenAddons -contains $ADDON_OPT_DOZZLE)
Write-Ok "Add-ons: FlareSolverr=$(if ($USE_FLARESOLVERR) { 'true' } else { 'false' }) Dozzle=$(if ($USE_DOZZLE) { 'true' } else { 'false' })"

# Build the compose file list for the selected stack.
$script:COMPOSE_FILES = @($COMPOSE_BASE)
if ($DB_DRIVER_CHOICE -eq "postgres") { $script:COMPOSE_FILES += "docker-compose.postgres.yml" }
if ($QBIT_MODE -eq "local") { $script:COMPOSE_FILES += "docker-compose.qbittorrent.yml" }
if ($PROWLARR_MODE -eq "local") { $script:COMPOSE_FILES += "docker-compose.prowlarr.yml" }
if ($MEDIA_MODE -eq "local") { $script:COMPOSE_FILES += "docker-compose.jellyfin.yml" }
if ($USE_FLARESOLVERR) { $script:COMPOSE_FILES += "docker-compose.flaresolverr.yml" }
if ($USE_DOZZLE) { $script:COMPOSE_FILES += "docker-compose.dozzle.yml" }

# -- 7. Download compose files ------------------------------------------
# The lode image tag is written by the version step below - mask it
# when comparing, so tag-only differences never trigger a replace prompt.

function Get-ComposeTagMasked {
    param([string]$Path)
    (Get-Content $Path) -replace '(?m)^(\s*(#\s*)?)(image:\s*ghcr\.io/nort1346/lode:)\S+$', '$1$3<version>'
}

Write-Step "[7/15] Downloading compose files"

# Split into missing files (downloaded directly, no prompt) and files
# that already exist (one prompt for the whole group).
# Downloads land in a temp file first so an interrupted run never leaves a truncated compose file behind.
$newFiles = @()
$existingFiles = @()
foreach ($composeFile in $script:COMPOSE_FILES) {
    if (Test-Path $composeFile) { $existingFiles += $composeFile } else { $newFiles += $composeFile }
}

foreach ($composeFile in $newFiles) {
    Write-Info "Downloading $composeFile..."
    try {
        Invoke-WebRequest -Uri "$REPO_RAW/$composeFile" -OutFile "$composeFile.tmp" -UseBasicParsing
        Move-Item -Path "$composeFile.tmp" -Destination $composeFile -Force
    } catch {
        Write-Err "Failed to download $composeFile from GitHub."
        Write-Host "  Check your internet connection and try again." -ForegroundColor Yellow
        Stop-Setup 1
    } finally {
        Remove-Item "$composeFile.tmp" -Force -ErrorAction SilentlyContinue
    }
    Write-Ok "$composeFile downloaded"
}

if ($existingFiles.Count -gt 0) {
    $doUpdate = $false
    if ($script:HAS_GUM) {
        gum confirm --default=false "$($existingFiles.Count) compose file(s) already exist. Download the latest versions from GitHub? (changed files keep a .bak backup)" | Out-Null
        $doUpdate = ($LASTEXITCODE -eq 0)
    } else {
        $answer = Read-Host "$($existingFiles.Count) compose file(s) already exist. Download the latest versions from GitHub? [y/N]"
        $doUpdate = ($answer -match '^[Yy]$')
    }
    foreach ($composeFile in $existingFiles) {
        if ($doUpdate) {
            try {
                Invoke-WebRequest -Uri "$REPO_RAW/$composeFile" -OutFile "$composeFile.tmp" -UseBasicParsing 2>$null
                $composeDiff = Compare-Object (Get-ComposeTagMasked $composeFile) (Get-ComposeTagMasked "$composeFile.tmp")
                if ($composeDiff) {
                    Copy-Item $composeFile "$composeFile.bak" -Force
                    Move-Item -Path "$composeFile.tmp" -Destination $composeFile -Force
                    Write-Ok "$composeFile updated (backup saved as $composeFile.bak)"
                } else {
                    Write-Ok "$composeFile is already up to date"
                }
            } catch {
                Write-Warn "Could not download $composeFile - keeping your local copy"
            } finally {
                Remove-Item "$composeFile.tmp" -Force -ErrorAction SilentlyContinue
            }
        } else {
            Write-Ok "Using existing $composeFile"
        }
    }
}

# -- 8. Lode version choice --------------------------------------
# The version choice is the single source of truth for the image tag:
# it is written into the base compose file here, after the download step.

Write-Step "[8/15] Lode version"

$LODE_TAG = "latest"

$versionPre = "latest (recommended)"
if ($stateFileFound -and (Get-StateValue 'imageTag') -eq "nightly") {
    $versionPre = "nightly"
}

if (-not $script:HAS_GUM) {
    Write-Host ""
    Write-Host "Which Lode image do you want to use?" -ForegroundColor White
    Write-Dim "  latest  - Stable release (recommended)"
    Write-Dim "  nightly - Latest dev build from main (may be unstable)"
    Write-Host ""
}

$versionChoice = Select-GumMenu -Prompt "Select version:" -Options @("latest (recommended)", "nightly") -Preselect $versionPre

if ($versionChoice -match "nightly") {
    $LODE_TAG = "nightly"
} else {
    $LODE_TAG = "latest"
}

$composeContent = Get-Content $COMPOSE_BASE -Raw
if ($composeContent -match '(?m)^\s*image:\s*ghcr.io/nort1346/lode:') {
    $composeContent = $composeContent -replace '(?m)^(\s*image:\s*ghcr\.io/nort1346/lode:)\S+', ('$1' + $LODE_TAG)
    Set-Content -Path $COMPOSE_BASE -Value $composeContent -NoNewline
    Write-Ok "Lode version: $LODE_TAG (image: ghcr.io/nort1346/lode:$LODE_TAG)"
} else {
    Write-Warn "No lode image line found in $COMPOSE_BASE - check the image tag manually"
}

# Remember the selection so the next run can prefill the prompts.
Write-StateFile
Write-Ok "Selection saved to $($script:STATE_FILE)"

# -- 9. Pull and start selected services ------------------------------

Write-Step "[9/15] Starting selected services"

$dcArgs = Get-DcFileArgs

# Validate the merged configuration before touching the daemon.
$null = docker compose $dcArgs config -q 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Err "The selected compose files do not merge correctly."
    Write-Err "Files: $($script:COMPOSE_FILES -join ' ')"
    Stop-Setup 1
}

# Remove containers for services that are no longer selected locally.
if ($stateFileFound) {
    $fsState = if ($USE_FLARESOLVERR) { "true" } else { "false" }
    $dozzleState = if ($USE_DOZZLE) { "true" } else { "false" }
    Remove-DeselectedService -Service "qbittorrent" -StateKey "qbittorrent" -ActiveValue "local" -CurrentValue $QBIT_MODE
    Remove-DeselectedService -Service "prowlarr" -StateKey "prowlarr" -ActiveValue "local" -CurrentValue $PROWLARR_MODE
    Remove-DeselectedService -Service "jellyfin" -StateKey "mediaMode" -ActiveValue "local" -CurrentValue $MEDIA_MODE
    Remove-DeselectedService -Service "flaresolverr" -StateKey "flaresolverr" -ActiveValue "true" -CurrentValue $fsState
    Remove-DeselectedService -Service "dozzle" -StateKey "dozzle" -ActiveValue "true" -CurrentValue $dozzleState
    Remove-DeselectedService -Service "postgres" -StateKey "dbDriver" -ActiveValue "postgres" -CurrentValue $DB_DRIVER_CHOICE
}

$INFRA_SERVICES = @("redis")
if ($DB_DRIVER_CHOICE -eq "postgres") { $INFRA_SERVICES += "postgres" }
if ($QBIT_MODE -eq "local") { $INFRA_SERVICES += "qbittorrent" }
if ($PROWLARR_MODE -eq "local") { $INFRA_SERVICES += "prowlarr" }
if ($MEDIA_MODE -eq "local") { $INFRA_SERVICES += "jellyfin" }
if ($USE_FLARESOLVERR) { $INFRA_SERVICES += "flaresolverr" }
if ($USE_DOZZLE) { $INFRA_SERVICES += "dozzle" }

Write-Info "Pulling images..."
docker compose $dcArgs pull

if (-not (docker image inspect "ghcr.io/nort1346/lode:$LODE_TAG" 2>$null)) {
    Write-Err "Failed to pull the Lode image (ghcr.io/nort1346/lode:$LODE_TAG). Check your network and try again."
    Write-Err "You can also try manually: $(Get-DcCommandPrefix) pull lode"
    Stop-Setup 1
}

docker compose $dcArgs up -d $INFRA_SERVICES

# `ps -q` is stable across Compose versions (the JSON output format
# changed in Compose 2.21, so it is not used for state checks).
$failedServices = @()
foreach ($svc in $INFRA_SERVICES) {
    $svcId = docker compose $dcArgs ps -q $svc 2>$null
    if (-not $svcId) {
        $failedServices += $svc
        $lastLog = docker compose $dcArgs logs $svc --tail 3 2>&1 | Select-Object -Last 1
        Write-Warn "$svc failed to start: $lastLog"
    }
}

if ($failedServices -contains 'redis') {
    Write-Err "Redis failed to start. Cannot continue."
    Write-Host "  Check logs: $(Get-DcCommandPrefix) logs redis" -ForegroundColor Yellow
    Stop-Setup 1
}
if ($DB_DRIVER_CHOICE -eq "postgres" -and $failedServices -contains 'postgres') {
    Write-Err "PostgreSQL failed to start. Cannot continue."
    Write-Host "  Check logs: $(Get-DcCommandPrefix) logs postgres" -ForegroundColor Yellow
    Stop-Setup 1
}
if ($QBIT_MODE -eq "local" -and $failedServices -contains 'qbittorrent') {
    Write-Err "qBittorrent failed to start. Cannot continue."
    Write-Host "  Check logs: $(Get-DcCommandPrefix) logs qbittorrent" -ForegroundColor Yellow
    Stop-Setup 1
}

Write-Info "Waiting for Redis..."
Test-Port -Host_ "localhost" -Port 6379 -Timeout 30 | Out-Null

if ($QBIT_MODE -eq "local") {
    Write-Info "Waiting for qBittorrent..."
    Test-Port -Host_ "localhost" -Port 8080 -Timeout 60 | Out-Null
}

Start-Sleep -Seconds 3

$QBIT_TEMP_PASS = $null
if ($QBIT_MODE -eq "local") {
    $QBIT_TEMP_PASS = docker compose $dcArgs logs qbittorrent 2>&1 |
        Select-String 'A temporary password is provided for this session:' |
        ForEach-Object { ($_ -replace '.*A temporary password is provided for this session:\s*', '').Trim() } |
        Select-Object -First 1
}

if ($PROWLARR_MODE -eq "local") {
    if ($failedServices -contains 'prowlarr') {
        Write-Warn "Prowlarr not running -- you can configure it later (step 12)"
    } else {
        Write-Info "Waiting for Prowlarr..."
        Test-Port -Host_ "localhost" -Port 9900 -Timeout 60 | Out-Null
    }
}

if ($MEDIA_MODE -eq "local") {
    if ($failedServices -contains 'jellyfin') {
        Write-Warn "Jellyfin not running -- you can configure it later (step 10)"
    } else {
        Write-Info "Waiting for Jellyfin..."
        Test-Port -Host_ "localhost" -Port 8096 -Timeout 90 | Out-Null
    }
}

Write-Ok "Selected services are running"

if ($DB_DRIVER_CHOICE -eq "postgres") {
    Write-Info "Waiting for PostgreSQL..."
    Test-Port -Host_ "localhost" -Port 5432 -Timeout 30 | Out-Null
}

Write-Info "Waiting 10s for services to fully initialize..."
Start-Sleep -Seconds 10

# -- Clipboard read (primary secret entry) -----------------------------
# Secrets are entered by copying the value in the browser and pressing
# Enter here - the script reads it from the clipboard. Type m at the
# gate to paste manually for that one field. If Get-Clipboard is
# unavailable (e.g. no interactive desktop), the manual prompt is
# used directly.

$script:HasClipboard = $false
try {
    $null = Get-Clipboard -Raw -ErrorAction Stop
    $script:HasClipboard = $true
} catch { }

# Read-SecretValue <Name>
# Gate: press Enter to read the clipboard, or type m to paste manually.
# Prompt lines use Write-Host directly: this function runs inside $()
# capture, and the Write-* helpers emit native gum output (success stream)
# when gum is installed, which would be captured together with the value.
function Read-SecretValue {
    param([string]$Name)
    if (-not $script:HasClipboard) {
        Write-Host "No clipboard tool available - paste manually (right-click or Ctrl+Shift+V, not Ctrl+C)." -ForegroundColor DarkGray
        return Read-GumPassword "Paste your $Name (Enter to skip)"
    }
    while ($true) {
        Write-Host "Copy your $Name to your clipboard, then press Enter" -ForegroundColor White
        Write-Host "Type m and press Enter to paste manually instead." -ForegroundColor DarkGray
        $answer = Read-Host ">"
        if ($answer -match '^[Mm]$') {
            return Read-GumPassword "Paste your $Name (Enter to skip)"
        }
        if ($answer -ne '') {
            Write-Host "[WARN]  Press Enter to read the clipboard, or m to paste manually." -ForegroundColor Yellow
            continue
        }
        $value = $null
        try { $value = Get-Clipboard -Raw -ErrorAction Stop } catch { $value = $null }
        if ($null -ne $value) { $value = $value.Trim() }
        if ($value) {
            Write-Host "[ OK ]  Received from clipboard ($($value.Length) characters)" -ForegroundColor Green
            return $value
        }
        Write-Host "[WARN]  Clipboard is empty - paste manually instead." -ForegroundColor Yellow
        Write-Host "Paste with right-click or Ctrl+Shift+V (not Ctrl+C)." -ForegroundColor DarkGray
        return Read-GumPassword "Paste your $Name (Enter to skip)"
    }
}

# -- 10. Jellyfin API Key ----------------------------------------------

Write-Step "[10/15] Jellyfin API key"

if ($MEDIA_PROVIDER -eq "none") {
    Update-EnvFile "NUXT_JELLYFIN_URL" ""
    Update-EnvFile "NUXT_JELLYFIN_API_KEY" ""
    Write-Info "No media server selected - NUXT_JELLYFIN_URL and NUXT_JELLYFIN_API_KEY cleared"
} else {
    if ($MEDIA_MODE -eq "local") {
        Write-Host ""
        Write-Host "Follow these steps to get your Jellyfin API key:" -ForegroundColor White
        Write-Dim "  1. Open $(Get-Hyperlink 'http://localhost:8096') in your browser"
        Write-Dim "  2. Complete the setup wizard (create your admin account)"
        Write-Dim "  3. Go to Dashboard (gear icon) > API Keys"
        Write-Dim '  4. Click the + button, name it Lode, click OK'
        Write-Dim "  5. Copy the generated API key"
    } else {
        Write-Host ""
        Write-RawLine "Your external Jellyfin instance: $(Get-Hyperlink $JELLYFIN_URL)"
        Write-Dim "Create an API key in Jellyfin: Dashboard (gear icon) > API Keys"
    }
    Write-Host ""

    $jellyfinKey = Read-SecretValue "Jellyfin API key"

    if ($jellyfinKey) {
        Update-EnvFile "NUXT_JELLYFIN_API_KEY" $jellyfinKey
        Write-Ok "Jellyfin API key saved"
    } else {
        Write-Warn "Skipping Jellyfin API key -- set it later in .env"
    }
}

# -- 11. qBittorrent WebUI + API Key -----------------------------------

Write-Step "[11/15] qBittorrent WebUI + API key"

if ($QBIT_MODE -eq "local") {
    if ($QBIT_TEMP_PASS) {
        Write-Host ""
        Write-Host "qBittorrent temporary password: $QBIT_TEMP_PASS" -ForegroundColor Yellow
        Write-Dim "Copy this - you will need it below"
        Write-Host ""
    } else {
        Write-Warn "Could not extract qBittorrent temp password - check: $(Get-DcCommandPrefix) logs qbittorrent"
    }

    Write-Host "Follow these steps to configure qBittorrent:" -ForegroundColor White
    Write-Dim "  1. Open $(Get-Hyperlink 'http://localhost:8080') in your browser"
    Write-Dim "  2. Login with:"
    Write-Dim "       Username: admin"
    Write-Dim "       Password: [temporary password shown above]"
    Write-Dim "  3. Go to Tools > Options > Web UI"
    Write-Dim "  4. Change the password to something you remember"
    Write-Dim "  5. Save changes"
    Write-Dim "  6. Go to Tools > Options > Web UI > API Key section"
    Write-Dim "  7. Copy the API Key"
} else {
    Write-Host ""
    Write-RawLine "Your external qBittorrent instance: $(Get-Hyperlink $QBIT_URL)"
    Write-Dim "Find the API key in qBittorrent: Tools > Options > Web UI"
}
Write-Host ""

    $qbitKey = Read-SecretValue "qBittorrent API key"

if ($qbitKey) {
    Update-EnvFile "NUXT_QBITTORRENT_API_KEY" $qbitKey
    Write-Ok "qBittorrent API key saved"
} else {
    Write-Warn "Skipping qBittorrent API key -- set it later in .env"
}

# -- 12. Prowlarr API Key ----------------------------------------------

Write-Step "[12/15] Prowlarr API key"

if ($PROWLARR_MODE -eq "local") {
    Write-Host ""
    Write-Host "Follow these steps to get your Prowlarr API key:" -ForegroundColor White
    Write-Dim "  1. Open $(Get-Hyperlink 'http://localhost:9900') in your browser"
    Write-Dim "  2. Go to Settings > General"
    Write-Dim "  3. Find the API Key field"
    Write-Dim "  4. Copy the API key"
    Write-Host ""
    $indexerLines = @("  1. Add at least one indexer (e.g. YTS): Settings > Indexers > Add")
    if ($USE_FLARESOLVERR) {
        $indexerLines += @("  2. For private trackers: Settings > Indexers > Add > FlareSolverr", "     Set URL: http://flaresolverr:8191")
    }
    Write-Callout "IMPORTANT: Prowlarr needs indexers before Lode can find anything." ($indexerLines -join "`n")
    Write-Host ""
} else {
    Write-Host ""
    Write-RawLine "Your external Prowlarr instance: $(Get-Hyperlink $PROWLARR_URL)"
    Write-Dim "Find the API key in Prowlarr: Settings > General"
    Write-Host ""
}

$prowlarrKey = Read-SecretValue "Prowlarr API key"

if ($prowlarrKey) {
    Update-EnvFile "NUXT_PROWLARR_API_KEY" $prowlarrKey
    Write-Ok "Prowlarr API key saved"
} else {
    Write-Warn "Skipping Prowlarr API key -- set it later in .env"
}

# -- 13. TMDB API Key --------------------------------------------------

Write-Step "[13/15] TMDB API key"

Write-Host ""
Write-Host "Follow these steps to get your TMDB API key:" -ForegroundColor White
Write-Dim "  1. Go to $(Get-Hyperlink 'https://www.themoviedb.org/settings/api')"
Write-Dim "  2. Create a free account (or log in)"
Write-Dim '  3. Click the link to generate an API key'
Write-Dim "  4. Fill in the form:"
Write-Dim "       Application Name:  Lode"
Write-Dim "       Application URL:   $(Get-Hyperlink 'http://localhost:5757')"
Write-Dim "  5. Copy your API Key (v3 auth)"
Write-Host ""
Write-Dim "This is required for movie/TV metadata."
Write-Host ""

$tmdbKey = Read-SecretValue "TMDB API key"

if ($tmdbKey) {
    Update-EnvFile "NUXT_TMDB_API_KEY" $tmdbKey
    Write-Ok "TMDB API key saved"
} else {
    Write-Warn "Skipping TMDB API key -- set it later in .env"
}

# -- 14. Discord Webhook (optional) ------------------------------------

Write-Step "[14/15] Discord Webhook (optional)"

$setWebhook = $false
if ($script:HAS_GUM) {
    gum confirm --default=false "Get notified in Discord when downloads complete. Set up a webhook now?" | Out-Null
    $setWebhook = ($LASTEXITCODE -eq 0)
} else {
    $answer = Read-Host "Get notified in Discord when downloads complete. Set up a webhook now? [y/N]"
    $setWebhook = ($answer -match '^[Yy]$')
}

if ($setWebhook) {
    Write-Host ""
    Write-Host "To set up a Discord webhook:" -ForegroundColor Gray
    Write-Dim "  1. Open your Discord server"
    Write-Dim "  2. Go to Server Settings > Integrations > Webhooks"
    Write-Dim '  3. Click New Webhook'
    Write-Dim "  4. Name it, choose a channel, click Copy Webhook URL"
    Write-Host ""

    $discordKey = Read-SecretValue "Discord Webhook URL"

    if ($discordKey) {
        Update-EnvFile "NUXT_DISCORD_WEBHOOK_URL" $discordKey
        Write-Ok "Discord webhook URL saved"
    } else {
        Write-Warn "Skipping Discord webhook -- set it later in .env"
    }
} else {
    Write-Dim "Skipped -- set NUXT_DISCORD_WEBHOOK_URL in .env later if you change your mind."
}

# -- 15. Start Lode ----------------------------------------------------

Write-Step "[15/15] Starting Lode"

try {
    Update-EnvFile "NUXT_REDIS_URL" "redis://redis:6379"
    Update-EnvFile "DB_DRIVER" $DB_DRIVER_CHOICE

    switch ($QBIT_MODE) {
        'local'    { Update-EnvFile "NUXT_QBITTORRENT_URL" "http://qbittorrent:8080" }
        'external' { Update-EnvFile "NUXT_QBITTORRENT_URL" $QBIT_URL }
    }
    switch ($PROWLARR_MODE) {
        'local'    { Update-EnvFile "NUXT_PROWLARR_URL" "http://prowlarr:9696" }
        'external' { Update-EnvFile "NUXT_PROWLARR_URL" $PROWLARR_URL }
    }
    switch ($MEDIA_MODE) {
        'local'    { Update-EnvFile "NUXT_JELLYFIN_URL" "http://jellyfin:8096" }
        'external' { Update-EnvFile "NUXT_JELLYFIN_URL" $JELLYFIN_URL }
    }
    if ($USE_FLARESOLVERR) {
        Update-EnvFile "NUXT_FLARESOLVERR_URL" "http://flaresolverr:8191"
    } else {
        Update-EnvFile "NUXT_FLARESOLVERR_URL" ""
    }

    if ($DB_DRIVER_CHOICE -eq "postgres") {
        $pgPass = Read-EnvValue "POSTGRES_PASSWORD"
        Update-EnvFile "DATABASE_URL" "postgresql://lode:$pgPass@postgres:5432/lode"
    }

    $upOutput = (docker compose $dcArgs up -d lode 2>&1 | Out-String).Trim()

    Start-Sleep -Seconds 3
    $lodeId = docker compose $dcArgs ps -q lode 2>$null
    if (-not $lodeId) {
        if ($upOutput) {
            throw "Lode container did not start:`n$upOutput"
        }
        throw "Lode container did not start."
    }

    Write-Info "Waiting for Lode to start (first start may take 1-2 minutes)..."
    if (-not (Test-Port -Host_ "localhost" -Port 5757 -Timeout 120 -Interval 4)) {
        throw "Lode did not open $(Get-Hyperlink 'http://localhost:5757') within 120s."
    }

    Write-Ok "Lode is running at $(Get-Hyperlink 'http://localhost:5757')"
}
catch {
    Write-Err "Could not start Lode: $_"
    Write-Host ""
    Write-Host "  The other containers are left running. To see what went wrong:" -ForegroundColor Yellow
    Write-Host "    $(Get-DcCommandPrefix) logs lode" -ForegroundColor Yellow
    Write-Host "  To retry:" -ForegroundColor Yellow
    Write-Host "    $(Get-DcCommandPrefix) up -d lode" -ForegroundColor Yellow
    Write-Host ""
    Stop-Setup 1
}

# -- Extract admin password from logs ---------------------------------

$adminPass = $null
for ($retry = 1; $retry -le 5; $retry++) {
    $adminPass = docker compose $dcArgs logs --no-color --tail 200 lode 2>&1 |
        Select-String 'Admin password:' |
        ForEach-Object { if ($_ -match 'Admin password: ([^"]+)') { $matches[1].Trim() } } |
        Select-Object -First 1
    if ($adminPass) { break }
    Start-Sleep -Seconds 2
}

# -- Summary ----------------------------------------------------------

Write-Host ""
Write-Host "Lode is ready!" -ForegroundColor Green
Write-Host ""

# -- Services table
$services = @((Get-SummaryRow "Lode" "http://localhost:5757"))
switch ($QBIT_MODE) {
    'local'    { $services += (Get-SummaryRow "qBittorrent" "http://localhost:8080") }
    'external' { $services += (Get-SummaryRow "qBittorrent" $QBIT_URL) }
}
switch ($PROWLARR_MODE) {
    'local'    { $services += (Get-SummaryRow "Prowlarr" "http://localhost:9900") }
    'external' { $services += (Get-SummaryRow "Prowlarr" $PROWLARR_URL) }
}
switch ($MEDIA_MODE) {
    'local'    { $services += (Get-SummaryRow "Jellyfin" "http://localhost:8096") }
    'external' { $services += (Get-SummaryRow "Jellyfin" $JELLYFIN_URL) }
    'none'     { $services += (Get-SummaryRow "Jellyfin" "(disabled)") }
}
if ($USE_FLARESOLVERR) {
    $services += (Get-SummaryRow "FlareSolverr" "http://localhost:8191")
}
$services += (Get-SummaryRow "Database" $DB_DRIVER_CHOICE)
if ($DB_DRIVER_CHOICE -eq "postgres") {
    $services += (Get-SummaryRow "PostgreSQL" "localhost:5432 / lode")
}
if ($USE_DOZZLE) {
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
    Write-Dim "Password: check '$(Get-DcCommandPrefix) logs lode'"
}
Write-Dim "Change this password after first login."

Write-Host ""

# -- Required before first use
if ($PROWLARR_MODE -eq "local") {
    $requiredLines = @(
        "  Prowlarr has no indexers yet - Lode cannot find torrents until you add them.",
        "  Open $(Get-Hyperlink 'http://localhost:9900') and add at least one indexer (e.g. YTS)."
    )
    if ($USE_FLARESOLVERR) {
        $requiredLines += "  For private trackers: Settings > Indexers > Add > FlareSolverr, URL: http://flaresolverr:8191"
    }
} else {
    $requiredLines = @("  Your external Prowlarr needs at least one indexer before Lode can find torrents.")
}
Write-Callout "Required before first use:" ($requiredLines -join "`n")

Stop-Setup 0
