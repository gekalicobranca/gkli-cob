param([Parameter(Mandatory=$true)][string]$Url)
$ErrorActionPreference = 'Stop'
$raizAcordos = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$logAcordos = Join-Path $env:LOCALAPPDATA 'GKLI/acordos-manuais'
New-Item -ItemType Directory -Path $logAcordos -Force | Out-Null
$arquivoLog = Join-Path $logAcordos ("execucao-" + [guid]::NewGuid().ToString() + '.log')
Push-Location -LiteralPath $raizAcordos
try {
    & node --env-file=.env.local (Join-Path $PSScriptRoot 'manual-launcher.mjs') $Url *> $arquivoLog
    exit $LASTEXITCODE
} finally { Pop-Location }
