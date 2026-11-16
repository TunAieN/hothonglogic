$ErrorActionPreference = 'Stop'

$base = 'C:\ProgramData\VietTrungOrder\MySQL\8.4'
$serviceName = 'VietTrungMySQL84'
$serviceIdentity = "NT SERVICE\$serviceName"
$mysqld = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysqld.exe'
$log = Join-Path $base 'service-setup.log'
$complete = Join-Path $base 'service-setup.complete'
$failed = Join-Path $base 'service-setup.failed'

Start-Transcript -LiteralPath $log -Append | Out-Null
try {
    if (-not (Test-Path -LiteralPath (Join-Path $base 'data\auto.cnf'))) {
        throw 'The initialized ProgramData datadir was not found.'
    }
    $existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($existing) {
        $imagePath = (Get-ItemProperty -LiteralPath "HKLM:\SYSTEM\CurrentControlSet\Services\$serviceName").ImagePath
        if ($imagePath -notlike "*$base\my.ini*") {
            throw "Existing service $serviceName does not point to the approved config."
        }
        if (Test-Path -LiteralPath $complete) {
            throw "Service $serviceName was already completed; refusing to overwrite it."
        }
    } else {
        & $mysqld --install $serviceName --defaults-file="$base\my.ini"
        if ($LASTEXITCODE -ne 0) { throw "Service installation failed with exit code $LASTEXITCODE." }
    }

    & sc.exe sidtype $serviceName unrestricted | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Could not enable the service SID.' }
    & sc.exe config $serviceName obj= $serviceIdentity start= delayed-auto | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Could not configure the virtual service account.' }
    & sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/15000/none/0 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Could not configure service recovery actions.' }
    & sc.exe failureflag $serviceName 1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Could not enable service recovery actions.' }

    $operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $base /inheritance:r /grant:r 'SYSTEM:(OI)(CI)(F)' 'BUILTIN\Administrators:(OI)(CI)(F)' "$operator`:(OI)(CI)(RX)" "$serviceIdentity`:(OI)(CI)(RX)" | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Could not set the base directory ACL.' }
    foreach ($directory in @('data', 'logs', 'run', 'secure-files')) {
        & icacls.exe (Join-Path $base $directory) /grant:r "$serviceIdentity`:(OI)(CI)(M)" | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Could not set the $directory ACL." }
    }
    & icacls.exe (Join-Path $base 'secrets') /grant:r "$operator`:(OI)(CI)(M)" | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Could not set the secrets directory ACL.' }

    Start-Service -Name $serviceName
    $service = Get-Service -Name $serviceName
    $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(30))
    "$(Get-Date -Format o) service installed and running" | Set-Content -LiteralPath $complete -Encoding utf8
    Remove-Item -LiteralPath $failed -Force -ErrorAction SilentlyContinue
} catch {
    "$(Get-Date -Format o) $($_.Exception.Message)" | Set-Content -LiteralPath $failed -Encoding utf8
    throw
} finally {
    Stop-Transcript | Out-Null
}
