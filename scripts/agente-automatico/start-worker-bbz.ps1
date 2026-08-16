$ErrorActionPreference = 'Continue'
$projectDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$logDir = Join-Path $projectDir '.codex-tmp\worker-logs'
$logFile = Join-Path $logDir 'bbz-worker.log'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Set-Location -LiteralPath $projectDir

while ($true) {
  "$(Get-Date -Format o) Iniciando worker BBZ." | Out-File -FilePath $logFile -Append -Encoding utf8
  & npm.cmd run agente:worker *>> $logFile
  "$(Get-Date -Format o) Worker encerrado; reiniciando em 10 segundos." | Out-File -FilePath $logFile -Append -Encoding utf8
  Start-Sleep -Seconds 10
}
