param(
  [string]$Codigo,
  [switch]$Todos,
  [switch]$Listar,
  [switch]$MostrarNavegador,
  [string]$Saida
)

$ErrorActionPreference = 'Stop'
$worker = Join-Path $PSScriptRoot 'worker.mjs'
$argumentos = @($worker)
if ($Codigo -and $Todos) { throw 'Use -Codigo ou -Todos.' }
if ($Codigo) { $argumentos += @('--codigo', $Codigo) }
if ($Todos) { $argumentos += '--todos' }
if ($Listar) { $argumentos += '--listar' }
if ($MostrarNavegador) { $argumentos += '--mostrar-navegador' }
if ($Saida) { $argumentos += @('--saida', $Saida) }
& node @argumentos
exit $LASTEXITCODE
