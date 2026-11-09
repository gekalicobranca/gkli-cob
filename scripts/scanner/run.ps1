$ErrorActionPreference = 'Stop'
$projectDir = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$logDir = Join-Path $projectDir '.codex-tmp/scanner-executor'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logPath = Join-Path $logDir ("scanner-" + (Get-Date -Format 'yyyyMMdd') + '.log')
Push-Location -LiteralPath $projectDir
try {
    Add-Content -LiteralPath $logPath -Value ((Get-Date -Format o) + ' tick')
    # A rotina agendada executa o scanner com os relatórios por e-mail desativados.
    $env:SCANNER_RELATORIOS_EMAIL_ATIVO = 'false'
    & $nodeExecutable --env-file=.env.local --env-file-if-exists=.env.scanner.local scripts/scanner/easy-pague-worker.mjs *>> $logPath
    if ($LASTEXITCODE -eq 10) { exit 0 }
    & $nodeExecutable --env-file=.env.local --env-file-if-exists=.env.scanner.local scripts/scanner/worker.mjs --once *>> $logPath
    if ($LASTEXITCODE -ne 0) { throw 'Executor do scanner terminou com erro.' }
} finally { Pop-Location }
