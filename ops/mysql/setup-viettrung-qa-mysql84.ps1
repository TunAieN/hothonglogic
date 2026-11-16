$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Security

$base = 'C:\ProgramData\VietTrungOrder\MySQL\QA-8.4'
$data = Join-Path $base 'data'
$logs = Join-Path $base 'logs'
$run = Join-Path $base 'run'
$secrets = Join-Path $base 'secrets'
$config = Join-Path $base 'my.ini'
$credentialFile = Join-Path $secrets 'qa-credentials.dpapi.json'
$completeFile = Join-Path $base 'setup.complete.json'
$failedFile = Join-Path $base 'setup.failed.json'
$mysqld = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysqld.exe'
$mysql = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysql.exe'
$mysqladmin = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysqladmin.exe'
$operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$port = 3311
$database = 'logistics_system_test'
$adminUser = 'viettrung_qa_admin'
$runnerUser = 'viettrung_qa_runner'
$appUser = 'viettrung_qa_app'
$rootPassword = $null
$adminPassword = $null
$runnerPassword = $null
$appPassword = $null
$serverProcess = $null
$initFile = $null

function New-RandomPassword {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        return [Convert]::ToBase64String($bytes)
    } finally {
        [Array]::Clear($bytes, 0, $bytes.Length)
        $rng.Dispose()
    }
}

