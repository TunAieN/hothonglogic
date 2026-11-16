$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Security

$base = 'C:\ProgramData\VietTrungOrder\MySQL\8.4'
$serviceName = 'VietTrungMySQL84'
$serviceIdentity = "NT SERVICE\$serviceName"
$configPath = Join-Path $base 'my.ini'
$secretsRoot = Join-Path $base 'secrets'
$mysql = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysql.exe'
$dbaSecretFile = Join-Path $secretsRoot 'dba-breakglass.dpapi.json'
$readerSecretFile = Join-Path $secretsRoot 'binlog-reader.dpapi.json'
$operatorCredentials = Join-Path $secretsRoot 'operator-credentials.dpapi.json'
$complete = Join-Path $base 'breakglass-setup.complete.json'
$failed = Join-Path $base 'breakglass-setup.failed.json'
$taskName = 'VietTrungMySQL84-NightlyBackup'
$operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$expectedUuid = '38314517-e061-11f1-9329-b44506abce66'

function Assert-Administrator {
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administrator elevation is required.'
    }
}

function Read-LocalMachineCredential([string] $path) {
    $metadata = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $protected = [Convert]::FromBase64String($metadata.password_dpapi)
    $plain = [Security.Cryptography.ProtectedData]::Unprotect(
        $protected,
        $null,
        [Security.Cryptography.DataProtectionScope]::LocalMachine
    )
    try {
        return [pscustomobject]@{
            Metadata = $metadata
            Password = [Text.Encoding]::UTF8.GetString($plain)
        }
    } finally {
        [Array]::Clear($plain, 0, $plain.Length)
    }
}

function Read-CurrentUserSecret([string] $protectedValue) {
    $secure = ConvertTo-SecureString $protectedValue
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        if ($pointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }
}

function Invoke-MySql([string] $user, [string] $password, [string] $sql) {
    try {
        $env:MYSQL_PWD = $password
        $output = & $mysql --protocol=TCP --host=127.0.0.1 --port=3310 --user=$user --skip-column-names --batch --raw --execute=$sql 2>&1
        if ($LASTEXITCODE -ne 0) { throw "MySQL validation failed for account $user." }
        return @($output)
    } finally {
        Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    }
}

function Test-MySqlDenied([string] $user, [string] $password, [string] $sql) {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $env:MYSQL_PWD = $password
        & $mysql --protocol=TCP --host=127.0.0.1 --port=3310 --user=$user --skip-column-names --batch --raw --execute=$sql 2>$null | Out-Null
        return $LASTEXITCODE -ne 0
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
        Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    }
}

Assert-Administrator

if (Test-Path -LiteralPath $complete) { throw 'Completion marker already exists.' }
if ((Get-Service -Name $serviceName).Status -ne 'Running') { throw 'VietTrungMySQL84 is not running.' }
if (Select-String -LiteralPath $configPath -Pattern '^\s*init-file\s*=' -Quiet) { throw 'my.ini still references init-file.' }
if (Get-ChildItem -LiteralPath $secretsRoot -File -Filter 'bootstrap-*.sql' -ErrorAction SilentlyContinue) {
    throw 'A bootstrap SQL file still exists.'
}

$rollbackConfig = Get-ChildItem -LiteralPath (Join-Path $base 'rollback') -Recurse -File -Filter 'my.ini.before-breakglass' |
    Sort-Object LastWriteTime | Select-Object -Last 1
