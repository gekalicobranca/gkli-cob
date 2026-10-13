$ErrorActionPreference = 'Stop'
$launcherMaestro = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'executar-manual.ps1')).Path
$protocoloMaestro = 'HKCU:\Software\Classes\gkli-maestro'
New-Item -Path $protocoloMaestro -Force | Out-Null
Set-Item -LiteralPath $protocoloMaestro -Value 'URL:Executor manual do Maestro GKLI'
New-ItemProperty -LiteralPath $protocoloMaestro -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
$comandoMaestro = Join-Path $protocoloMaestro 'shell\open\command'
New-Item -Path $comandoMaestro -Force | Out-Null
Set-Item -LiteralPath $comandoMaestro -Value ('powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcherMaestro + '" -Url "%1"')
Write-Output 'Executor manual do Maestro instalado. Nenhum agente ou agendamento foi ativado.'
