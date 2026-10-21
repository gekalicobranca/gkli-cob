$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'run-channel-persistent.ps1'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
foreach ($channel in @('escritorio', 'painel')) {
    $taskName = if ($channel -eq 'escritorio') { 'GKLI-WhatsApp-Escritorio' } else { 'GKLI-WhatsApp-Painel' }
    $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$runner`" -Channel $channel" -WorkingDirectory $PSScriptRoot
    $login = New-ScheduledTaskTrigger -AtLogOn -User $identity
    $login.Delay = if ($channel -eq 'escritorio') { 'PT45S' } else { 'PT60S' }
    $watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($login, $watchdog) -Settings $settings -Principal $principal -Description "WhatsApp ${channel}: inicia apos login e recupera encerramentos sem duplicar processos existentes." -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
}
