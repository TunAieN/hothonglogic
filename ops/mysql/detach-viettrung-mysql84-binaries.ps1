$ErrorActionPreference = 'Stop'

$serviceName = 'VietTrungMySQL84'
$source = 'C:\laragon\bin\mysql\mysql-8.4.3-winx64'
$destination = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3'
$programData = 'C:\ProgramData\VietTrungOrder\MySQL\8.4'
$approvedConfig = 'C:\laragon\www\extention\ops\mysql\viettrung-mysql84.ini'
$approvedBackup = 'C:\laragon\www\extention\ops\mysql\backup-viettrung-mysql84.ps1'
$marker = Join-Path $programData 'binary-detach.complete'
$failure = Join-Path $programData 'binary-detach.failed'
$log = Join-Path $programData 'binary-detach.log'

if (-not (Test-Path -LiteralPath (Join-Path $source 'bin\mysqld.exe'))) { throw 'Source MySQL 8.4.3 binary is missing.' }

Start-Transcript -LiteralPath $log -Append | Out-Null
$service = Get-Service -Name $serviceName -ErrorAction Stop
Stop-Service -Name $serviceName -Force
$service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(30))

try {
    if (-not (Test-Path -LiteralPath $destination)) {
        New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Recurse
    }
    $mysqld = Join-Path $destination 'bin\mysqld.exe'
    $mysqldump = Join-Path $destination 'bin\mysqldump.exe'
    if (-not (Test-Path -LiteralPath $mysqld) -or -not (Test-Path -LiteralPath $mysqldump)) {
        throw 'Independent MySQL binary copy is incomplete.'
    }

    Copy-Item -LiteralPath $approvedConfig -Destination (Join-Path $programData 'my.ini') -Force
    Copy-Item -LiteralPath $approvedBackup -Destination (Join-Path $programData 'backup\backup.ps1') -Force

    $serviceIdentity = "NT SERVICE\$serviceName"
    $operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $destination /inheritance:r /grant:r 'SYSTEM:(OI)(CI)(F)' 'BUILTIN\Administrators:(OI)(CI)(F)' "$operator`:(OI)(CI)(RX)" "$serviceIdentity`:(OI)(CI)(RX)" | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Could not protect the independent binary directory.' }

    $binPath = "`"$mysqld`" --defaults-file=C:\ProgramData\VietTrungOrder\MySQL\8.4\my.ini $serviceName"
    $serviceRegistryPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$serviceName"
    Set-ItemProperty -LiteralPath $serviceRegistryPath -Name ImagePath -Value $binPath
    $configuredPath = (Get-ItemProperty -LiteralPath $serviceRegistryPath).ImagePath
    if ($configuredPath -notlike "*$destination\bin\mysqld.exe*") {
        throw 'Windows Service ImagePath did not change to the independent binary.'
    }

    Start-Service -Name $serviceName
    $service = Get-Service -Name $serviceName
    $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(30))
    [ordered]@{
        completed_at = (Get-Date).ToString('o')
        basedir = $destination
        service = $serviceName
        status = $service.Status.ToString()
    } | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding utf8
    Remove-Item -LiteralPath $failure -Force -ErrorAction SilentlyContinue
} catch {
    "$(Get-Date -Format o) $($_.Exception.Message)" | Set-Content -LiteralPath $failure -Encoding utf8
    if ((Get-Service -Name $serviceName -ErrorAction SilentlyContinue).Status -ne [ServiceProcess.ServiceControllerStatus]::Running) {
        Start-Service -Name $serviceName -ErrorAction SilentlyContinue
    }
    throw
} finally {
    Stop-Transcript | Out-Null
}
