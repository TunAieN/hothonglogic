[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$MigrationRelativePath = 'database/migrations/2026_11_27_000054_add_customer_order_delivery_address_support.php'
$MigrationPath = Join-Path $ProjectRoot $MigrationRelativePath
$ProbePath = Join-Path $PSScriptRoot 'RuntimeReadOnlyProbe054.php'
$CredentialPath = 'C:\VietTrungSecrets\viettrung-dba.xml'
$BackupRoot = 'C:\VietTrungBackups'
$CaPath = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\data\ca.pem'
$MySqlBin = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin'
$MySqlExe = Join-Path $MySqlBin 'mysql.exe'
$MySqlDumpExe = Join-Path $MySqlBin 'mysqldump.exe'
$ExpectedPort = 3310
$ExpectedDatabase = 'logistics_system'
$ExpectedUser = 'viettrung_dba'
$MigrationName = '2026_11_27_000054_add_customer_order_delivery_address_support'
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
    $sql = "SELECT CONCAT_WS('|',(SELECT COUNT(*) FROM customers),(SELECT COUNT(*) FROM orders),(SELECT COUNT(*) FROM customer_addresses),(SELECT COUNT(*) FROM delivery_requests),(SELECT COUNT(*) FROM delivery_addresses),(SELECT COUNT(*) FROM payment_vouchers),(SELECT COUNT(*) FROM payment_transactions),(SELECT COUNT(*) FROM customer_balance_ledgers),(SELECT COUNT(*) FROM sepay_webhook_events),(SELECT COUNT(*) FROM audit_logs),(SELECT COUNT(*) FROM migrations));"
    return (MySql $sql).Split('|')
}

