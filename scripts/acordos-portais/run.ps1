param(
  [Parameter(Mandatory=$true)][ValidateSet('lello','bbz','atipass','hflex')][string]$Portal,
  [Parameter(Mandatory=$true)][string]$Condominio,
  [string]$Codigo,
  [string]$Saida,
  [switch]$MostrarNavegador
)
$workerArgs = @((Join-Path $PSScriptRoot 'worker.mjs'), '--portal', $Portal, '--condominio', $Condominio)
if ($Codigo) { $workerArgs += @('--codigo', $Codigo) }
if ($Saida) { $workerArgs += @('--saida', $Saida) }
if ($MostrarNavegador) { $workerArgs += '--mostrar-navegador' }
& node @workerArgs
exit $LASTEXITCODE
