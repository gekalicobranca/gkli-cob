$projectDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runnerPath = Join-Path $PSScriptRoot 'run-worker.ps1'
$workers = @(
  @{ Script = 'agente:worker'; Log = 'bbz-worker' },
  @{ Script = 'agente:worker:manager'; Log = 'manager-worker' },
  @{ Script = 'agente:worker:square-guarulhos'; Log = 'square-guarulhos-worker' },
  @{ Script = 'agente:worker:verti'; Log = 'verti-worker' },
  @{ Script = 'agente:worker:lello'; Log = 'lello-worker' },
  @{ Script = 'agente:worker:atipass'; Log = 'atipass-worker' }
)

foreach ($worker in $workers) {
  $arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runnerPath`" -NpmScript `"$($worker.Script)`" -LogName `"$($worker.Log)`""
  Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WorkingDirectory $projectDir -WindowStyle Hidden
}
