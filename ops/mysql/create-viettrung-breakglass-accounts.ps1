$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Security

$base = 'C:\ProgramData\VietTrungOrder\MySQL\8.4'
$serviceName = 'VietTrungMySQL84'
$serviceIdentity = "NT SERVICE\$serviceName"
$configPath = Join-Path $base 'my.ini'
$secretsRoot = Join-Path $base 'secrets'
$logsRoot = Join-Path $base 'logs'
$mysql = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysql.exe'
$operatorCredentials = Join-Path $secretsRoot 'operator-credentials.dpapi.json'
$backupRoot = 'E:\MySQL_VietTrung_Backups\automatic'
$taskName = 'VietTrungMySQL84-NightlyBackup'
$expectedUuid = '38314517-e061-11f1-9329-b44506abce66'
$expectedDatadir = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\data\'
$operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$rollbackRoot = Join-Path $base "rollback\breakglass-$stamp"
$configBackup = Join-Path $rollbackRoot 'my.ini.before-breakglass'
$complete = Join-Path $base 'breakglass-setup.complete.json'
$failed = Join-Path $base 'breakglass-setup.failed.json'
$initFile = Join-Path $secretsRoot "bootstrap-$([Guid]::NewGuid().ToString('N')).sql"
$dbaSecretFile = Join-Path $secretsRoot 'dba-breakglass.dpapi.json'
$readerSecretFile = Join-Path $secretsRoot 'binlog-reader.dpapi.json'
$dbaUser = 'viettrung_dba'
$readerUser = 'viettrung_binlog_reader'
$hostName = '127.0.0.1'
$bootstrapDba = $null
$bootstrapReader = $null
$finalDba = $null
$finalReader = $null
$configWasChanged = $false
$initCreated = $false
$serviceStartedWithInit = $false

function Assert-Administrator {
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administrator elevation is required.'
    }
}

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

function Convert-DpapiCurrentUserSecret([string] $protectedValue) {
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

function Protect-LocalMachineSecret([string] $password, [string] $user, [string] $path) {
    $plainBytes = [Text.Encoding]::UTF8.GetBytes($password)
    $protectedBytes = $null
    try {
        $protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
            $plainBytes,
            $null,
            [Security.Cryptography.DataProtectionScope]::LocalMachine
        )
        [ordered]@{
            version = 1
            created_at = (Get-Date).ToString('o')
            scope = 'LocalMachine'
            server = '127.0.0.1'
            port = 3310
            username = $user
            host = '127.0.0.1'
            plugin = 'caching_sha2_password'
            require_ssl = $true
            password_dpapi = [Convert]::ToBase64String($protectedBytes)
        } | ConvertTo-Json | Set-Content -LiteralPath $path -Encoding utf8

        & icacls.exe $path /inheritance:r /grant:r 'SYSTEM:(F)' 'BUILTIN\Administrators:(F)' "$operator`:(F)" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not protect credential ACL: $path"
        }
    } finally {
        if ($plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
        if ($protectedBytes) { [Array]::Clear($protectedBytes, 0, $protectedBytes.Length) }
    }
}

