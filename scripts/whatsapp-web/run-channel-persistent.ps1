param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('escritorio', 'painel')]
    [string]$Channel
)
$ErrorActionPreference = 'Stop'
$workerRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$logRoot = Join-Path $workerRoot '.whatsapp-web'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\GKLI-WhatsApp-$Channel", [ref]$createdNew)
if (-not $createdNew) { $mutex.Dispose(); exit 0 }
$eventLog = Join-Path $logRoot "persistent-$Channel.log"
$lastOwner = $null
try {
    while ($true) {
        try {
            # Adopt an existing process without stopping its authenticated browsers.
            $existing = $null
            if ($Channel -eq 'escritorio') {
                $lockPath = Join-Path $logRoot 'supervisor-escritorio.lock'
                if (Test-Path -LiteralPath $lockPath) {
                    $ownerId = 0
                    if ([int]::TryParse((Get-Content -LiteralPath $lockPath -Raw).Trim(), [ref]$ownerId) -and $ownerId -gt 0) {
                        $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
                        if ($candidate.Name -eq 'node.exe' -and $candidate.CommandLine -match 'supervisor\.mjs' -and $candidate.CommandLine -match '\.env\.whatsapp-escritorio') { $existing = $candidate }
                    }
                }
                $nodeArguments = '--env-file=../../.env.local --env-file=../../.env.whatsapp-escritorio supervisor.mjs'
            } else {
                $listener = Get-NetTCPConnection -LocalPort 3877 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($listener) {
                    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
                    if ($candidate.Name -eq 'node.exe' -and $candidate.CommandLine -match 'qr-dashboard\.mjs') { $existing = $candidate }
                    else { throw 'Porta 3877 ocupada por outro aplicativo; nenhum processo foi encerrado.' }
                }
                $nodeArguments = 'qr-dashboard.mjs'
            }
            if ($existing) {
                if ($lastOwner -ne $existing.ProcessId) {
                    Add-Content -LiteralPath $eventLog -Value "$(Get-Date -Format o) Processo existente acompanhado: $($existing.ProcessId)."
                    $lastOwner = $existing.ProcessId
                }
            } else {
                $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
                $child = Start-Process -FilePath $nodeExecutable -ArgumentList $nodeArguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot "persistent-$Channel-$stamp.stdout.log") -RedirectStandardError (Join-Path $logRoot "persistent-$Channel-$stamp.stderr.log")
                Add-Content -LiteralPath $eventLog -Value "$(Get-Date -Format o) Processo iniciado: $($child.Id)."
                $lastOwner = $null
                $child.WaitForExit()
                Add-Content -LiteralPath $eventLog -Value "$(Get-Date -Format o) Processo encerrou com codigo $($child.ExitCode); nova tentativa em 15s."
            }
        } catch {
            Add-Content -LiteralPath $eventLog -Value "$(Get-Date -Format o) Falha: $($_.Exception.Message)"
        }
        Start-Sleep -Seconds 15
    }
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
