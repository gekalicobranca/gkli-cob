$ErrorActionPreference = 'Stop'
$workerRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$logRoot = Join-Path $workerRoot '.whatsapp-web'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
Set-Location -LiteralPath $PSScriptRoot
while ($true) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    try {
        # A supervisor started elsewhere may already own the sessions. Wait for
        # it instead of launching a failing Node process every fifteen seconds.
        $lockPath = Join-Path $logRoot 'supervisor.lock'
        if (Test-Path -LiteralPath $lockPath) {
            $supervisorProcessId = 0
            if ([int]::TryParse((Get-Content -LiteralPath $lockPath -Raw).Trim(), [ref]$supervisorProcessId) -and $supervisorProcessId -gt 0) {
                $existingSupervisor = Get-Process -Id $supervisorProcessId -ErrorAction SilentlyContinue
                if ($existingSupervisor) {
                    Start-Sleep -Seconds 15
                    continue
                }
            }
        }
        $workerProcess = Start-Process -FilePath $nodeExecutable -ArgumentList '--env-file=../../.env.local supervisor.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot "persistent-$stamp.stdout.log") -RedirectStandardError (Join-Path $logRoot "persistent-$stamp.stderr.log")
        $workerProcess.WaitForExit()
        Add-Content -LiteralPath (Join-Path $logRoot 'persistent.log') -Value "$(Get-Date -Format o) Supervisor encerrou; nova tentativa em 15s."
    } catch {
        Add-Content -LiteralPath (Join-Path $logRoot 'persistent.log') -Value "$(Get-Date -Format o) Falha: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 15
}
