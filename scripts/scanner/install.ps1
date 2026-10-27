$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'run.ps1'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$shellCommand = Get-Command pwsh -ErrorAction SilentlyContinue
$shellExecutable = if ($shellCommand) { $shellCommand.Source } else { "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" }
$action = New-ScheduledTaskAction -Execute $shellExecutable -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`"" -WorkingDirectory $PSScriptRoot
# O executor e o banco conferem America/Sao_Paulo, mesmo se o Windows usar outro fuso.
# O tick leve consulta a fila somente dentro da janela; não abre navegador fora dela.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 6) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'GKLI-Scanner-Enriquecimento' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Scanner noturno de contatos e evidências de pagamento, sem captação de inadimplência.' -Force | Out-Null
Get-ScheduledTask -TaskName 'GKLI-Scanner-Enriquecimento' | Select-Object TaskName,State