function Invoke-MySql([string] $user, [string] $password, [string] $sql) {
    try {
        $env:MYSQL_PWD = $password
        $output = & $mysql --protocol=TCP --host=127.0.0.1 --port=3310 --user=$user --skip-column-names --batch --raw --execute=$sql 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "MySQL command failed for account $user."
        }
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

function Get-ExactSchemaCounts([string] $user, [string] $password, [string] $schema) {
    if ($schema -notmatch '^logistics_system(?:_restore_verify(?:_independent)?)?$') {
        throw "Unapproved schema name: $schema"
    }
    $tables = @(Invoke-MySql $user $password "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='$schema' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
    $parts = @()
    foreach ($table in $tables) {
        $quotedTable = ([string]$table).Replace('`', '``')
        $parts += "SELECT COUNT(*) FROM ``$schema``.``$quotedTable``"
    }
    $counts = @(Invoke-MySql $user $password ($parts -join ';'))
    return [ordered]@{
        tables = $tables.Count
        rows = ($counts | ForEach-Object { [int64]$_ } | Measure-Object -Sum).Sum
    }
}

function Wait-ServiceState([string] $state, [int] $seconds = 45) {
    $service = Get-Service -Name $serviceName
    $target = [ServiceProcess.ServiceControllerStatus]::$state
    $service.WaitForStatus($target, [TimeSpan]::FromSeconds($seconds))
}

function Wait-MySqlReady([string] $user, [string] $password, [int] $seconds = 60) {
    $deadline = (Get-Date).AddSeconds($seconds)
    do {
        try {
            Invoke-MySql $user $password 'SELECT 1' | Out-Null
            return
        } catch {
            Start-Sleep -Milliseconds 750
        }
    } while ((Get-Date) -lt $deadline)
    throw 'MySQL did not become ready before the timeout.'
}

function Remove-InitFileSafely {
    if (Test-Path -LiteralPath $initFile) {
        $length = (Get-Item -LiteralPath $initFile).Length
        if ($length -gt 0) {
            $random = New-Object byte[] $length
            $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
            try {
                $rng.GetBytes($random)
                [IO.File]::WriteAllBytes($initFile, $random)
            } finally {
                [Array]::Clear($random, 0, $random.Length)
                $rng.Dispose()
            }
        }
        Remove-Item -LiteralPath $initFile -Force
    }
    & icacls.exe $secretsRoot /remove:g $serviceIdentity | Out-Null
}

Assert-Administrator

New-Item -ItemType Directory -Path $rollbackRoot -Force | Out-Null
& icacls.exe $rollbackRoot /inheritance:r /grant:r 'SYSTEM:(OI)(CI)(F)' 'BUILTIN\Administrators:(OI)(CI)(F)' "$operator`:(OI)(CI)(F)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect rollback directory.' }

try {
    if (Test-Path -LiteralPath $complete) {
        throw 'Break-glass setup was already completed; refusing to run again.'
    }
    foreach ($required in @($configPath, $mysql, $operatorCredentials)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Required file is missing: $required"
        }
    }

    $service = Get-Service -Name $serviceName
    if ($service.Status -ne 'Running') { throw 'VietTrungMySQL84 is not running.' }
    $imagePath = (Get-ItemProperty -LiteralPath "HKLM:\SYSTEM\CurrentControlSet\Services\$serviceName").ImagePath
    if ($imagePath -notlike '*C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysqld.exe*' -or $imagePath -notlike "*$configPath*") {
        throw 'Windows Service does not point to the approved binary/config.'
    }

    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    if ($task.State -eq 'Running') { throw 'Nightly backup task is currently running.' }
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
    if (Get-Process mysqldump -ErrorAction SilentlyContinue) { throw 'mysqldump is currently running.' }
    if (Get-ChildItem -LiteralPath $backupRoot -Recurse -File -Filter '*.partial' -ErrorAction SilentlyContinue) {
        throw 'A partial backup file exists; refusing service restart.'
    }

    $backup = Get-ChildItem -LiteralPath (Join-Path $backupRoot 'daily') -File -Filter 'logistics_system_*.sql' |
        Sort-Object LastWriteTime | Select-Object -Last 1
    if (-not $backup) { throw 'No automatic backup was found.' }
    $backupHash = (Get-FileHash -LiteralPath $backup.FullName -Algorithm SHA256).Hash
    $sidecarPath = [IO.Path]::ChangeExtension($backup.FullName, 'sha256')
    $sidecarHash = ((Get-Content -LiteralPath $sidecarPath -Raw).Trim() -split '\s+')[0]
    if ($backupHash -ne $sidecarHash) { throw 'Latest backup checksum does not match its sidecar.' }

    $operatorJson = Get-Content -LiteralPath $operatorCredentials -Raw | ConvertFrom-Json
    $migrationPassword = Convert-DpapiCurrentUserSecret $operatorJson.migration_password_dpapi
    $identity = @(Invoke-MySql $operatorJson.migration_user $migrationPassword 'SELECT @@port,@@datadir,@@server_uuid')
    $identityParts = [string]$identity[0] -split "`t"
    if ([int]$identityParts[0] -ne 3310 -or $identityParts[1] -ne $expectedDatadir -or $identityParts[2] -ne $expectedUuid) {
        throw 'MySQL identity check failed.'
    }
    $operationalCounts = Get-ExactSchemaCounts $operatorJson.migration_user $migrationPassword 'logistics_system'
    $restoreCounts = Get-ExactSchemaCounts $operatorJson.migration_user $migrationPassword 'logistics_system_restore_verify_independent'
    if ($operationalCounts.tables -ne 45 -or $operationalCounts.rows -ne 601) {
        throw "Operational count check failed: $($operationalCounts.tables)/$($operationalCounts.rows)."
    }
    if ($restoreCounts.tables -ne 45 -or $restoreCounts.rows -ne 601) {
        throw "Restore-drill count check failed: $($restoreCounts.tables)/$($restoreCounts.rows)."
    }
    $activeConnections = @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Where-Object LocalPort -eq 3310)
    if ($activeConnections.Count -ne 0) { throw 'An application connection to port 3310 is active.' }

    Copy-Item -LiteralPath $configPath -Destination $configBackup
    $configHashBefore = (Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash
    if ((Get-FileHash -LiteralPath $configBackup -Algorithm SHA256).Hash -ne $configHashBefore) {
        throw 'Config rollback copy checksum mismatch.'
    }

    $latestBinlog = Get-ChildItem -LiteralPath $logsRoot -File -Filter 'binlog.0*' | Sort-Object Name | Select-Object -Last 1
    $diskBinlogBefore = [ordered]@{
        file = $latestBinlog.Name
        position_approximate_from_file_size = $latestBinlog.Length
        last_write_time = $latestBinlog.LastWriteTime.ToString('o')
    }

    $bootstrapDba = New-RandomPassword
    $bootstrapReader = New-RandomPassword
    $finalDba = New-RandomPassword
    $finalReader = New-RandomPassword

    $sqlLines = @(
        "CREATE USER IF NOT EXISTS '$dbaUser'@'$hostName' IDENTIFIED WITH caching_sha2_password BY '$bootstrapDba' REQUIRE SSL ACCOUNT UNLOCK;",
        "ALTER USER '$dbaUser'@'$hostName' IDENTIFIED WITH caching_sha2_password BY '$bootstrapDba' REQUIRE SSL ACCOUNT UNLOCK;",
        "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, RELOAD, SHUTDOWN, PROCESS, FILE, REFERENCES, INDEX, ALTER, SHOW DATABASES, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, REPLICATION CLIENT, CREATE VIEW, SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, CREATE USER, EVENT, TRIGGER, CREATE TABLESPACE ON *.* TO '$dbaUser'@'$hostName' WITH GRANT OPTION;",
        "GRANT SYSTEM_USER, SYSTEM_VARIABLES_ADMIN, PERSIST_RO_VARIABLES_ADMIN, CONNECTION_ADMIN, BACKUP_ADMIN ON *.* TO '$dbaUser'@'$hostName';",
        "CREATE USER IF NOT EXISTS '$readerUser'@'$hostName' IDENTIFIED WITH caching_sha2_password BY '$bootstrapReader' REQUIRE SSL ACCOUNT UNLOCK;",
        "ALTER USER '$readerUser'@'$hostName' IDENTIFIED WITH caching_sha2_password BY '$bootstrapReader' REQUIRE SSL ACCOUNT UNLOCK;",
        "GRANT REPLICATION CLIENT ON *.* TO '$readerUser'@'$hostName';"
    )
    [IO.File]::WriteAllLines($initFile, $sqlLines, [Text.UTF8Encoding]::new($false))
    $initCreated = $true

    & icacls.exe $secretsRoot /grant "$serviceIdentity`:(RX)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not grant temporary secrets-directory traversal.' }
    & icacls.exe $initFile /inheritance:r /grant:r 'SYSTEM:(F)' 'BUILTIN\Administrators:(F)' "$operator`:(F)" "$serviceIdentity`:(R)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not protect init-file ACL.' }

    $configText = [IO.File]::ReadAllText($configPath)
    if ($configText -match '(?im)^\s*init-file\s*=') { throw 'my.ini already contains an init-file reference.' }
    $escapedInitPath = $initFile.Replace('\', '/')
    $updatedConfig = [regex]::Replace($configText, '(?im)^\[client\]\s*$', "init-file=$escapedInitPath`r`n`r`n[client]", 1)
    if ($updatedConfig -eq $configText -or ([regex]::Matches($updatedConfig, '(?im)^\s*init-file\s*=').Count -ne 1)) {
        throw 'Could not add exactly one init-file reference.'
    }
    [IO.File]::WriteAllText($configPath, $updatedConfig, [Text.UTF8Encoding]::new($false))
    $configWasChanged = $true

    $restartOneStopped = Get-Date
    Stop-Service -Name $serviceName
    Wait-ServiceState 'Stopped'
    Start-Service -Name $serviceName
    Wait-ServiceState 'Running'
    $serviceStartedWithInit = $true
    Wait-MySqlReady $dbaUser $bootstrapDba
    $restartOneReady = Get-Date

    $bootstrapIdentity = Invoke-MySql $dbaUser $bootstrapDba "SELECT CURRENT_USER(),@@port,@@datadir,@@server_uuid; SELECT User,Host,plugin,account_locked,ssl_type FROM mysql.user WHERE User IN ('$dbaUser','$readerUser') ORDER BY User"
    if (-not ($bootstrapIdentity -match "$dbaUser@$hostName") -or -not ($bootstrapIdentity -match "$readerUser")) {
        throw 'Bootstrap accounts were not verified.'
    }

    Copy-Item -LiteralPath $configBackup -Destination $configPath -Force
    if ((Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash -ne $configHashBefore) {
        throw 'Clean config checksum does not match the rollback copy.'
    }
    $configWasChanged = $false
    Remove-InitFileSafely
    $initCreated = $false

    $rotateSql = "ALTER USER '$dbaUser'@'$hostName' IDENTIFIED WITH caching_sha2_password BY '$finalDba' REQUIRE SSL ACCOUNT UNLOCK; ALTER USER '$readerUser'@'$hostName' IDENTIFIED WITH caching_sha2_password BY '$finalReader' REQUIRE SSL ACCOUNT UNLOCK;"
    Invoke-MySql $dbaUser $bootstrapDba $rotateSql | Out-Null

    Protect-LocalMachineSecret $finalDba $dbaUser $dbaSecretFile
    Protect-LocalMachineSecret $finalReader $readerUser $readerSecretFile

    $restartTwoStopped = Get-Date
    Stop-Service -Name $serviceName
    Wait-ServiceState 'Stopped'
    Start-Service -Name $serviceName
    Wait-ServiceState 'Running'
    Wait-MySqlReady $dbaUser $finalDba
    $restartTwoReady = Get-Date

    $accountRows = Invoke-MySql $dbaUser $finalDba "SELECT User,Host,plugin,account_locked,ssl_type FROM mysql.user WHERE User IN ('$dbaUser','$readerUser') ORDER BY User"
    $dbaGrants = Invoke-MySql $dbaUser $finalDba "SHOW GRANTS FOR '$dbaUser'@'$hostName'"
    $readerGrants = Invoke-MySql $dbaUser $finalDba "SHOW GRANTS FOR '$readerUser'@'$hostName'"
    $adminAccounts = Invoke-MySql $dbaUser $finalDba "SELECT User,Host,Super_priv,Grant_priv,Create_user_priv FROM mysql.user WHERE Super_priv='Y' OR Grant_priv='Y' OR Create_user_priv='Y' ORDER BY User,Host"
    $dbaTlsLines = @(Invoke-MySql $dbaUser $finalDba "SHOW SESSION STATUS LIKE 'Ssl_cipher'")
    $readerTlsLines = @(Invoke-MySql $readerUser $finalReader "SHOW SESSION STATUS LIKE 'Ssl_cipher'")
    $dbaTls = [string]$dbaTlsLines[0] -split "`t"
    $readerTls = [string]$readerTlsLines[0] -split "`t"
    if ([string]::IsNullOrWhiteSpace($dbaTls[1]) -or [string]::IsNullOrWhiteSpace($readerTls[1])) {
        throw 'TLS cipher validation failed.'
    }

    $binlogStatusLines = @(Invoke-MySql $readerUser $finalReader 'SHOW BINARY LOG STATUS')
    $binlogStatusLine = $binlogStatusLines[0]
    $binlogParts = [string]$binlogStatusLine -split "`t", 5
    if ($binlogParts.Count -lt 2 -or [string]::IsNullOrWhiteSpace($binlogParts[0])) {
        throw 'SHOW BINARY LOG STATUS did not return a file and position.'
    }
    $readerIdentityLines = @(Invoke-MySql $readerUser $finalReader 'SELECT CURRENT_USER(),@@server_uuid,NOW(6)')
    $readerIdentity = [string]$readerIdentityLines[0] -split "`t"
    if ($readerIdentity[1] -ne $expectedUuid) { throw 'Binlog reader connected to the wrong server UUID.' }
    if (-not (Test-MySqlDenied $readerUser $finalReader 'SELECT COUNT(*) FROM logistics_system.customers')) {
        throw 'Binlog reader unexpectedly has business-data SELECT access.'
    }

    $appPassword = Convert-DpapiCurrentUserSecret $operatorJson.app_password_dpapi
    $testPassword = Convert-DpapiCurrentUserSecret $operatorJson.test_password_dpapi
    $appGrants = Invoke-MySql $operatorJson.app_user $appPassword 'SHOW GRANTS'
    $testGrants = Invoke-MySql $operatorJson.test_user $testPassword 'SHOW GRANTS'
    if (-not (Test-MySqlDenied $operatorJson.test_user $testPassword 'SELECT COUNT(*) FROM logistics_system.customers')) {
        throw 'Test runner unexpectedly has access to logistics_system.'
    }
    $unexpectedGlobalAppGrant = @($appGrants | Where-Object {
        $_ -match '(?i) ON \*\.\*' -and $_ -notmatch '(?i)^GRANT USAGE ON \*\.\*'
    }).Count -gt 0
    if (($appGrants -join "`n") -match '(?i)\b(DROP|ALTER)\b|WITH GRANT OPTION' -or $unexpectedGlobalAppGrant) {
        throw 'Application account grants exceed the approved scope.'
    }

    $remainingInitReference = [regex]::Matches([IO.File]::ReadAllText($configPath), '(?im)^\s*init-file\s*=').Count
    if ($remainingInitReference -ne 0 -or (Test-Path -LiteralPath $initFile)) {
        throw 'Init-file or its startup reference still exists.'
    }
    $secretAcl = Get-Acl -LiteralPath $secretsRoot
    if ($secretAcl.Access.IdentityReference.Value -contains $serviceIdentity) {
        throw 'MySQL service still has access to the secrets directory.'
    }

    $result = [ordered]@{
        completed_at = (Get-Date).ToString('o')
        service = $serviceName
        service_status = (Get-Service $serviceName).Status.ToString()
        server_uuid = $expectedUuid
        datadir = $expectedDatadir
        backup = [ordered]@{
            file = $backup.FullName
            bytes = $backup.Length
            sha256 = $backupHash
        }
        precheck_counts = [ordered]@{
            operational = $operationalCounts
            restore_drill = $restoreCounts
        }
        scheduled_backup = [ordered]@{
            task = $taskName
            state_before = $task.State.ToString()
            last_run = $taskInfo.LastRunTime.ToString('o')
            last_result = $taskInfo.LastTaskResult
            next_run = $taskInfo.NextRunTime.ToString('o')
        }
        config = [ordered]@{
            rollback_copy = $configBackup
            sha256_before = $configHashBefore
            sha256_after = (Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash
            init_reference_removed = $true
            init_file_removed = $true
        }
        restarts = @(
            [ordered]@{ phase = 'init-file'; stopped_at = $restartOneStopped.ToString('o'); ready_at = $restartOneReady.ToString('o') },
            [ordered]@{ phase = 'clean-config'; stopped_at = $restartTwoStopped.ToString('o'); ready_at = $restartTwoReady.ToString('o') }
        )
        accounts = [ordered]@{
            rows = @($accountRows)
            dba_grants = @($dbaGrants)
            binlog_reader_grants = @($readerGrants)
            administrative_accounts = @($adminAccounts)
            app_grants = @($appGrants)
            test_grants = @($testGrants)
            test_runner_operational_access_denied = $true
            binlog_reader_business_select_denied = $true
        }
        tls = [ordered]@{ dba = $dbaTls[1]; binlog_reader = $readerTls[1] }
        binlog_before = $diskBinlogBefore
        binlog_status = [ordered]@{
            file = $binlogParts[0]
            position = [uint64]$binlogParts[1]
            executed_gtid_set = if ($binlogParts.Count -ge 5) { $binlogParts[4] } else { '' }
            checked_at = $readerIdentity[2]
        }
        credential_files = @($dbaSecretFile, $readerSecretFile)
        audit_actions = @('created break-glass DBA', 'created binlog reader', 'rotated bootstrap credentials', 'validated grants/TLS/binlog status', 'removed init-file and reference')
    }
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $complete -Encoding utf8
    & icacls.exe $complete /inheritance:r /grant:r 'SYSTEM:(F)' 'BUILTIN\Administrators:(F)' "$operator`:(R)" | Out-Null
    Remove-Item -LiteralPath $failed -Force -ErrorAction SilentlyContinue
} catch {
    $errorMessage = $_.Exception.Message
    try {
        if (Test-Path -LiteralPath $configBackup) {
            Copy-Item -LiteralPath $configBackup -Destination $configPath -Force
            $configWasChanged = $false
        }
        Remove-InitFileSafely
        $initCreated = $false
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if ($service -and $service.Status -ne 'Running') {
            Start-Service -Name $serviceName
            Wait-ServiceState 'Running'
        }
    } catch {
        $errorMessage += ' Rollback warning: '+$_.Exception.Message
    }
    [ordered]@{
        failed_at = (Get-Date).ToString('o')
        message = $errorMessage
        config_rollback_attempted = (Test-Path -LiteralPath $configBackup)
        service_status = (Get-Service -Name $serviceName -ErrorAction SilentlyContinue).Status.ToString()
    } | ConvertTo-Json | Set-Content -LiteralPath $failed -Encoding utf8
    throw
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    $bootstrapDba = $null
    $bootstrapReader = $null
    $finalDba = $null
    $finalReader = $null
    $migrationPassword = $null
    $appPassword = $null
    $testPassword = $null
}