if (-not $rollbackConfig) { throw 'The config rollback copy was not found.' }
$configHash = (Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash
if ((Get-FileHash -LiteralPath $rollbackConfig.FullName -Algorithm SHA256).Hash -ne $configHash) {
    throw 'Current my.ini does not match its rollback copy.'
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($task.State -eq 'Running') { throw 'Nightly backup task is running.' }
$taskInfo = Get-ScheduledTaskInfo -TaskName $taskName

$dba = Read-LocalMachineCredential $dbaSecretFile
$reader = Read-LocalMachineCredential $readerSecretFile
$dbaPassword = $dba.Password
$readerPassword = $reader.Password
try {
    $identityLines = @(Invoke-MySql $dba.Metadata.username $dbaPassword 'SELECT CURRENT_USER(),@@port,@@datadir,@@server_uuid')
    $identity = [string]$identityLines[0] -split "`t"
    if ($identity[0] -ne 'viettrung_dba@127.0.0.1' -or [int]$identity[1] -ne 3310 -or $identity[3] -ne $expectedUuid) {
        throw 'DBA connected to an unexpected server identity.'
    }

    $accountRows = @(Invoke-MySql $dba.Metadata.username $dbaPassword "SELECT User,Host,plugin,account_locked,ssl_type FROM mysql.user WHERE User IN ('viettrung_dba','viettrung_binlog_reader') ORDER BY User")
    if (@($accountRows | Where-Object { $_ -notmatch "`tcaching_sha2_password`tN`tANY$" }).Count -ne 0) {
        throw 'Account plugin/lock/SSL validation failed.'
    }

    $dbaGrants = @(Invoke-MySql $dba.Metadata.username $dbaPassword "SHOW GRANTS FOR 'viettrung_dba'@'127.0.0.1'")
    $readerGrants = @(Invoke-MySql $reader.Metadata.username $readerPassword 'SHOW GRANTS')
    $dbaGrantText = $dbaGrants -join "`n"
    foreach ($required in @('CREATE USER', 'REPLICATION CLIENT', 'WITH GRANT OPTION', 'BACKUP_ADMIN', 'CONNECTION_ADMIN', 'PERSIST_RO_VARIABLES_ADMIN', 'SYSTEM_USER', 'SYSTEM_VARIABLES_ADMIN')) {
        if ($dbaGrantText -notmatch [regex]::Escape($required)) { throw "DBA grant is missing: $required" }
    }
    foreach ($forbidden in @('AUDIT_ADMIN', 'BINLOG_ADMIN', 'CLONE_ADMIN', 'FIREWALL_EXEMPT', 'GROUP_REPLICATION_ADMIN', 'REPLICATION_SLAVE_ADMIN', 'SUPER')) {
        if ($dbaGrantText -match [regex]::Escape($forbidden)) { throw "DBA retains an unapproved privilege: $forbidden" }
    }
    if (($readerGrants -join "`n") -notmatch '^GRANT REPLICATION CLIENT ON \*\.\* TO') {
        throw 'Binlog reader grants are not minimal.'
    }

    $dbaTlsLines = @(Invoke-MySql $dba.Metadata.username $dbaPassword "SHOW SESSION STATUS LIKE 'Ssl_cipher'")
    $readerTlsLines = @(Invoke-MySql $reader.Metadata.username $readerPassword "SHOW SESSION STATUS LIKE 'Ssl_cipher'")
    $dbaTls = [string]$dbaTlsLines[0] -split "`t"
    $readerTls = [string]$readerTlsLines[0] -split "`t"
    if ([string]::IsNullOrWhiteSpace($dbaTls[1]) -or [string]::IsNullOrWhiteSpace($readerTls[1])) {
        throw 'TLS validation failed.'
    }

    $binlogLines = @(Invoke-MySql $reader.Metadata.username $readerPassword 'SHOW BINARY LOG STATUS')
    $binlog = [string]$binlogLines[0] -split "`t", 5
    if ($binlog.Count -lt 2) { throw 'Binlog status is incomplete.' }
    if (-not (Test-MySqlDenied $reader.Metadata.username $readerPassword 'SELECT COUNT(*) FROM logistics_system.customers')) {
        throw 'Binlog reader can read business data.'
    }

    $operatorJson = Get-Content -LiteralPath $operatorCredentials -Raw | ConvertFrom-Json
    $appPassword = Read-CurrentUserSecret $operatorJson.app_password_dpapi
    $testPassword = Read-CurrentUserSecret $operatorJson.test_password_dpapi
    $appGrants = @(Invoke-MySql $operatorJson.app_user $appPassword 'SHOW GRANTS')
    $testGrants = @(Invoke-MySql $operatorJson.test_user $testPassword 'SHOW GRANTS')
    $appGrantText = $appGrants -join "`n"
    if ($appGrantText -match '(?i)\b(DROP|ALTER)\b|WITH GRANT OPTION') { throw 'Application grants are too broad.' }
    if (-not (Test-MySqlDenied $operatorJson.test_user $testPassword 'SELECT COUNT(*) FROM logistics_system.customers')) {
        throw 'Test runner can access logistics_system.'
    }

    foreach ($path in @($secretsRoot, $dbaSecretFile, $readerSecretFile)) {
        $acl = Get-Acl -LiteralPath $path
        if ($acl.Access.IdentityReference.Value -contains $serviceIdentity) {
            throw "MySQL service retains secret access: $path"
        }
    }

    $errorLog = Join-Path $base 'logs\mysql-error.log'
    $readyLines = @(Select-String -LiteralPath $errorLog -Pattern 'ready for connections' | Select-Object -Last 2)
    if ($readyLines.Count -ne 2) { throw 'Could not verify two successful ready-for-connections events.' }

    $result = [ordered]@{
        completed_at = (Get-Date).ToString('o')
        service = $serviceName
        service_status = (Get-Service $serviceName).Status.ToString()
        server_uuid = $expectedUuid
        datadir = $identity[2]
        config = [ordered]@{
            sha256 = $configHash
            rollback_copy = $rollbackConfig.FullName
            init_reference_count = 0
            bootstrap_file_count = 0
        }
        scheduled_backup = [ordered]@{
            task = $taskName
            state = $task.State.ToString()
            last_run = $taskInfo.LastRunTime.ToString('o')
            last_result = $taskInfo.LastTaskResult
            next_run = $taskInfo.NextRunTime.ToString('o')
        }
        accounts = [ordered]@{
            rows = $accountRows
            dba_grants = $dbaGrants
            binlog_reader_grants = $readerGrants
            app_grants = $appGrants
            test_grants = $testGrants
            binlog_reader_business_select_denied = $true
            test_runner_operational_access_denied = $true
        }
        tls = [ordered]@{ dba = $dbaTls[1]; binlog_reader = $readerTls[1] }
        binlog_status = [ordered]@{
            file = $binlog[0]
            position = [uint64]$binlog[1]
            executed_gtid_set = if ($binlog.Count -ge 5) { $binlog[4] } else { '' }
        }
        ready_events = @($readyLines | ForEach-Object { $_.Line })
        credential_files = @($dbaSecretFile, $readerSecretFile)
        dpapi_scope = 'LocalMachine'
        secret_service_access = $false
    }
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $complete -Encoding utf8
    & icacls.exe $complete /inheritance:r /grant:r 'SYSTEM:(F)' 'BUILTIN\Administrators:(F)' "$operator`:(R)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not protect completion marker.' }

    if (Test-Path -LiteralPath $failed) {
        $archive = Join-Path $rollbackConfig.DirectoryName 'transient-validation-failure.json'
        Move-Item -LiteralPath $failed -Destination $archive -Force
    }
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    $dbaPassword = $null
    $readerPassword = $null
    $appPassword = $null
    $testPassword = $null
}
