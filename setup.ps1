# -- Lode Setup Bootstrap (Windows) ----------------------------------
# Downloads the prebuilt lode-setup binary for this platform from the
# latest GitHub release and runs it. All setup logic lives in the
# binary (cli/), so this script only detects the architecture,
# downloads the cached binary, and launches it.
#
# Usage:
#   irm https://raw.githubusercontent.com/Nort1346/Lode/main/setup.ps1 | iex
#   .\setup.ps1
# --------------------------------------------------------------------

$ErrorActionPreference = 'Stop'

$Repo = 'Nort1346/Lode'

function Stop-WithError([string]$Message) {
  Write-Error $Message
  exit 1
}

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
$url = "https://github.com/${Repo}/releases/latest/download/${asset}"

# Tag from the redirect Location (…/releases/download/<tag>/<asset>),
# used only to version the cache directory.
$tag = 'latest'
try {
  $http = [System.Net.Http.HttpClient]::new()
  $http.AllowAutoRedirect = $false
  $response = $http.GetAsync($url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
  try {
    if ($response.Headers.Location) {
      $suffix = [string]$response.Headers.Location -replace '.*releases/download/', ''
      $tag = ($suffix -split '/')[0]
    }
  }
  finally {
    $response.Dispose()
    $http.Dispose()
  }
}
catch {
  # No redirect info - fall back to the "latest" cache directory.
}

$cacheDir = Join-Path $env:LOCALAPPDATA "LodeSetup\$tag"
$bin = Join-Path $cacheDir $asset

if (-not (Test-Path $bin)) {
  Write-Host "Downloading $asset ($tag)..."
  New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
  Invoke-WebRequest -Uri $url -OutFile (Join-Path $cacheDir "$asset.tmp")
  Move-Item -Force (Join-Path $cacheDir "$asset.tmp") $bin
}

# The child runs in this console window, so the interactive session
# survives by construction. Arguments are passed through.
& $bin @args
exit $LASTEXITCODE
