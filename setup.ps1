# -- Lode Setup Bootstrap (Windows) ----------------------------------
# Downloads the prebuilt lode-setup binary for this platform from the
# latest GitHub release and runs it. All setup logic lives in the
# binary (cli/), so this script only detects the architecture,
# downloads the cached binary, and launches it.
#
# Usage:
#   irm https://raw.githubusercontent.com/Nort1346/Lode/main/setup.ps1 | iex
#   .\setup.ps1
#
# A piped (irm | iex) run re-executes itself as a standalone child
# process, so no 'exit' in this script can ever close the user's
# terminal.
# --------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

$Repo = 'Nort1346/Lode'
$BaseUrl = $env:LODE_BASE_URL
if (-not $BaseUrl) {
  $BaseUrl = "https://github.com/${Repo}"
}

# Piped (irm | iex) runs have no script path; file runs (.ps1, -File,
# double-click) do.
$script:IsScriptFile = [bool]$MyInvocation.MyCommand.Path

# A dedicated process (powershell -File, double-click) may exit with the
# result; a session run (.\setup.ps1) must leave the user's terminal alone.
$script:IsFileProcess = [Environment]::CommandLine -match '(?i)(?:^|\s)-(File|f)(?:\s|=|$)'

# When the script runs in a console window that closes when the process
# exits (double-click, new terminal tab), pause before exiting so the
# output stays readable.
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
      $id = $parent.ProcessId
    }
  }
  catch {
    return $true
  }
  return $false
}

$script:PauseBeforeExit = Test-TransientWindow

function Pause-BeforeExit {
  if (-not $script:PauseBeforeExit) {
    return
  }
  Write-Host ''
  Read-Host 'Press Enter to close' | Out-Null
}

function Stop-WithError([string]$Message) {
  if ($script:IsFileProcess) {
    [Console]::Error.WriteLine("error: $Message")
    Pause-BeforeExit
    exit 1
  }
  # Session run: a terminating error stops the script without closing
  # the user's terminal.
  throw "error: $Message"
}

# -- Terminal helpers ---------------------------------------------------
# SGR colors and the OSC 8 hyperlink are dropped for NO_COLOR,
# TERM=dumb, and redirected output, so logs stay clean.

$script:NoColor = -not [string]::IsNullOrWhiteSpace($env:NO_COLOR)
$script:UseColor = -not $script:NoColor -and $env:TERM -ne 'dumb' -and -not [Console]::IsOutputRedirected

$script:ESC = [char]27
$script:BEL = [char]7

function Format-Hyperlink([string]$Url, [string]$Label) {
  if (-not $Label) {
    $Label = $Url
  }
  if ($script:UseColor) {
    return "$($script:ESC)]8;;${Url}$($script:BEL)${Label}$($script:ESC)]8;;$($script:BEL)"
  }
  return $Label
}

# -- Re-exec as child process (piped mode safety) ----------------------
# When run via 'irm | iex', the script executes in the user's current
# PowerShell session. Calling 'exit' anywhere would close that session,
# and a Ctrl+C here would surface as an error in it. Re-launch as a real
# file process so neither can happen.

if (-not $script:IsScriptFile) {
  $childScript = Join-Path $env:TEMP 'lode-setup-bootstrap.ps1'
  $scriptUrl = "${BaseUrl}/raw/main/setup.ps1"
  try {
    Invoke-WebRequest -Uri $scriptUrl -OutFile $childScript -UseBasicParsing
  }
  catch {
    [Console]::Error.WriteLine("error: could not download setup.ps1 for the standalone run: $scriptUrl")
    return
  }
  try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $childScript @args
  }
  catch {
    # Ctrl+C cancels the wait for the child; the child already handled
    # the abort. Return to the prompt quietly instead of a red error.
    if ($_.Exception -is [System.Management.Automation.PipelineStoppedException]) {
      return
    }
    throw
  }
  finally {
    Remove-Item $childScript -Force -ErrorAction SilentlyContinue
  }
  return
}

# -- Architecture --------------------------------------------------------

# PROCESSOR_ARCHITECTURE reports 32-bit inside a WoW64 shell, so also check
# the W6432 variable.
$archName = $null
$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -eq 'AMD64') {
  $archName = 'x64'
}
elseif ($arch -eq 'ARM64') {
  $archName = 'arm64'
}
else {
  $w6432 = $env:PROCESSOR_ARCHITEW6432
  if ($w6432 -eq 'AMD64') {
    $archName = 'x64'
  }
  elseif ($w6432 -eq 'ARM64') {
    $archName = 'arm64'
  }
}
if (-not $archName) {
  Stop-WithError "Unsupported CPU architecture: $arch"
}

$asset = "lode-setup-windows-${archName}.exe"
$url = "${BaseUrl}/releases/latest/download/${asset}"

$tag = 'latest'
try {
  Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect = $false
  $http = [System.Net.Http.HttpClient]::new($handler)
  $response = $http.GetAsync($url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
  try {
    if ($response.Headers.Location) {
      $suffix = [string]$response.Headers.Location -replace '.*releases/download/', ''
      $tag = ($suffix -split '/')[0]
    }
  }
  finally {
    $response.Dispose()
  }
  $http.Dispose()
}
catch {
}

$cacheDir = Join-Path $env:LOCALAPPDATA "LodeSetup\$tag"
$bin = Join-Path $cacheDir $asset

if (-not (Test-Path $bin)) {
  if ($script:UseColor) {
    Write-Host 'Downloading ' -NoNewline
    Write-Host (Format-Hyperlink $url $asset) -ForegroundColor Cyan -NoNewline
    Write-Host " ($tag)..."
  }
  else {
    Write-Host "Downloading $(Format-Hyperlink $url $asset) ($tag)..."
  }
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
  $tmp = Join-Path $cacheDir "$asset.tmp"
  # Stream the download with a real-time percentage indicator. HttpClient
  # with ResponseHeadersRead avoids buffering the full file in memory and
  # lets us count bytes as they arrive over the wire.
  try {
    Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $http = [System.Net.Http.HttpClient]::new($handler)
    $response = $http.GetAsync($url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    $total = if ($response.Content.Headers.ContentLength) { [long]$response.Content.Headers.ContentLength } else { 0 }
    $net = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $buf = New-Object byte[] 65536
    $got = 0
    $out = [System.IO.File]::Create($tmp)
    try {
      while (($n = $net.Read($buf, 0, $buf.Length)) -gt 0) {
        $out.Write($buf, 0, $n)
        $got += $n
        if ($total -gt 0) {
          $pct = [math]::Round(($got / $total) * 100)
          Write-Host "`rDownloading... $pct%" -NoNewline
        }
        else {
          $mb = [math]::Round($got / 1MB, 1)
          Write-Host "`rDownloading... ${mb} MB" -NoNewline
        }
      }
    }
    finally {
      $out.Close()
      $net.Dispose()
      $response.Dispose()
      $http.Dispose()
    }
    Write-Host ''
  }
  catch {
    Stop-WithError "download failed: $url"
  }
  Move-Item -Force $tmp $bin
}

# The binary runs as a child process; its interactive session happens in
# this console. After it returns, propagate the exit code without ever
# taking the user's session with it.
& $bin @args
$exitCode = $LASTEXITCODE
if ($script:IsFileProcess) {
  Pause-BeforeExit
  exit $exitCode
}
$global:LASTEXITCODE = $exitCode
