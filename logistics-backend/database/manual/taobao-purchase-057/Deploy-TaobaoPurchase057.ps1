[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$MigrationRelativePath = 'database/migrations/2026_11_27_000057_create_taobao_purchase_order_domain.php'
$MigrationPath = Join-Path $ProjectRoot $MigrationRelativePath
$ProbePath = Join-Path $PSScriptRoot 'RuntimeReadOnlyProbe057.php'
$CredentialPath = 'C:\VietTrungSecrets\viettrung-dba.xml'
$BackupRoot = 'C:\VietTrungBackups'
$CaPath = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\data\ca.pem'
$MySqlBin = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin'
$MySqlExe = Join-Path $MySqlBin 'mysql.exe'
$MySqlDumpExe = Join-Path $MySqlBin 'mysqldump.exe'
$ExpectedPort = 3310
$ExpectedDatabase = 'logistics_system'
$ExpectedUser = 'viettrung_dba'
$MigrationName = '2026_11_27_000057_create_taobao_purchase_order_domain'
$PreviousMigration = '2026_11_27_000056_add_receiver_user_to_cn_packages'
$NewTables = @('taobao_purchase_orders','taobao_purchase_order_items','taobao_purchase_order_trackings')
$EnvironmentKeys = @('APP_ENV','APP_DEBUG','APP_CONFIG_CACHE','DB_CONNECTION','DB_HOST','DB_PORT','DB_DATABASE','DB_USERNAME','DB_PASSWORD','MYSQL_ATTR_SSL_CA','MYSQL_ATTR_SSL_VERIFY_SERVER_CERT','MYSQL_PWD')
$OriginalEnvironment = @{}
$SecretPointer = [IntPtr]::Zero
$PlainPassword = $null

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
    $sql = @"
SELECT CONCAT_WS('|',
 (SELECT COUNT(*) FROM orders),
 (SELECT COUNT(*) FROM order_items),
 (SELECT COUNT(*) FROM order_trackings),
 (SELECT COUNT(*) FROM cn_packages),
 (SELECT COUNT(*) FROM payment_vouchers),
 (SELECT COUNT(*) FROM payment_transactions),
 (SELECT COUNT(*) FROM customer_balance_ledgers),
 (SELECT COUNT(*) FROM sepay_webhook_events),
 (SELECT COUNT(*) FROM audit_logs),
 (SELECT COUNT(*) FROM migrations)
);
"@
    return (MySql $sql).Split('|')
}