try {
    foreach ($key in $EnvironmentKeys) { $OriginalEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }

    Step 'Preflight exact production target and deployment files'
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
    Set-ProcessEnvironment 'APP_CONFIG_CACHE' (Join-Path ([IO.Path]::GetTempPath()) ('viettrung-config-054-'+[guid]::NewGuid().ToString('N')+'.php'))
    Set-ProcessEnvironment 'DB_CONNECTION' 'mysql'
    Set-ProcessEnvironment 'DB_HOST' '127.0.0.1'
    Set-ProcessEnvironment 'DB_PORT' '3310'
    Set-ProcessEnvironment 'DB_DATABASE' $ExpectedDatabase
    Set-ProcessEnvironment 'DB_USERNAME' $ExpectedUser
    Set-ProcessEnvironment 'DB_PASSWORD' $PlainPassword
    Set-ProcessEnvironment 'MYSQL_ATTR_SSL_CA' $CaPath
    Set-ProcessEnvironment 'MYSQL_ATTR_SSL_VERIFY_SERVER_CERT' 'false'

    Step 'Verify Laravel PDO identity, TLS, migration state, schema and data invariants'
    $probeText = Native (Get-Command php).Source @($ProbePath)
    $probe = $probeText | ConvertFrom-Json
    if ($probe.user -ne 'viettrung_dba@127.0.0.1' -or $probe.database -ne $ExpectedDatabase -or [int]$probe.port -ne $ExpectedPort -or [string]::IsNullOrWhiteSpace($probe.tls)) { throw "Laravel PDO target verification failed: $(Redact $probeText)" }
    if ([int]$probe.migration_054 -ne 0) { throw 'Migration 054 is already recorded; refusing to run it again.' }
    if ([int]$probe.duplicate_defaults -ne 0) { throw 'Multiple default addresses exist for at least one customer; unique index cannot be added safely.' }
    $prior = [int](MySql "SELECT COUNT(*) FROM migrations WHERE migration IN ('2026_11_25_000051_create_vip_and_order_deposit_policy_domain','2026_11_26_000052_add_risk_surcharge_policy','2026_11_26_000053_add_deposit_payment_automation_domain');")
    if ($prior -ne 3) { throw 'Migration 051/052/053 state is not Ran/Ran/Ran.' }
    $schema = (MySql "SELECT CONCAT_WS('|',(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='$ExpectedDatabase' AND table_name='customer_addresses' AND column_name='delivery_note'),(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='$ExpectedDatabase' AND table_name='customer_addresses' AND column_name='default_customer_id'),(SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='$ExpectedDatabase' AND table_name='customer_addresses' AND index_name='customer_addresses_one_default_unique'));").Split('|')
    if ($schema[0] -ne '0' -or $schema[1] -ne '0' -or $schema[2] -ne '0') { throw 'Migration 054 schema is partially present.' }
    $before = Counts
    Write-Host "identity=$($probe.user) database=$($probe.database) port=$($probe.port) mysql=$($probe.mysql) tls=$($probe.tls) countsBefore=$($before -join '|')"

    Step 'Create and verify fresh production backup'
    if (-not (Test-Path -LiteralPath $BackupRoot -PathType Container)) { New-Item -ItemType Directory -Path $BackupRoot | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backup = Join-Path $BackupRoot "logistics_system_before_customer_address_054_$stamp.sql"
    [void](Native $MySqlDumpExe @('--host=127.0.0.1','--port=3310',"--user=$ExpectedUser",'--protocol=TCP','--ssl-mode=VERIFY_CA',"--ssl-ca=$CaPath",'--single-transaction','--quick','--routines','--triggers','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF','--default-character-set=utf8mb4',"--result-file=$backup",$ExpectedDatabase))
    $backupFile = Get-Item -LiteralPath $backup
    if ($backupFile.Length -lt 100000) { throw 'Backup is unexpectedly small.' }
    $backupHash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
    if ((Select-String -LiteralPath $backup -Pattern '^CREATE TABLE ' -AllMatches).Count -lt 50) { throw 'Backup structure validation failed.' }
    Write-Host "backup=$backup size=$($backupFile.Length) sha256=$backupHash"

    Step 'Run scoped pretend and migration 054 only'
    Set-Location $ProjectRoot
    $pretend = Native (Get-Command php).Source @('artisan','migrate','--pretend',"--path=$MigrationRelativePath",'--force','--no-interaction','--no-ansi')
    if ($pretend -match '(?i)\b(drop\s+table|drop\s+column|truncate|delete\s+from|update\s+)\b') { throw 'Destructive or data-changing SQL found in pretend output.' }
    foreach ($required in @('delivery_note','default_customer_id','customer_addresses_one_default_unique')) { if ($pretend -notmatch $required) { throw "Pretend output missing $required." } }
    [void](Native (Get-Command php).Source @('artisan','migrate',"--path=$MigrationRelativePath",'--force','--no-interaction','--no-ansi') -echo)

    Step 'Verify recorded migration, schema, uniqueness and unchanged business data'
    $recorded = [int](MySql "SELECT COUNT(*) FROM migrations WHERE migration='$MigrationName';")
    if ($recorded -ne 1) { throw 'Migration 054 was not recorded.' }
    $columns = MySql "SELECT column_name,column_type,is_nullable,extra FROM information_schema.columns WHERE table_schema='$ExpectedDatabase' AND table_name='customer_addresses' AND column_name IN ('delivery_note','default_customer_id') ORDER BY column_name;"
    $index = [int](MySql "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='$ExpectedDatabase' AND table_name='customer_addresses' AND index_name='customer_addresses_one_default_unique' AND non_unique=0;")
    if ($columns -notmatch 'delivery_note' -or $columns -notmatch 'default_customer_id' -or $index -ne 1) { throw 'Migration 054 schema verification failed.' }
    $after = Counts
    for ($i=0; $i -lt $before.Count; $i++) {
        $expected = [int64]$before[$i]
        if ($i -eq 10) { $expected++ }
        if ([int64]$after[$i] -ne $expected) { throw "Unexpected count change at index $i." }
    }
    $finalProbeText = Native (Get-Command php).Source @($ProbePath)
    $finalProbe = $finalProbeText | ConvertFrom-Json
    if ([int]$finalProbe.migration_054 -ne 1 -or [int]$finalProbe.duplicate_defaults -ne 0) { throw "Post-migration Laravel probe failed: $(Redact $finalProbeText)" }
    Write-Host "migration054=RAN schema=$($columns -replace "`r?`n",'; ') countsAfter=$($after -join '|')"
} catch {
    throw (Redact $_.Exception.Message)
} finally {
    Restore-Environment
    if ($SecretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SecretPointer) }
    $PlainPassword = $null
}
