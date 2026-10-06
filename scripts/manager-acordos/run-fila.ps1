$ErrorActionPreference = 'Stop'
$repoAcordos = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location -LiteralPath $repoAcordos
try {
    & node --env-file=.env.local (Join-Path $PSScriptRoot 'fila.mjs')
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