try {
    foreach ($key in $EnvironmentKeys) { $OriginalEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }

    Step 'Validate exact files, service and production listener'
    foreach ($path in @($MigrationPath,$ProbePath,$CredentialPath,$CaPath,$MySqlExe,$MySqlDumpExe)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing required file: $path" }
    }
    $service = Get-Service -Name 'VietTrungMySQL84' -ErrorAction Stop
    if ($service.Status -ne 'Running') { throw 'VietTrungMySQL84 is not running.' }
    if (-not (Get-NetTCPConnection -LocalPort $ExpectedPort -State Listen -ErrorAction Stop)) { throw 'Production port 3310 is not listening.' }

    Step 'Decrypt DPAPI credential in process memory only'
    $credential = Import-Clixml -LiteralPath $CredentialPath
    if ($credential -isnot [PSCredential]) { throw 'Credential file is not a PSCredential.' }
    if ($credential.UserName -notin @($ExpectedUser,"$ExpectedUser@127.0.0.1")) { throw 'Unexpected DBA username.' }
    $SecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
    $PlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($SecretPointer)
    if ([string]::IsNullOrWhiteSpace($PlainPassword)) { throw 'DPAPI password is empty.' }

    Set-ProcessEnvironment 'MYSQL_PWD' $PlainPassword
    Set-ProcessEnvironment 'APP_ENV' 'production'
    Set-ProcessEnvironment 'APP_DEBUG' 'false'
    Set-ProcessEnvironment 'APP_CONFIG_CACHE' (Join-Path ([IO.Path]::GetTempPath()) ('viettrung-config-057-'+[guid]::NewGuid().ToString('N')+'.php'))
    Set-ProcessEnvironment 'DB_CONNECTION' 'mysql'
    Set-ProcessEnvironment 'DB_HOST' '127.0.0.1'
    Set-ProcessEnvironment 'DB_PORT' "$ExpectedPort"
    Set-ProcessEnvironment 'DB_DATABASE' $ExpectedDatabase
    Set-ProcessEnvironment 'DB_USERNAME' $ExpectedUser
    Set-ProcessEnvironment 'DB_PASSWORD' $PlainPassword
    Set-ProcessEnvironment 'MYSQL_ATTR_SSL_CA' $CaPath
    Set-ProcessEnvironment 'MYSQL_ATTR_SSL_VERIFY_SERVER_CERT' 'false'

    Step 'Verify DBA identity, TLS, grants, migrations and parent schema'
    $identity = MySql "SELECT CONCAT_WS('|',CURRENT_USER(),DATABASE(),@@port,@@version); SHOW SESSION STATUS LIKE 'Ssl_cipher';"
    $lines = $identity -split "`r?`n"
    $parts = $lines[0].Split('|')
    $cipherLine = $lines | Where-Object { $_ -like "Ssl_cipher`t*" } | Select-Object -First 1
    $cipher = if ($cipherLine) { $cipherLine.Split("`t")[-1] } else { '' }
    if ($parts[0] -ne 'viettrung_dba@127.0.0.1' -or $parts[1] -ne $ExpectedDatabase -or [int]$parts[2] -ne $ExpectedPort -or [string]::IsNullOrWhiteSpace($cipher)) { throw 'Production identity/database/port/TLS verification failed.' }
    $grants = MySql 'SHOW GRANTS FOR CURRENT_USER;'
    foreach ($required in @('SELECT','INSERT','CREATE','REFERENCES','INDEX','ALTER')) { if ($grants -notmatch "\b$required\b") { throw "DBA missing privilege: $required" } }
    $prior = [int](MySql "SELECT COUNT(*) FROM migrations WHERE migration='$PreviousMigration';")
    $current = [int](MySql "SELECT COUNT(*) FROM migrations WHERE migration='$MigrationName';")
    if ($prior -ne 1 -or $current -ne 0) { throw 'Expected migration state is not 056 Ran / 057 Pending.' }
    $tableCount = [int](MySql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$ExpectedDatabase' AND table_name IN ('taobao_purchase_orders','taobao_purchase_order_items','taobao_purchase_order_trackings');")
    if ($tableCount -ne 0) { throw 'Migration 057 schema is partially present while Pending.' }
    $parentTypes = MySql "SELECT CONCAT_WS('|',table_name,column_type) FROM information_schema.columns WHERE table_schema='$ExpectedDatabase' AND column_name='id' AND table_name IN ('orders','order_items','order_trackings','users') ORDER BY table_name;"
    if (($parentTypes -split "`r?`n" | Where-Object { $_ -notmatch '\|bigint unsigned$' }).Count -ne 0 -or ($parentTypes -split "`r?`n").Count -ne 4) { throw 'Parent primary-key types are not compatible with foreignId().' }
    Write-Host "identity=$($parts[0]) database=$($parts[1]) port=$($parts[2]) mysql=$($parts[3]) tlsCipher=$cipher"

    Set-Location $ProjectRoot
    $probeBeforeText = Native (Get-Command php).Source @($ProbePath)
    $probeBefore = $probeBeforeText | ConvertFrom-Json
    if ($probeBefore.account -ne 'viettrung_dba@127.0.0.1' -or [int]$probeBefore.port -ne 3310 -or [string]::IsNullOrWhiteSpace($probeBefore.tls) -or [int]$probeBefore.tables_057 -ne 0 -or [int]$probeBefore.migration_057 -ne 0) { throw "Laravel PDO preflight failed: $(Redact $probeBeforeText)" }
    $before = Counts
    Write-Host "countsBefore=$($before -join '|')"

    Step 'Create and validate fresh production backup'
    if (-not (Test-Path -LiteralPath $BackupRoot -PathType Container)) { New-Item -ItemType Directory -Path $BackupRoot | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backup = Join-Path $BackupRoot "logistics_system_before_taobao_purchase_057_$stamp.sql"
    if (Test-Path -LiteralPath $backup) { throw 'Refusing to overwrite an existing backup.' }
    [void](Native $MySqlDumpExe @('--host=127.0.0.1',"--port=$ExpectedPort","--user=$ExpectedUser",'--protocol=TCP','--ssl-mode=VERIFY_CA',"--ssl-ca=$CaPath",'--single-transaction','--quick','--routines','--triggers','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF','--default-character-set=utf8mb4',"--result-file=$backup",$ExpectedDatabase))
    $backupFile = Get-Item -LiteralPath $backup
    $backupTextTail = Get-Content -LiteralPath $backup -Tail 5 | Out-String
    $createCount = (Select-String -LiteralPath $backup -Pattern '^CREATE TABLE ' -AllMatches).Count
    $insertCount = (Select-String -LiteralPath $backup -Pattern '^INSERT INTO ' -AllMatches).Count
    if ($backupFile.Length -lt 100000 -or $createCount -lt 50 -or $insertCount -lt 1 -or $backupTextTail -notmatch 'Dump completed') { throw 'Backup size/structure/completion validation failed.' }
    $backupHash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
    Write-Host "backup=$backup size=$($backupFile.Length) sha256=$backupHash createTables=$createCount insertStatements=$insertCount"

    Step 'Validate exact migration hash and scoped pretend SQL'
    $migrationHash = (Get-FileHash -LiteralPath $MigrationPath -Algorithm SHA256).Hash
    $pretend = Native (Get-Command php).Source @('artisan','migrate','--pretend',"--path=$MigrationRelativePath",'--force','--no-interaction','--no-ansi')
    if ($pretend -match '(?i)\b(drop\s+table|drop\s+column|truncate|delete\s+from|update\s+)\b') { throw 'Destructive/data-changing SQL found in pretend output.' }
    foreach ($table in $NewTables) { if ($pretend -notmatch [regex]::Escape("create table ``$table``")) { throw "Pretend output missing CREATE TABLE $table." } }
    if ($pretend -match '(?i)alter table `(orders|order_items|order_trackings|cn_packages|payment_vouchers|payment_transactions|customer_balance_ledgers|sepay_webhook_events)`') { throw 'Pretend output alters an existing protected table.' }
    Write-Host "migrationSha256=$migrationHash pretend=PASS"

    Step 'Apply only scoped migration 057 through Laravel CLI'
    [void](Native (Get-Command php).Source @('artisan','migrate',"--path=$MigrationRelativePath",'--force','--no-interaction','--no-ansi') -echo)

    Step 'Verify migration, tables, keys, indexes and unchanged business counts'
    $record = MySql "SELECT CONCAT_WS('|',migration,batch) FROM migrations WHERE migration='$MigrationName';"
    if ($record -notmatch [regex]::Escape($MigrationName)) { throw 'Migration 057 was not recorded.' }
    $newTableCount = [int](MySql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$ExpectedDatabase' AND table_name IN ('taobao_purchase_orders','taobao_purchase_order_items','taobao_purchase_order_trackings');")
    $foreignKeyCount = [int](MySql "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema='$ExpectedDatabase' AND table_name IN ('taobao_purchase_orders','taobao_purchase_order_items','taobao_purchase_order_trackings');")
    $namedIndexCount = [int](MySql "SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema='$ExpectedDatabase' AND index_name IN ('taobao_purchase_order_code_unique','taobao_purchase_external_code_index','taobao_purchase_order_status_index','taobao_purchase_item_unique','taobao_purchase_order_item_index','taobao_purchase_tracking_unique');")
    $newRows = (MySql "SELECT CONCAT_WS('|',(SELECT COUNT(*) FROM taobao_purchase_orders),(SELECT COUNT(*) FROM taobao_purchase_order_items),(SELECT COUNT(*) FROM taobao_purchase_order_trackings));").Split('|')
    if ($newTableCount -ne 3 -or $foreignKeyCount -ne 9 -or $namedIndexCount -ne 6 -or ($newRows -join '|') -ne '0|0|0') { throw "Postflight schema mismatch tables=$newTableCount foreignKeys=$foreignKeyCount namedIndexes=$namedIndexCount rows=$($newRows -join '|')" }
    $after = Counts
    for ($i=0; $i -lt $before.Count; $i++) {
        $expected = [int64]$before[$i]
        if ($i -eq 9) { $expected++ }
        if ([int64]$after[$i] -ne $expected) { throw "Unexpected protected count change at index ${i}: before=$($before[$i]) after=$($after[$i])" }
    }
    $probeAfterText = Native (Get-Command php).Source @($ProbePath)
    $probeAfter = $probeAfterText | ConvertFrom-Json
    if ([int]$probeAfter.tables_057 -ne 3 -or [int]$probeAfter.migration_057 -ne 1 -or [string]::IsNullOrWhiteSpace($probeAfter.tls)) { throw "Laravel PDO postflight failed: $(Redact $probeAfterText)" }
    Write-Host "migration057=RAN batch=$($record.Split('|')[-1]) tables=3 foreignKeys=9 namedIndexes=6 newRows=0|0|0 countsAfter=$($after -join '|')"
} catch {
    throw (Redact $_.Exception.Message)
} finally {
    Restore-Environment
    if ($SecretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SecretPointer) }
    $PlainPassword = $null
}