function Protect-CurrentUserSecret([string] $value) {
    $plain = [Text.Encoding]::UTF8.GetBytes($value)
    $protected = $null
    try {
        $protected = [Security.Cryptography.ProtectedData]::Protect(
            $plain,
            $null,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        return [Convert]::ToBase64String($protected)
    } finally {
        [Array]::Clear($plain, 0, $plain.Length)
        if ($protected) { [Array]::Clear($protected, 0, $protected.Length) }
    }
}

function Invoke-QaMySql([string] $user, [string] $password, [string] $sql, [string] $db = '') {
    $previous = $env:MYSQL_PWD
    try {
        $env:MYSQL_PWD = $password
        $arguments = @(
            '--protocol=TCP',
            '--host=127.0.0.1',
            "--port=$port",
            "--user=$user",
            '--batch',
            '--raw',
            '--skip-column-names'
        )
        if ($db) { $arguments += $db }
        $arguments += @('--execute', $sql)
        $output = @(& $mysql @arguments 2>&1)
        if ($LASTEXITCODE -ne 0) {
            throw "QA MySQL command failed for account $user."
        }
        return $output
    } finally {
        $env:MYSQL_PWD = $previous
    }
}

function Wait-QaReady([string] $user, [string] $password, [int] $seconds = 60) {
    $deadline = (Get-Date).AddSeconds($seconds)
    do {
        try {
            $row = @(Invoke-QaMySql $user $password 'SELECT @@port,@@server_uuid,@@datadir,CURRENT_USER()')
            if ($row.Count -gt 0) { return $row }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    } while ((Get-Date) -lt $deadline)
    throw 'QA MySQL did not become ready.'
}

function Start-QaServer {
    $process = Start-Process -FilePath $mysqld `
        -ArgumentList "--defaults-file=$config" `
        -WindowStyle Hidden `
        -PassThru
    return $process
}

function Stop-QaServer([string] $user, [string] $password) {
    $previous = $env:MYSQL_PWD
    try {
        $env:MYSQL_PWD = $password
        & $mysqladmin --protocol=TCP --host=127.0.0.1 "--port=$port" "--user=$user" shutdown 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'Could not shut down QA MySQL cleanly.' }
    } finally {
        $env:MYSQL_PWD = $previous
    }
}

try {
    if (Test-Path -LiteralPath $completeFile) {
        throw 'QA MySQL setup was already completed; refusing to overwrite it.'
    }
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $port is already in use."
    }
    foreach ($path in @($mysqld, $mysql, $mysqladmin)) {
        if (-not (Test-Path -LiteralPath $path)) { throw "Required binary missing: $path" }
    }

    foreach ($directory in @($base, $data, $logs, $run, $secrets)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    & icacls.exe $base /inheritance:r /grant:r `
        'SYSTEM:(OI)(CI)(F)' `
        'BUILTIN\Administrators:(OI)(CI)(F)' `
        "$operator`:(OI)(CI)(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not protect QA directory ACL.' }

    $configText = @"
[mysqld]
basedir=C:/Program Files/VietTrungOrder/MySQL/8.4.3
datadir=C:/ProgramData/VietTrungOrder/MySQL/QA-8.4/data
port=3311
bind-address=127.0.0.1
mysqlx=OFF
server-id=8411
skip-log-bin
pid-file=C:/ProgramData/VietTrungOrder/MySQL/QA-8.4/run/mysql.pid
log-error=C:/ProgramData/VietTrungOrder/MySQL/QA-8.4/logs/mysql-error.log
log-error-verbosity=2
secure-file-priv=NULL
local-infile=OFF
skip-name-resolve
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
max-allowed-packet=64M
innodb-flush-log-at-trx-commit=2

[client]
host=127.0.0.1
port=3311
default-character-set=utf8mb4
"@
    $configText | Set-Content -LiteralPath $config -Encoding ascii

    & $mysqld "--defaults-file=$config" --initialize-insecure --console
    if ($LASTEXITCODE -ne 0) { throw 'QA datadir initialization failed.' }

    $rootPassword = New-RandomPassword
    $adminPassword = New-RandomPassword
    $runnerPassword = New-RandomPassword
    $appPassword = New-RandomPassword
    $initFile = Join-Path $secrets "bootstrap-$([Guid]::NewGuid().ToString('N')).sql"
    @"
ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY '$rootPassword' ACCOUNT LOCK;
CREATE DATABASE IF NOT EXISTS $database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$adminUser'@'127.0.0.1' IDENTIFIED WITH caching_sha2_password BY '$adminPassword';
CREATE USER IF NOT EXISTS '$runnerUser'@'127.0.0.1' IDENTIFIED WITH caching_sha2_password BY '$runnerPassword';
CREATE USER IF NOT EXISTS '$appUser'@'127.0.0.1' IDENTIFIED WITH caching_sha2_password BY '$appPassword';
GRANT ALL PRIVILEGES ON $database.* TO '$adminUser'@'127.0.0.1';
GRANT SHUTDOWN, PROCESS, RELOAD ON *.* TO '$adminUser'@'127.0.0.1';
GRANT ALL PRIVILEGES ON $database.* TO '$runnerUser'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON $database.* TO '$appUser'@'127.0.0.1';
FLUSH PRIVILEGES;
"@ | Set-Content -LiteralPath $initFile -Encoding ascii
    & icacls.exe $initFile /inheritance:r /grant:r `
        'SYSTEM:(F)' `
        'BUILTIN\Administrators:(F)' `
        "$operator`:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not protect QA init-file ACL.' }
    $configLines = [Collections.Generic.List[string]]::new()
    foreach ($line in Get-Content -LiteralPath $config) { $configLines.Add($line) }
    $clientIndex = $configLines.IndexOf('[client]')
    if ($clientIndex -lt 1) { throw 'Could not locate the client section in QA config.' }
    $configLines.Insert($clientIndex, "init-file=$($initFile.Replace('\', '/'))")
    $configLines | Set-Content -LiteralPath $config -Encoding ascii

    $serverProcess = Start-QaServer
    $identity = @(Wait-QaReady $adminUser $adminPassword)
    Stop-QaServer $adminUser $adminPassword
    $serverProcess.WaitForExit(30000) | Out-Null
    if (-not $serverProcess.HasExited) { throw 'QA MySQL did not stop after bootstrap.' }

    $cleanConfig = @(Get-Content -LiteralPath $config | Where-Object { $_ -notmatch '^init-file=' })
    $cleanConfig | Set-Content -LiteralPath $config -Encoding ascii
    Remove-Item -LiteralPath $initFile -Force
    $initFile = $null

    [ordered]@{
        version = 1
        created_at = (Get-Date).ToString('o')
        scope = 'CurrentUser'
        server = '127.0.0.1'
        port = $port
        database = $database
        admin_user = $adminUser
        admin_password_dpapi = Protect-CurrentUserSecret $adminPassword
        runner_user = $runnerUser
        runner_password_dpapi = Protect-CurrentUserSecret $runnerPassword
        app_user = $appUser
        app_password_dpapi = Protect-CurrentUserSecret $appPassword
        root_password_dpapi = Protect-CurrentUserSecret $rootPassword
    } | ConvertTo-Json | Set-Content -LiteralPath $credentialFile -Encoding utf8
    & icacls.exe $credentialFile /inheritance:r /grant:r `
        'SYSTEM:(F)' `
        'BUILTIN\Administrators:(F)' `
        "$operator`:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not protect QA credential ACL.' }

    $serverProcess = Start-QaServer
    $identity = @(Wait-QaReady $adminUser $adminPassword)
    $runnerGrants = @(Invoke-QaMySql $runnerUser $runnerPassword 'SHOW GRANTS FOR CURRENT_USER()')
    $appGrants = @(Invoke-QaMySql $appUser $appPassword 'SHOW GRANTS FOR CURRENT_USER()')
    $productionAccess = $true
    try {
        Invoke-QaMySql $runnerUser $runnerPassword 'SELECT COUNT(*) FROM logistics_system.customers' | Out-Null
    } catch {
        $productionAccess = $false
    }
    if ($productionAccess) { throw 'QA runner unexpectedly reached the production database name.' }

    $uuidRow = @(Invoke-QaMySql $adminUser $adminPassword 'SELECT @@server_uuid,@@port,@@datadir,CURRENT_USER()')
    [ordered]@{
        completed_at = (Get-Date).ToString('o')
        process_id = $serverProcess.Id
        identity = $uuidRow
        database = $database
        credential_file = $credentialFile
        config = $config
        init_reference_count = @(Get-Content -LiteralPath $config | Where-Object { $_ -match '^init-file=' }).Count
        bootstrap_file_count = @(Get-ChildItem -LiteralPath $secrets -Filter 'bootstrap-*.sql' -File -ErrorAction SilentlyContinue).Count
        runner_production_access = $productionAccess
        runner_grants = $runnerGrants
        app_grants = $appGrants
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $completeFile -Encoding utf8
    Remove-Item -LiteralPath $failedFile -Force -ErrorAction SilentlyContinue

    Write-Output "QA_READY port=$port database=$database pid=$($serverProcess.Id)"
} catch {
    New-Item -ItemType Directory -Path $base -Force | Out-Null
    [ordered]@{
        failed_at = (Get-Date).ToString('o')
        message = $_.Exception.Message
        process_id = $serverProcess?.Id
        init_file_present = [bool]($initFile -and (Test-Path -LiteralPath $initFile))
    } | ConvertTo-Json | Set-Content -LiteralPath $failedFile -Encoding utf8
    throw
} finally {
    $rootPassword = $null
    $adminPassword = $null
    $runnerPassword = $null
    $appPassword = $null
    [GC]::Collect()
}
