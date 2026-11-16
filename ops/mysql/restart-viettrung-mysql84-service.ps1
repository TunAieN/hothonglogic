$ErrorActionPreference = 'Stop'

$serviceName = 'VietTrungMySQL84'
$base = 'C:\ProgramData\VietTrungOrder\MySQL\8.4'
$marker = Join-Path $base 'restart-test.complete'
$log = Join-Path $base 'restart-test.log'

Start-Transcript -LiteralPath $log -Append | Out-Null
try {
    $service = Get-Service -Name $serviceName -ErrorAction Stop
    if ($service.Status -ne [ServiceProcess.ServiceControllerStatus]::Running) {
        throw 'Service was not running before the restart test.'
    }
    Stop-Service -Name $serviceName -Force
    $service = Get-Service -Name $serviceName
    $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(30))
    $stoppedAt = Get-Date
    Start-Service -Name $serviceName
    $service = Get-Service -Name $serviceName
    $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(30))
    [ordered]@{
        stopped_at = $stoppedAt.ToString('o')
        restarted_at = (Get-Date).ToString('o')
        status = $service.Status.ToString()
    } | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding utf8
} finally {
    Stop-Transcript | Out-Null
}
