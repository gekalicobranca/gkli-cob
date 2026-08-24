param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('agente:worker', 'agente:worker:manager', 'agente:worker:square-guarulhos', 'agente:worker:verti', 'agente:worker:lello')]
  [string]$NpmScript,
  [Parameter(Mandatory = $true)]
  [string]$LogName
)

$ErrorActionPreference = 'Continue'
$projectDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$logDir = Join-Path $projectDir '.codex-tmp\worker-logs'
$outputLog = Join-Path $logDir "$LogName.log"
$errorLog = Join-Path $logDir "$LogName-error.log"
$createdNew = $false
$mutexName = "Local\GKLI-$($NpmScript.Replace(':', '-'))"
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)

if (-not $createdNew) { exit 0 }

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

try {
  while ($true) {
    $process = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', $NpmScript) -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
    $process.WaitForExit()
    Start-Sleep -Seconds 10
  }
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
