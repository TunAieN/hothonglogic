$ErrorActionPreference = 'Stop'

$taskName = 'VietTrungMySQL84-NightlyBackup'
$programDataBase = 'C:\ProgramData\VietTrungOrder\MySQL\8.4'
$sourceScript = 'C:\laragon\www\extention\ops\mysql\backup-viettrung-mysql84.ps1'
$targetScript = Join-Path $programDataBase 'backup\backup.ps1'
$backupRoot = 'E:\MySQL_VietTrung_Backups\automatic'
$marker = Join-Path $programDataBase 'backup-task-setup.complete'

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask -and (Test-Path -LiteralPath $marker)) {
    throw "Scheduled task $taskName was already completed; refusing to overwrite it."
}
if (-not (Test-Path -LiteralPath (Join-Path $programDataBase 'secrets\backup-password.dpapi'))) {
    throw 'Protected SYSTEM backup credential is missing.'
}

Copy-Item -LiteralPath $sourceScript -Destination $targetScript -Force
foreach ($directory in @($backupRoot, (Join-Path $backupRoot 'daily'), (Join-Path $backupRoot 'weekly'), (Join-Path $backupRoot 'monthly'))) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $backupRoot /inheritance:r /grant:r 'SYSTEM:(OI)(CI)(F)' 'BUILTIN\Administrators:(OI)(CI)(F)' "$operator`:(OI)(CI)(M)" | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the automated backup directory.' }
& icacls.exe $targetScript /inheritance:r /grant:r 'SYSTEM:(R)' 'BUILTIN\Administrators:(F)' "$operator`:(R)" | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the backup script.' }

$powershell = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$targetScript`""
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At '02:30'
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 5)
if ($existingTask) {
    $existingAction = @($existingTask.Actions)[0]
    if ($existingTask.Principal.UserId -ne 'SYSTEM' -or $existingAction.Execute -ne $powershell -or $existingAction.Arguments -ne $arguments) {
        throw 'Existing partial task does not match the approved SYSTEM backup action.'
    }
} else {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Nightly protected backup for VietTrung MySQL 8.4 on port 3310.' | Out-Null
}

Start-ScheduledTask -TaskName $taskName
$deadline = (Get-Date).AddSeconds(90)
do {
    Start-Sleep -Seconds 1
    $task = Get-ScheduledTask -TaskName $taskName
} while ($task.State -eq 'Running' -and (Get-Date) -lt $deadline)

if ($task.State -eq 'Running') { throw 'Backup task test exceeded 90 seconds.' }
$info = Get-ScheduledTaskInfo -TaskName $taskName
if ($info.LastTaskResult -ne 0) { throw "Backup task failed with result $($info.LastTaskResult)." }

[ordered]@{
    created_at = (Get-Date).ToString('o')
    task = $taskName
    run_as = 'SYSTEM'
    schedule = 'Daily 02:30 local time'
    last_result = $info.LastTaskResult
    last_run = $info.LastRunTime.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding utf8
