$edgePaths = @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
)

$edgeExe = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edgeExe) {
    Write-Error "Edge executable not found!"
    exit 1
}

$cdpVersionUrl = 'http://127.0.0.1:9222/json/version'
$cdpListUrl = 'http://127.0.0.1:9222/json/list'
$targetUrl = 'https://www.eais.go.kr/websquare/websquare.html?w2xPath=/static/ui/layout/selfgovn/index.xml&menuId=BPMABA06F01&mgmNo=202629040001032656600&jobGbCd=KC'
$deepSeekUrl = 'https://chat.deepseek.com/'

function Test-CdpReady {
    try {
        $null = Invoke-RestMethod -Uri $cdpVersionUrl -TimeoutSec 1 -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Ensure-DeepSeekTab {
    try {
        $targets = Invoke-RestMethod -Uri $cdpListUrl -TimeoutSec 1 -ErrorAction Stop
        $exists = @($targets | Where-Object { $_.url -like 'https://chat.deepseek.com/*' }).Count -gt 0
        if ($exists) {
            Write-Host 'DeepSeek tab is already open.'
            return
        }
    } catch {
        # The browser is still starting; the launch below will open the tab.
    }
    Start-Process -FilePath $edgeExe -ArgumentList @(
        '--user-data-dir=C:\edge_dev',
        '--new-window',
        $deepSeekUrl
    )
    Write-Host 'Opened DeepSeek Chat in the controlled Edge profile.'
}

# Reuse the existing controlled browser. Starting Edge with a URL every time
# creates another tab/window even when the same CDP instance is already alive.
if (Test-CdpReady) {
    Write-Host "Controlled Edge is already running on CDP 9222; reusing it."
    Ensure-DeepSeekTab
    exit 0
}

# If a stale launcher is still holding the profile/port, stop only its root
# process before starting a clean controlled instance.
$procs = Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object {
    $_.CommandLine -match 'edge_dev' -or $_.CommandLine -match '9222'
} | Where-Object { $_.CommandLine -notmatch '--type=' }

foreach ($p in $procs) {
    Write-Host "Stopping stale controlled Edge PID: $($p.ProcessId)"
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 800

Write-Host "Launching visible Edge instance from: $edgeExe"
Start-Process -FilePath $edgeExe -ArgumentList @(
    '--remote-debugging-port=9222',
    '--remote-allow-origins=*',
    '--user-data-dir=C:\edge_dev',
    '--start-maximized',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-insecure-localhost',
    '--ignore-certificate-errors',
    '--disable-features=BlockInsecurePrivateNetworkRequests',
    $targetUrl
)

for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-CdpReady) {
        Write-Host "Controlled Edge is ready on CDP 9222."
        Ensure-DeepSeekTab
        exit 0
    }
}

Write-Error "Edge started but CDP 9222 did not become ready."
exit 1
