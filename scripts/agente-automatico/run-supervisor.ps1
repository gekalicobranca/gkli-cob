$ErrorActionPreference = 'Stop'
$projectDir = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$logDir = Join-Path $projectDir '.codex-tmp\maestro-supervisor'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\GKLI-Maestro-Supervisor', [ref]$createdNew)
if (-not $createdNew) { $mutex.Dispose(); exit 0 }
try {
  while ($true) {
    $lockPath = Join-Path $logDir 'supervisor.lock'
    if (Test-Path -LiteralPath $lockPath) {
      try {
        $owner = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
        if (Get-Process -Id $owner.pid -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 30; continue }
      } catch { }
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $child = Start-Process -FilePath $nodeExecutable -ArgumentList '--env-file=.env.local scripts/agente-automatico/supervisor.mjs' -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir "supervisor-$stamp.stdout.log") -RedirectStandardError (Join-Path $logDir "supervisor-$stamp.stderr.log")
    $child.WaitForExit()
    Start-Sleep -Seconds 30
  }
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
