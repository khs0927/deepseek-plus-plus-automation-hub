[CmdletBinding()]
param(
  [ValidateSet('all', 'chrome', 'edge', 'chromium', 'firefox')]
  [string]$Browser = 'all',
  [string]$ChromeExtensionId,
  [string]$EdgeExtensionId,
  [string]$ChromiumExtensionId,
  [switch]$SkipShell,
  [switch]$SkipOfficecli,
  [switch]$SkipBuild,
  [switch]$ForceDependencies
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $repoRoot

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found. Install Node.js 18.17+ from https://nodejs.org/ and run this file again."
  }
}

function Invoke-Npm([string[]]$Arguments) {
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

try {
  Require-Command 'node.exe'
  Require-Command 'npm.cmd'

  $nodeVersion = (& node.exe --version).Trim()
  Write-Host "DeepSeek++ one-click setup ($nodeVersion)"
  Write-Host "Repository: $repoRoot"

  if ($ForceDependencies -or -not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules'))) {
    Write-Host 'Installing locked dependencies with npm ci...'
    Invoke-Npm @('ci')
  } else {
    Write-Host 'node_modules already exists; use -ForceDependencies to reinstall from package-lock.json.'
  }

  $envFile = Join-Path $repoRoot '.env'
  $envExample = Join-Path $repoRoot '.env.example'
  if (-not (Test-Path -LiteralPath $envFile) -and (Test-Path -LiteralPath $envExample)) {
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Host 'Created .env from .env.example. Credentials were not added.'
  }

  $setupArguments = @('run', 'setup', '--', '--browser', $Browser)
  if ($ChromeExtensionId) { $setupArguments += @('--chrome-extension-id', $ChromeExtensionId) }
  if ($EdgeExtensionId) { $setupArguments += @('--edge-extension-id', $EdgeExtensionId) }
  if ($ChromiumExtensionId) { $setupArguments += @('--chromium-extension-id', $ChromiumExtensionId) }
  if ($SkipShell) { $setupArguments += '--skip-shell' }
  if ($SkipOfficecli) { $setupArguments += '--skip-officecli' }
  if ($SkipBuild) { $setupArguments += '--skip-build' }

  Invoke-Npm $setupArguments

  Write-Host ''
  Write-Host 'Setup completed.' -ForegroundColor Green
  Write-Host 'Next: load the generated extension once in the browser developer page.'
  Write-Host 'Chrome: chrome://extensions -> Load unpacked -> dist/chrome-mv3'
  Write-Host 'Edge:   edge://extensions -> Load unpacked -> dist/edge-mv3'
  Write-Host 'Firefox: about:debugging -> This Firefox -> Load Temporary Add-on -> dist/firefox-mv3/manifest.json'
  Write-Host 'Chrome/Edge Native Host registration needs the extension ID shown after the unpacked load.'
  Write-Host 'Login, API keys, and MCP credentials remain user-managed.'
} catch {
  Write-Error $_
  exit 1
}
