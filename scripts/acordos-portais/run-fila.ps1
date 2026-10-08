param([Parameter(Mandatory=$true)][ValidateSet('lello','bbz','atipass','hflex')][string]$Portal)
$raizProjeto = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Push-Location $raizProjeto
try { & node --env-file=.env.local (Join-Path $PSScriptRoot 'fila.mjs') $Portal; exit $LASTEXITCODE }
finally { Pop-Location }
