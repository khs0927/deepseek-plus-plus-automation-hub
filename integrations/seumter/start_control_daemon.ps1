$ErrorActionPreference = 'Stop'
$taskName = 'Aside-Seumter-Control'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$healthUrl = 'http://127.0.0.1:3300/health'

function Test-ControlDaemon {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1 -ErrorAction Stop
        if ($health.status -eq 'ok') { return $true }
    } catch {
        return $false
    }
    return $false
}

if (Test-ControlDaemon) {
    Write-Host 'Seumter control daemon is already running.'
    exit 0
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
    & (Join-Path $root 'install_control_task.ps1')
} else {
    Start-ScheduledTask -TaskName $taskName
    Write-Host "Started scheduled task: $taskName"
}

for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-ControlDaemon) {
        Write-Host 'Seumter control daemon is ready on http://127.0.0.1:3300.'
        exit 0
    }
}

Write-Error 'Seumter control daemon did not become ready.'
exit 1
