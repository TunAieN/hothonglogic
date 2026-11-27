[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$MigrationRelativePath = 'database/migrations/2026_11_27_000056_add_receiver_user_to_cn_packages.php'
$MigrationPath = Join-Path $ProjectRoot $MigrationRelativePath
$ProbePath = Join-Path $PSScriptRoot 'RuntimeReadOnlyProbe056.php'
$CredentialPath = 'C:\VietTrungSecrets\viettrung-dba.xml'
$BackupRoot = 'C:\VietTrungBackups'
$CaPath = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\data\ca.pem'
$MySqlBin = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin'
$MySqlExe = Join-Path $MySqlBin 'mysql.exe'
$MySqlDumpExe = Join-Path $MySqlBin 'mysqldump.exe'
$ExpectedPort = 3310
$ExpectedDatabase = 'logistics_system'
$ExpectedUser = 'viettrung_dba'
$MigrationName = '2026_11_27_000056_add_receiver_user_to_cn_packages'
$SecretPointer = [IntPtr]::Zero
$PlainPassword = $null
$EnvironmentKeys = @('APP_ENV','APP_DEBUG','APP_CONFIG_CACHE','DB_CONNECTION','DB_HOST','DB_PORT','DB_DATABASE','DB_USERNAME','DB_PASSWORD','MYSQL_ATTR_SSL_CA','MYSQL_ATTR_SSL_VERIFY_SERVER_CERT','MYSQL_PWD')
$OriginalEnvironment = @{}

function Step([string] $message) { Write-Host "`n==> $message" }
function Set-ProcessEnvironment([string] $name, [AllowNull()][string] $value) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
function Restore-Environment { foreach ($key in $EnvironmentKeys) { Set-ProcessEnvironment $key $OriginalEnvironment[$key] } }
function Redact([string] $value) { if ($null -ne $PlainPassword) { return $value.Replace($PlainPassword, '[REDACTED]') }; return $value }
function Native([string] $file, [string[]] $arguments, [switch] $echo) {
    $output = (& $file @arguments 2>&1 | Out-String)
    $exit = $LASTEXITCODE
    $safe = Redact $output
    if ($exit -ne 0) { throw "Command failed ($exit).`n$safe" }
    if ($echo -and -not [string]::IsNullOrWhiteSpace($safe)) { Write-Host $safe.TrimEnd() }
    return $safe
}
function MySql([string] $sql) {
    $arguments = @('--host=127.0.0.1',"--port=$ExpectedPort","--user=$ExpectedUser",'--protocol=TCP','--ssl-mode=VERIFY_CA',"--ssl-ca=$CaPath",'--default-character-set=utf8mb4','--batch','--raw','--skip-column-names',"--database=$ExpectedDatabase","--execute=$sql")
    return (Native $MySqlExe $arguments).Trim()
}
function Counts {
    $sql = "SELECT CONCAT_WS('|',(SELECT COUNT(*) FROM cn_packages),(SELECT COUNT(*) FROM cn_package_items),(SELECT COUNT(*) FROM order_trackings),(SELECT COUNT(*) FROM orders),(SELECT COUNT(*) FROM users),(SELECT COUNT(*) FROM cn_warehouses),(SELECT COUNT(*) FROM payment_vouchers),(SELECT COUNT(*) FROM payment_transactions),(SELECT COUNT(*) FROM customer_balance_ledgers),(SELECT COUNT(*) FROM sepay_webhook_events),(SELECT COUNT(*) FROM migrations));"
    return (MySql $sql).Split('|')
}

try {
    foreach ($key in $EnvironmentKeys) { $OriginalEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }

    Step 'Preflight exact production target and required files'
    foreach ($path in @($MigrationPath,$ProbePath,$CredentialPath,$CaPath,$MySqlExe,$MySqlDumpExe)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing required file: $path" }
    }
    $service = Get-Service -Name 'VietTrungMySQL84' -ErrorAction Stop
    if ($service.Status -ne 'Running') { throw 'VietTrungMySQL84 is not running.' }
    if (-not (Get-NetTCPConnection -LocalPort $ExpectedPort -State Listen -ErrorAction Stop)) { throw 'Production port 3310 is not listening.' }

    Step 'Decrypt DPAPI credential only in process memory'
    $credential = Import-Clixml -LiteralPath $CredentialPath
    if ($credential -isnot [PSCredential]) { throw 'Credential file is not a PSCredential.' }
    if ($credential.UserName -notin @($ExpectedUser,"$ExpectedUser@127.0.0.1")) { throw 'Unexpected DBA username.' }
    $SecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
    $PlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($SecretPointer)
    if ([string]::IsNullOrWhiteSpace($PlainPassword)) { throw 'DPAPI password is empty.' }

    Set-ProcessEnvironment 'MYSQL_PWD' $PlainPassword
    Set-ProcessEnvironment 'APP_ENV' 'production'
    Set-ProcessEnvironment 'APP_DEBUG' 'false'
    Set-ProcessEnvironment 'APP_CONFIG_CACHE' (Join-Path ([IO.Path]::GetTempPath()) ('viettrung-config-056-'+[guid]::NewGuid().ToString('N')+'.php'))
    Set-ProcessEnvironment 'DB_CONNECTION' 'mysql'
    Set-ProcessEnvironment 'DB_HOST' '127.0.0.1'
    Set-ProcessEnvironment 'DB_PORT' '3310'
    Set-ProcessEnvironment 'DB_DATABASE' $ExpectedDatabase
    Set-ProcessEnvironment 'DB_USERNAME' $ExpectedUser
    Set-ProcessEnvironment 'DB_PASSWORD' $PlainPassword
    Set-ProcessEnvironment 'MYSQL_ATTR_SSL_CA' $CaPath
    Set-ProcessEnvironment 'MYSQL_ATTR_SSL_VERIFY_SERVER_CERT' 'false'

    Step 'Verify Laravel PDO identity, TLS, migration state, schema and invariants'
    $probeText = Native (Get-Command php).Source @($ProbePath)
    $probe = $probeText | ConvertFrom-Json
    if ($probe.user -ne 'viettrung_dba@127.0.0.1' -or $probe.database -ne $ExpectedDatabase -or [int]$probe.port -ne $ExpectedPort -or [string]::IsNullOrWhiteSpace($probe.tls_cipher)) { throw "Laravel PDO target verification failed: $(Redact $probeText)" }
    if ([int]$probe.migration_056 -ne 0 -or [bool]$probe.receiver_column) { throw 'Migration 056 is already or partially present; refusing to continue.' }
    $foreignKey = [int](MySql "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema='$ExpectedDatabase' AND table_name='cn_packages' AND constraint_name='cn_packages_receiver_user_id_foreign';")
    if ($foreignKey -ne 0) { throw 'Migration 056 foreign key is partially present.' }
    $before = Counts
    Write-Host "identity=$($probe.user) database=$($probe.database) port=$($probe.port) mysql=$($probe.mysql) tls=$($probe.tls_version)/$($probe.tls_cipher) countsBefore=$($before -join '|')"

    Step 'Create and verify fresh production backup'
    if (-not (Test-Path -LiteralPath $BackupRoot -PathType Container)) { New-Item -ItemType Directory -Path $BackupRoot | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backup = Join-Path $BackupRoot "logistics_system_before_cn_receiver_056_$stamp.sql"
    [void](Native $MySqlDumpExe @('--host=127.0.0.1','--port=3310',"--user=$ExpectedUser",'--protocol=TCP','--ssl-mode=VERIFY_CA',"--ssl-ca=$CaPath",'--single-transaction','--quick','--routines','--triggers','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF','--default-character-set=utf8mb4',"--result-file=$backup",$ExpectedDatabase))
    $backupFile = Get-Item -LiteralPath $backup
    if ($backupFile.Length -lt 100000) { throw 'Backup is unexpectedly small.' }
    if ((Select-String -LiteralPath $backup -Pattern '^CREATE TABLE ' -AllMatches).Count -lt 50) { throw 'Backup structure validation failed.' }
    $backupHash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
    Write-Host "backup=$backup size=$($backupFile.Length) sha256=$backupHash"

    Step 'Run scoped pretend and migration 056 only'
    Set-Location $ProjectRoot
    $pretend = Native (Get-Command php).Source @('artisan','migrate','--pretend',"--path=$MigrationRelativePath",'--force','--no-interaction','--no-ansi')
    if ($pretend -match '(?i)\b(drop\s+table|drop\s+column|truncate|delete\s+from|update\s+)\b') { throw 'Destructive or data-changing SQL found in pretend output.' }
    foreach ($required in @('receiver_user_id','cn_packages_receiver_user_id_foreign','references `users`')) { if ($pretend -notmatch [regex]::Escape($required)) { throw "Pretend output missing $required." } }
    [void](Native (Get-Command php).Source @('artisan','migrate',"--path=$MigrationRelativePath",'--force','--no-interaction','--no-ansi') -echo)

    Step 'Verify migration, schema, FK and unchanged business data'
    $recorded = [int](MySql "SELECT COUNT(*) FROM migrations WHERE migration='$MigrationName';")
    $column = MySql "SELECT CONCAT_WS('|',column_type,is_nullable) FROM information_schema.columns WHERE table_schema='$ExpectedDatabase' AND table_name='cn_packages' AND column_name='receiver_user_id';"
    $foreignKey = [int](MySql "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema='$ExpectedDatabase' AND table_name='cn_packages' AND constraint_name='cn_packages_receiver_user_id_foreign' AND referenced_table_name='users' AND delete_rule='SET NULL';")
    $populatedLegacyRows = [int](MySql 'SELECT COUNT(*) FROM cn_packages WHERE receiver_user_id IS NOT NULL;')
    if ($recorded -ne 1 -or $column -ne 'bigint unsigned|YES' -or $foreignKey -ne 1 -or $populatedLegacyRows -ne 0) { throw 'Migration 056 postflight schema verification failed.' }
    $after = Counts
    for ($i=0; $i -lt $before.Count; $i++) {
        $expected = [int64]$before[$i]
        if ($i -eq 10) { $expected++ }
        if ([int64]$after[$i] -ne $expected) { throw "Unexpected count change at index $i." }
    }
    $finalProbeText = Native (Get-Command php).Source @($ProbePath)
    $finalProbe = $finalProbeText | ConvertFrom-Json
    if ([int]$finalProbe.migration_056 -ne 1 -or -not [bool]$finalProbe.receiver_column) { throw "Post-migration Laravel probe failed: $(Redact $finalProbeText)" }
    Write-Host "migration056=RAN column=$column fk=SET_NULL legacyRowsBackfilled=$populatedLegacyRows countsAfter=$($after -join '|')"
} catch {
    throw (Redact $_.Exception.Message)
} finally {
    Restore-Environment
    if ($SecretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SecretPointer) }
    $PlainPassword = $null
}
