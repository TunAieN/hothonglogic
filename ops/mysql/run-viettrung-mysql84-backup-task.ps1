$ErrorActionPreference = 'Stop'

$taskName = 'VietTrungMySQL84-NightlyBackup'
$marker = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\backup-independent-binary-test.complete'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($task.Principal.UserId -ne 'SYSTEM') { throw 'Backup task is not configured for SYSTEM.' }

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
    completed_at = (Get-Date).ToString('o')
    last_run = $info.LastRunTime.ToString('o')
    result = $info.LastTaskResult
    run_as = $task.Principal.UserId
} | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding utf8
