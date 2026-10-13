param([Parameter(Mandatory=$true)][string]$Url)
$ErrorActionPreference = 'Stop'
$raizMaestro = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$logsMaestro = Join-Path $env:LOCALAPPDATA 'GKLI/maestro-manual'
New-Item -ItemType Directory -Path $logsMaestro -Force | Out-Null
$arquivoLog = Join-Path $logsMaestro ('execucao-' + [guid]::NewGuid().ToString() + '.log')
Push-Location -LiteralPath $raizMaestro
try {
    & node --env-file=.env.local (Join-Path $PSScriptRoot 'manual-launcher.mjs') $Url *> $arquivoLog
    exit $LASTEXITCODE
} finally { Pop-Location }
