$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'run-persistent.ps1'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`"" -WorkingDirectory $PSScriptRoot
$login = New-ScheduledTaskTrigger -AtLogOn -User $identity
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'GKLI-WhatsApp-Supervisor' -Action $action -Trigger @($login, $watchdog) -Settings $settings -Principal $principal -Description 'Mantém o supervisor dos canais WhatsApp ativo e inicia após login.' -Force | Out-Null
Start-ScheduledTask -TaskName 'GKLI-WhatsApp-Supervisor'
Get-ScheduledTask -TaskName 'GKLI-WhatsApp-Supervisor' | Select-Object TaskName, State
