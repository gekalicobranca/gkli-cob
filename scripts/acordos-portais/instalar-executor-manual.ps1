$ErrorActionPreference = 'Stop'
$launcherAcordos = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'executar-manual.ps1')).Path
$protocoloAcordos = 'HKCU:\Software\Classes\gkli-acordos'
New-Item -Path $protocoloAcordos -Force | Out-Null
Set-Item -LiteralPath $protocoloAcordos -Value 'URL:Executor manual de acordos GKLI'
New-ItemProperty -LiteralPath $protocoloAcordos -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
$comandoAcordos = Join-Path $protocoloAcordos 'shell\open\command'
New-Item -Path $comandoAcordos -Force | Out-Null
Set-Item -LiteralPath $comandoAcordos -Value ('powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcherAcordos + '" -Url "%1"')
Write-Output 'Executor manual instalado para este usuário. Nenhum agente foi iniciado e nenhum agendamento foi criado.'
