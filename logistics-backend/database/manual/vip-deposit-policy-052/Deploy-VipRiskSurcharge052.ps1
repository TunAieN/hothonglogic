[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$MigrationRelativePath = 'database/migrations/2026_11_26_000052_add_risk_surcharge_policy.php'
$MigrationPath = Join-Path $ProjectRoot $MigrationRelativePath
$LaravelProbePath = Join-Path $PSScriptRoot 'LaravelConnectionProbe.php'
$CredentialPath = 'C:\VietTrungSecrets\viettrung-dba.xml'
$BackupRoot = 'C:\VietTrungBackups'
$CaPath = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\data\ca.pem'
$MySqlBin = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin'
$MySqlExe = Join-Path $MySqlBin 'mysql.exe'
$MySqlDumpExe = Join-Path $MySqlBin 'mysqldump.exe'
$PhpExe = (Get-Command php -ErrorAction Stop).Source
$ServiceName = 'VietTrungMySQL84'
$ExpectedUser = 'viettrung_dba'
$ExpectedDatabase = 'logistics_system'
$ExpectedPort = 3310
$MigrationName = '2026_11_26_000052_add_risk_surcharge_policy'
$PreviousMigrationName = '2026_11_25_000051_create_vip_and_order_deposit_policy_domain'
$EnvironmentKeys = @(
    'APP_ENV', 'APP_DEBUG', 'APP_CONFIG_CACHE',
    'DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD',
    'MYSQL_ATTR_SSL_CA', 'MYSQL_ATTR_SSL_VERIFY_SERVER_CERT', 'MYSQL_PWD'
)
$OriginalEnvironment = @{}
$SecretPointer = [IntPtr]::Zero
$PlainPassword = $null
$BackupPath = $null

function Write-Step([string] $Message) {
    Write-Host "`n==> $Message"
}

function Set-ProcessEnvironment([string] $Name, [AllowNull()][string] $Value) {
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Restore-ProcessEnvironment {
    foreach ($key in $EnvironmentKeys) {
        Set-ProcessEnvironment $key $OriginalEnvironment[$key]
    }
}

function Redact([string] $Value) {
    if ($null -eq $Value) { return '' }
    if (-not [string]::IsNullOrEmpty($PlainPassword)) {
        return $Value.Replace($PlainPassword, '[REDACTED]')
    }
    return $Value
}

function Invoke-Native([string] $FilePath, [string[]] $Arguments, [switch] $EchoOutput) {
    $output = (& $FilePath @Arguments 2>&1 | Out-String)
    $exitCode = $LASTEXITCODE
    $safeOutput = Redact $output
    if ($exitCode -ne 0) {
        throw "Command failed with exit code $exitCode.`n$safeOutput"
    }
    if ($EchoOutput -and -not [string]::IsNullOrWhiteSpace($safeOutput)) {
        Write-Host $safeOutput.TrimEnd()
    }
    return $safeOutput
}

function Invoke-MySql([string] $Sql) {
    $args = @(
        '--host=127.0.0.1', "--port=$ExpectedPort", "--user=$ExpectedUser",
        '--protocol=TCP', '--ssl-mode=VERIFY_CA', "--ssl-ca=$CaPath",
        '--default-character-set=utf8mb4', '--batch', '--raw', '--skip-column-names',
        "--database=$ExpectedDatabase", "--execute=$Sql"
    )
    return (Invoke-Native $MySqlExe $args).Trim()
}

function Get-Baseline {
    $sql = @"
SELECT CONCAT_WS('|',
 (SELECT COUNT(*) FROM customers),
 (SELECT COUNT(*) FROM orders),
 (SELECT COUNT(*) FROM payment_vouchers),
 (SELECT COUNT(*) FROM payment_transactions),
 (SELECT COUNT(*) FROM customer_balance_ledgers),
 (SELECT COUNT(*) FROM sepay_webhook_events),
 (SELECT COUNT(*) FROM order_deposit_policy_snapshots),
 (SELECT COUNT(*) FROM audit_logs),
 (SELECT COUNT(*) FROM migrations),
 (SELECT COUNT(*) FROM vip_tiers WHERE deposit_policy_enabled = 1)
);
"@
    $parts = (Invoke-MySql $sql).Split('|')
    if ($parts.Count -ne 10) { throw 'Could not parse the production baseline.' }
    return [ordered]@{
        customers = [int64] $parts[0]
        orders = [int64] $parts[1]
        payment_vouchers = [int64] $parts[2]
        payment_transactions = [int64] $parts[3]
        customer_balance_ledgers = [int64] $parts[4]
        sepay_webhook_events = [int64] $parts[5]
        order_deposit_policy_snapshots = [int64] $parts[6]
        audit_logs = [int64] $parts[7]
        migrations = [int64] $parts[8]
        enabled_vip_tiers = [int64] $parts[9]
    }
}

try {
    foreach ($key in $EnvironmentKeys) {
        $OriginalEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    }

    Write-Step 'Validating exact files, service, and target listener'
    foreach ($path in @($MigrationPath, $LaravelProbePath, $CredentialPath, $CaPath, $MySqlExe, $MySqlDumpExe)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required file is missing: $path" }
    }
    $service = Get-Service -Name $ServiceName -ErrorAction Stop
    if ($service.Status -ne 'Running') { throw "$ServiceName is not running." }
    $listener = Get-NetTCPConnection -LocalPort $ExpectedPort -State Listen -ErrorAction Stop
    if (-not $listener) { throw "No listener is active on port $ExpectedPort." }
    $laragonListener = Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
    Write-Host "Service=$ServiceName status=Running targetPort=$ExpectedPort laragon3306Present=$([bool] $laragonListener)"

    Write-Step 'Decrypting the DPAPI credential in memory'
    $credential = Import-Clixml -LiteralPath $CredentialPath
    if ($credential -isnot [System.Management.Automation.PSCredential]) { throw 'The DPAPI file is not a PSCredential.' }
    if ($credential.UserName -notin @($ExpectedUser, "$ExpectedUser@127.0.0.1")) { throw 'The DPAPI credential has an unexpected username.' }
    $SecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
    $PlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($SecretPointer)
    if ([string]::IsNullOrWhiteSpace($PlainPassword)) { throw 'The DPAPI credential decrypted to an empty password.' }

    Set-ProcessEnvironment 'MYSQL_PWD' $PlainPassword
    Set-ProcessEnvironment 'APP_ENV' 'production'
    Set-ProcessEnvironment 'APP_DEBUG' 'false'
    Set-ProcessEnvironment 'APP_CONFIG_CACHE' (Join-Path ([IO.Path]::GetTempPath()) ('viettrung-config-052-' + [guid]::NewGuid().ToString('N') + '.php'))
    Set-ProcessEnvironment 'DB_CONNECTION' 'mysql'
    Set-ProcessEnvironment 'DB_HOST' '127.0.0.1'
    Set-ProcessEnvironment 'DB_PORT' "$ExpectedPort"
    Set-ProcessEnvironment 'DB_DATABASE' $ExpectedDatabase
    Set-ProcessEnvironment 'DB_USERNAME' $ExpectedUser
    Set-ProcessEnvironment 'DB_PASSWORD' $PlainPassword
    Set-ProcessEnvironment 'MYSQL_ATTR_SSL_CA' $CaPath
    # The production certificate is CA-signed but auto-generated with a CN that
    # is not 127.0.0.1. mysql.exe verifies the CA with VERIFY_CA above; PDO uses
    # the same CA and encrypted transport while hostname verification stays off.
    Set-ProcessEnvironment 'MYSQL_ATTR_SSL_VERIFY_SERVER_CERT' 'false'

    Write-Step 'Verifying DBA identity, database, port, version, TLS, and grants'
    $identity = Invoke-MySql "SELECT CONCAT_WS('|', CURRENT_USER(), DATABASE(), @@port, @@version); SHOW SESSION STATUS LIKE 'Ssl_cipher';"
    $identityLines = $identity -split "`r?`n"
    $identityParts = $identityLines[0].Split('|')
    if ($identityParts[0] -ne 'viettrung_dba@127.0.0.1' -or $identityParts[1] -ne $ExpectedDatabase -or [int] $identityParts[2] -ne $ExpectedPort) {
        throw 'DBA identity/database/port verification failed.'
    }
    $cipher = ($identityLines | Where-Object { $_ -like "Ssl_cipher`t*" } | Select-Object -First 1).Split("`t")[-1]
    if ([string]::IsNullOrWhiteSpace($cipher)) { throw 'The DBA connection did not negotiate TLS.' }
    $grants = Invoke-MySql 'SHOW GRANTS FOR CURRENT_USER;'
    foreach ($requiredGrant in @('SELECT', 'INSERT', 'CREATE', 'REFERENCES', 'INDEX', 'ALTER')) {
        if ($grants -notmatch "\b$requiredGrant\b") { throw "DBA is missing required privilege: $requiredGrant" }
    }
    Write-Host "identity=$($identityParts[0]) database=$($identityParts[1]) port=$($identityParts[2]) mysql=$($identityParts[3]) tlsCipher=$cipher"

    Write-Step 'Verifying Laravel PDO through the temporary DBA connection'
    Set-Location $ProjectRoot
    $dbaProbe = Invoke-Native $PhpExe @($LaravelProbePath)
    if ($dbaProbe -notmatch 'viettrung_dba@127\.0\.0\.1' -or $dbaProbe -notmatch '"port":3310' -or $dbaProbe -notmatch '"tls":"[^\"]+"') {
        throw "Laravel DBA PDO probe failed: $dbaProbe"
    }
    Write-Host "laravelDbaProbe=$($dbaProbe.Trim())"

    Write-Step 'Checking migrations, schema, policy values, and production baseline'
    $migrationState = Invoke-MySql "SELECT migration, batch FROM migrations WHERE migration IN ('$PreviousMigrationName', '$MigrationName') ORDER BY migration;"
    if ($migrationState -notmatch [regex]::Escape($PreviousMigrationName)) { throw 'Migration 051 is not recorded as Ran.' }
    if ($migrationState -match [regex]::Escape($MigrationName)) { throw 'Migration 052 is already recorded; refusing to continue.' }
    $newColumnCount = [int] (Invoke-MySql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='$ExpectedDatabase' AND ((table_name='risk_deposit_policies' AND column_name='surcharge_percent') OR (table_name='order_deposit_policy_snapshots' AND column_name IN ('risk_surcharge_percent','additive_percent','policy_formula','policy_version','automatic_risk_code','automatic_risk_reason','risk_selection_source','risk_evidence')));")
    if ($newColumnCount -ne 0) { throw 'Migration 052 schema is partially present while the migration is Pending.' }
    $vipBefore = Invoke-MySql "SELECT CONCAT_WS('|', code, base_deposit_percent, deposit_policy_enabled) FROM vip_tiers ORDER BY priority;"
    $expectedVipBefore = @('bronze|60.00|0', 'silver|50.00|0', 'gold|40.00|0', 'platinum|30.00|0') -join "`n"
    if (($vipBefore -replace "`r", '') -ne $expectedVipBefore) { throw 'VIP values/activation flags do not match the approved preflight state.' }
    $riskBefore = Invoke-MySql "SELECT CONCAT_WS('|', code, COALESCE(minimum_deposit_percent,'NULL'), requires_manager_approval) FROM risk_deposit_policies ORDER BY priority;"
    if ($riskBefore -notmatch 'special\|NULL\|1') { throw 'Special risk approval state is unexpected.' }
    $baselineBefore = Get-Baseline
    if ($baselineBefore.enabled_vip_tiers -ne 0) { throw 'At least one VIP deposit policy is unexpectedly enabled.' }
    Write-Host ('baselineBefore=' + ($baselineBefore | ConvertTo-Json -Compress))

    Write-Step 'Capturing the MySQL error-log position'
    $serverPaths = (Invoke-MySql "SELECT CONCAT_WS('|', @@datadir, @@global.log_error);").Split('|')
    $dataDirectory = $serverPaths[0]
    $errorLogPath = $serverPaths[1]
    if (-not [IO.Path]::IsPathRooted($errorLogPath)) { $errorLogPath = Join-Path $dataDirectory $errorLogPath }
    $errorLogLengthBefore = $null
    if (Test-Path -LiteralPath $errorLogPath -PathType Leaf) {
        $errorLogLengthBefore = (Get-Item -LiteralPath $errorLogPath).Length
        Write-Host "errorLogReadable=true lengthBefore=$errorLogLengthBefore"
    } else {
        Write-Warning 'MySQL error log is not readable by the deployment account; server connectivity will still be checked after migration.'
    }

    Write-Step 'Creating a fresh production backup'
    if (-not (Test-Path -LiteralPath $BackupRoot -PathType Container)) {
        New-Item -ItemType Directory -Path $BackupRoot | Out-Null
    }
    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $BackupPath = Join-Path $BackupRoot "logistics_system_before_vip052_$timestamp.sql"
    if (Test-Path -LiteralPath $BackupPath) { throw 'Refusing to overwrite an existing backup.' }
    $dumpArgs = @(
        '--host=127.0.0.1', "--port=$ExpectedPort", "--user=$ExpectedUser", '--protocol=TCP',
        '--ssl-mode=VERIFY_CA', "--ssl-ca=$CaPath", '--single-transaction', '--quick',
        '--routines', '--triggers', '--hex-blob', '--no-tablespaces', '--set-gtid-purged=OFF',
        '--default-character-set=utf8mb4', "--result-file=$BackupPath", $ExpectedDatabase
    )
    [void] (Invoke-Native $MySqlDumpExe $dumpArgs)
    $backupFile = Get-Item -LiteralPath $BackupPath
    if ($backupFile.Length -lt 100000) { throw 'The backup is unexpectedly small.' }
    $backupHash = (Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash
    $createCount = (Select-String -LiteralPath $BackupPath -Pattern '^CREATE TABLE ' -AllMatches).Count
    $insertCount = (Select-String -LiteralPath $BackupPath -Pattern '^INSERT INTO ' -AllMatches).Count
    if ($createCount -lt 50 -or $insertCount -lt 1) { throw 'The backup SQL content checks failed.' }
    Write-Host "backup=$BackupPath size=$($backupFile.Length) sha256=$backupHash createTables=$createCount insertStatements=$insertCount"
    $isolatedListener = Get-NetTCPConnection -LocalPort 3311 -State Listen -ErrorAction SilentlyContinue
    Write-Host "isolatedRestoreTest=SKIPPED isolatedPort3311Present=$([bool] $isolatedListener) reason=No approved isolated restore credential/database was supplied"

    Write-Step 'Validating migration hash and scoped pretend SQL'
    $migrationHash = (Get-FileHash -LiteralPath $MigrationPath -Algorithm SHA256).Hash
    $pretend = Invoke-Native $PhpExe @('artisan', 'migrate', '--pretend', "--path=$MigrationRelativePath", '--force', '--no-interaction', '--no-ansi')
    if ($pretend -match '(?i)\b(drop\s+table|drop\s+column|truncate|delete\s+from)\b') { throw 'Destructive SQL was detected in scoped pretend output.' }
    foreach ($requiredSql in @('surcharge_percent', 'risk_surcharge_percent', 'risk_deposit_surcharge_unique')) {
        if ($pretend -notmatch [regex]::Escape($requiredSql)) { throw "Pretend output is missing: $requiredSql" }
    }
    Write-Host "migrationSha256=$migrationHash pretend=PASS"

    Write-Step 'Applying only migration 052 through Laravel CLI'
    $applyOutput = Invoke-Native $PhpExe @('artisan', 'migrate', "--path=$MigrationRelativePath", '--force', '--no-interaction', '--no-ansi')
    Write-Host (Redact $applyOutput).TrimEnd()

    Write-Step 'Verifying migration, schema, policies, and unchanged production counts'
    $migrationAfter = Invoke-MySql "SELECT CONCAT_WS('|', migration, batch) FROM migrations WHERE migration='$MigrationName';"
    if ($migrationAfter -notmatch [regex]::Escape($MigrationName)) { throw 'Migration 052 was not recorded after apply.' }
    $schemaAfter = Invoke-MySql "SELECT CONCAT_WS('|', table_name, column_name, column_type, is_nullable, COALESCE(column_default,'NULL')) FROM information_schema.columns WHERE table_schema='$ExpectedDatabase' AND ((table_name='risk_deposit_policies' AND column_name='surcharge_percent') OR (table_name='order_deposit_policy_snapshots' AND column_name IN ('risk_surcharge_percent','additive_percent','policy_formula','policy_version','automatic_risk_code','automatic_risk_reason','risk_selection_source','risk_evidence'))) ORDER BY table_name, ordinal_position;"
    if (($schemaAfter -split "`r?`n").Count -ne 9) { throw 'Expected nine new columns after migration 052.' }
    $uniqueIndex = [int] (Invoke-MySql "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='$ExpectedDatabase' AND table_name='risk_deposit_policies' AND index_name='risk_deposit_surcharge_unique' AND non_unique=0;")
    if ($uniqueIndex -ne 1) { throw 'The surcharge unique index is missing.' }
    $riskAfter = Invoke-MySql "SELECT CONCAT_WS('|', code, surcharge_percent, COALESCE(minimum_deposit_percent,'NULL'), requires_manager_approval) FROM risk_deposit_policies ORDER BY priority;"
    $expectedRiskAfter = @('low|5.00|NULL|0', 'medium|10.00|NULL|0', 'high|20.00|NULL|0', 'special|30.00|NULL|1') -join "`n"
    if (($riskAfter -replace "`r", '') -ne $expectedRiskAfter) { throw 'Risk surcharge verification failed.' }
    $vipAfter = Invoke-MySql "SELECT CONCAT_WS('|', code, base_deposit_percent, deposit_policy_enabled) FROM vip_tiers ORDER BY priority;"
    if (($vipAfter -replace "`r", '') -ne $expectedVipBefore) { throw 'VIP values or activation flags changed unexpectedly.' }
    $baselineAfter = Get-Baseline
    foreach ($key in $baselineBefore.Keys) {
        $expected = $baselineBefore[$key]
        if ($key -eq 'migrations') { $expected++ }
        if ($baselineAfter[$key] -ne $expected) { throw "Unexpected count change for ${key}: before=$($baselineBefore[$key]) after=$($baselineAfter[$key])" }
    }
    Write-Host ('baselineAfter=' + ($baselineAfter | ConvertTo-Json -Compress))
    Write-Host "migration=$migrationAfter"
    Write-Host "riskPolicies=`n$riskAfter"
    Write-Host "vipPolicies=`n$vipAfter"
    Write-Host "schema=`n$schemaAfter"

    Write-Step 'Checking the MySQL error log for new errors'
    if ($null -ne $errorLogLengthBefore -and (Test-Path -LiteralPath $errorLogPath -PathType Leaf)) {
        $logFile = [IO.File]::Open($errorLogPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        try {
            [void] $logFile.Seek($errorLogLengthBefore, [IO.SeekOrigin]::Begin)
            $reader = New-Object IO.StreamReader($logFile)
            $newLogText = $reader.ReadToEnd()
        } finally {
            if ($reader) { $reader.Dispose() } else { $logFile.Dispose() }
        }
        if ($newLogText -match '(?im)^.*\[ERROR\].*$') { throw 'MySQL wrote a new ERROR entry during migration.' }
        Write-Host "newMySqlErrors=0 errorLogLengthAfter=$((Get-Item -LiteralPath $errorLogPath).Length)"
    } else {
        Write-Host 'newMySqlErrors=NOT_DIRECTLY_READABLE'
    }

    Write-Step 'Restoring application environment and verifying viettrung_app read access'
    Restore-ProcessEnvironment
    Set-Location $ProjectRoot
    $appProbe = Invoke-Native $PhpExe @($LaravelProbePath)
    if ($appProbe -notmatch 'viettrung_app@127\.0\.0\.1' -or $appProbe -notmatch '"port":3310' -or $appProbe -notmatch '"tls":"[^\"]+"') {
        throw "Application read probe failed: $appProbe"
    }
    Write-Host "applicationProbe=$($appProbe.Trim())"

    Write-Step 'Deployment complete'
    Write-Host "RESULT=SUCCESS migration052=Ran backup=$BackupPath sha256=$backupHash"
} catch {
    $safeError = Redact ($_ | Out-String)
    if (-not [string]::IsNullOrEmpty($PlainPassword) -and (Test-Path -LiteralPath $MySqlExe -PathType Leaf)) {
        try {
            $failureState = Invoke-MySql "SELECT CONCAT('migrationRows=',COUNT(*)) FROM migrations WHERE migration='$MigrationName'; SELECT CONCAT('newColumns=',COUNT(*)) FROM information_schema.columns WHERE table_schema='$ExpectedDatabase' AND ((table_name='risk_deposit_policies' AND column_name='surcharge_percent') OR (table_name='order_deposit_policy_snapshots' AND column_name IN ('risk_surcharge_percent','additive_percent','policy_formula','policy_version','automatic_risk_code','automatic_risk_reason','risk_selection_source','risk_evidence')));"
            Write-Host "failureState=`n$failureState"
        } catch {
            Write-Warning 'Could not inspect the database state after failure.'
        }
    }
    if ($BackupPath) { Write-Host "backupCandidate=$BackupPath" }
    Write-Host "ERROR=$($safeError.TrimEnd())"
    exit 1
} finally {
    Restore-ProcessEnvironment
    if ($SecretPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SecretPointer)
    }
    $PlainPassword = $null
    $credential = $null
}
