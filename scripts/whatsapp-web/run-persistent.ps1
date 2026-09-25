$ErrorActionPreference = 'Stop'
$workerRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$logRoot = Join-Path $workerRoot '.whatsapp-web'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
Set-Location -LiteralPath $PSScriptRoot
while ($true) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    try {
        $workerProcess = Start-Process -FilePath $nodeExecutable -ArgumentList '--env-file=../../.env.local supervisor.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot "persistent-$stamp.stdout.log") -RedirectStandardError (Join-Path $logRoot "persistent-$stamp.stderr.log")
        $workerProcess.WaitForExit()
        Add-Content -LiteralPath (Join-Path $logRoot 'persistent.log') -Value "$(Get-Date -Format o) Supervisor encerrou; nova tentativa em 15s."
    } catch {
        Add-Content -LiteralPath (Join-Path $logRoot 'persistent.log') -Value "$(Get-Date -Format o) Falha: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 15
}
