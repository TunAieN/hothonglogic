$ErrorActionPreference = 'Stop'

$source = 'C:\laragon\www\extention\ops\mysql\viettrung-mysql84.ini'
$target = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\my.ini'
$serviceName = 'VietTrungMySQL84'
$marker = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\config-update.complete'

if (-not (Test-Path -LiteralPath $source)) { throw 'Approved source config is missing.' }
if (-not (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) { throw 'Expected service is missing.' }

Copy-Item -LiteralPath $source -Destination $target -Force
Restart-Service -Name $serviceName -Force
$service = Get-Service -Name $serviceName
$service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(30))
"$(Get-Date -Format o) config copied and service restarted" | Set-Content -LiteralPath $marker -Encoding utf8
