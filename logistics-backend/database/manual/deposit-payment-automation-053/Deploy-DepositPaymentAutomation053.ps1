[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$MigrationRelativePath = 'database/migrations/2026_11_26_000053_add_deposit_payment_automation_domain.php'
$MigrationPath = Join-Path $ProjectRoot $MigrationRelativePath
$ProbePath = Join-Path $PSScriptRoot 'RuntimeReadOnlyProbe.php'
$CredentialPath = 'C:\VietTrungSecrets\viettrung-dba.xml'
$BackupRoot = 'C:\VietTrungBackups'
$CaPath = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\data\ca.pem'
$MySqlBin = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin'
$MySqlExe = Join-Path $MySqlBin 'mysql.exe'
$MySqlDumpExe = Join-Path $MySqlBin 'mysqldump.exe'
$EnvPath = Join-Path $ProjectRoot '.env'
$ConfigCache = Join-Path $ProjectRoot 'bootstrap\cache\config.php'
$ExpectedPort = 3310
$ExpectedDatabase = 'logistics_system'
$ExpectedUser = 'viettrung_dba'
$MigrationName = '2026_11_26_000053_add_deposit_payment_automation_domain'
$SecretPointer = [IntPtr]::Zero
$PlainPassword = $null
$EnvBackup = $null
$EnvWriteHash = $null
$EnvironmentKeys = @('APP_ENV','APP_DEBUG','APP_CONFIG_CACHE','DB_CONNECTION','DB_HOST','DB_PORT','DB_DATABASE','DB_USERNAME','DB_PASSWORD','MYSQL_ATTR_SSL_CA','MYSQL_ATTR_SSL_VERIFY_SERVER_CERT','MYSQL_PWD')
$OriginalEnvironment = @{}

function Step([string] $message) { Write-Host "`n==> $message" }
function Set-ProcessEnvironment([string] $name, [AllowNull()][string] $value) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
function Restore-Environment { foreach ($key in $EnvironmentKeys) { Set-ProcessEnvironment $key $OriginalEnvironment[$key] } }
function Redact([string] $value) { if ($null -ne $PlainPassword) { return $value.Replace($PlainPassword, '[REDACTED]') }; return $value }
function Native([string] $file, [string[]] $arguments, [switch] $echo) {
    $output = (& $file @arguments 2>&1 | Out-String); $exit = $LASTEXITCODE; $safe = Redact $output
    if ($exit -ne 0) { throw "Command failed ($exit).`n$safe" }
    if ($echo -and -not [string]::IsNullOrWhiteSpace($safe)) { Write-Host $safe.TrimEnd() }
    return $safe
}
function MySql([string] $sql) {
    $args = @('--host=127.0.0.1',"--port=$ExpectedPort","--user=$ExpectedUser",'--protocol=TCP','--ssl-mode=VERIFY_CA',"--ssl-ca=$CaPath",'--default-character-set=utf8mb4','--batch','--raw','--skip-column-names',"--database=$ExpectedDatabase","--execute=$sql")
    return (Native $MySqlExe $args).Trim()
}
function Counts {
    $sql = "SELECT CONCAT_WS('|',(SELECT COUNT(*) FROM customers),(SELECT COUNT(*) FROM orders),(SELECT COUNT(*) FROM payment_vouchers),(SELECT COUNT(*) FROM payment_transactions),(SELECT COUNT(*) FROM customer_balance_ledgers),(SELECT COUNT(*) FROM sepay_webhook_events),(SELECT COUNT(*) FROM audit_logs),(SELECT COUNT(*) FROM migrations));"
    return (MySql $sql).Split('|')
}
function Restore-EnvIfOwned {
    if ($EnvBackup -and (Test-Path -LiteralPath $EnvBackup) -and (Test-Path -LiteralPath $EnvPath)) {
        $current = (Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash
        if ($EnvWriteHash -and $current -eq $EnvWriteHash) {
            [IO.File]::WriteAllBytes($EnvPath, [IO.File]::ReadAllBytes($EnvBackup))
            Write-Warning 'Restored the original .env because the post-activation runtime probe failed.'
        } else {
            Write-Warning 'Did not restore .env because its checksum changed after our write.'
        }
    }
}

try {
    foreach ($key in $EnvironmentKeys) { $OriginalEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
    Step 'Preflight exact production target and files'
    foreach ($path in @($MigrationPath,$ProbePath,$CredentialPath,$CaPath,$MySqlExe,$MySqlDumpExe,$EnvPath)) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing required file: $path" } }
    if (Test-Path -LiteralPath $ConfigCache) { throw 'Laravel config cache is active; refusing to change the feature flag without a controlled cache deployment.' }
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
    Set-ProcessEnvironment 'APP_ENV' 'production'; Set-ProcessEnvironment 'APP_DEBUG' 'false'
    Set-ProcessEnvironment 'APP_CONFIG_CACHE' (Join-Path ([IO.Path]::GetTempPath()) ('viettrung-config-053-'+[guid]::NewGuid().ToString('N')+'.php'))
    Set-ProcessEnvironment 'DB_CONNECTION' 'mysql'; Set-ProcessEnvironment 'DB_HOST' '127.0.0.1'; Set-ProcessEnvironment 'DB_PORT' '3310'
    Set-ProcessEnvironment 'DB_DATABASE' $ExpectedDatabase; Set-ProcessEnvironment 'DB_USERNAME' $ExpectedUser; Set-ProcessEnvironment 'DB_PASSWORD' $PlainPassword
    Set-ProcessEnvironment 'MYSQL_ATTR_SSL_CA' $CaPath; Set-ProcessEnvironment 'MYSQL_ATTR_SSL_VERIFY_SERVER_CERT' 'false'

    Step 'Verify DBA identity, port, TLS, migrations, schema and feature state'
    $identity = (MySql "SELECT CONCAT_WS('|',CURRENT_USER(),DATABASE(),@@port,@@version); SHOW SESSION STATUS LIKE 'Ssl_cipher';") -split "`r?`n"
    $parts = $identity[0].Split('|'); if ($parts[0] -ne 'viettrung_dba@127.0.0.1' -or $parts[1] -ne $ExpectedDatabase -or [int]$parts[2] -ne 3310) { throw 'Production identity verification failed.' }
    $cipher = ($identity | Where-Object { $_ -like "Ssl_cipher`t*" } | Select-Object -First 1).Split("`t")[-1]; if (-not $cipher) { throw 'TLS cipher is empty.' }
    $migrations = MySql "SELECT migration FROM migrations WHERE migration IN ('2026_11_25_000051_create_vip_and_order_deposit_policy_domain','2026_11_26_000052_add_risk_surcharge_policy','$MigrationName') ORDER BY migration;"
    if ($migrations -notmatch '000051' -or $migrations -notmatch '000052' -or $migrations -match '000053') { throw 'Migration 051/052/053 state is not the expected Ran/Ran/Pending state.' }
    $schemaCount = [int](MySql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$ExpectedDatabase' AND table_name='customer_notifications';")
    if ($schemaCount -ne 0) { throw 'Migration 053 schema is partially present.' }
    $envText = [IO.File]::ReadAllText($EnvPath)
    foreach ($required in @('SEPAY_ENABLED','SEPAY_WEBHOOK_ENABLED','SEPAY_WEBHOOK_SECRET','SEPAY_VERIFIED_ACCOUNTS')) {
        if ($envText -notmatch "(?m)^$required=(.+)$" -or [string]::IsNullOrWhiteSpace($Matches[1])) { throw "$required is missing or empty." }
    }
    if ($envText -notmatch '(?m)^SEPAY_ENABLED=true\s*$' -or $envText -notmatch '(?m)^SEPAY_WEBHOOK_ENABLED=true\s*$') { throw 'SePay or webhook is not enabled in application runtime configuration.' }
    if ($envText -match '(?m)^SEPAY_DEPOSIT_AUTO_CONFIRMATION_ENABLED=true\s*$') { throw 'Deposit automation is already enabled; refusing duplicate activation.' }
    $before = Counts
    Write-Host "identity=$($parts[0]) database=$($parts[1]) port=$($parts[2]) mysql=$($parts[3]) tls=$cipher countsBefore=$($before -join '|')"

    Step 'Create and verify fresh production backup'
    if (-not (Test-Path -LiteralPath $BackupRoot -PathType Container)) { New-Item -ItemType Directory -Path $BackupRoot | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backup = Join-Path $BackupRoot "logistics_system_before_deposit_automation_053_$stamp.sql"
    [void](Native $MySqlDumpExe @('--host=127.0.0.1','--port=3310',"--user=$ExpectedUser",'--protocol=TCP','--ssl-mode=VERIFY_CA',"--ssl-ca=$CaPath",'--single-transaction','--quick','--routines','--triggers','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF','--default-character-set=utf8mb4',"--result-file=$backup",$ExpectedDatabase))
    $backupFile = Get-Item -LiteralPath $backup; if ($backupFile.Length -lt 100000) { throw 'Backup is unexpectedly small.' }
    $backupHash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
    if ((Select-String -LiteralPath $backup -Pattern '^CREATE TABLE ' -AllMatches).Count -lt 50) { throw 'Backup structure validation failed.' }
    Write-Host "backup=$backup size=$($backupFile.Length) sha256=$backupHash"

    Step 'Scoped pretend and real migration 053 only'
    Set-Location $ProjectRoot
    $pretend = Native (Get-Command php).Source @('artisan','migrate','--pretend',"--path=$MigrationRelativePath",'--force','--no-interaction','--no-ansi')
    if ($pretend -match '(?i)\b(drop\s+table|drop\s+column|truncate|delete\s+from)\b') { throw 'Destructive SQL found in pretend output.' }
    foreach ($required in @('customer_notifications','confirmation_source','provider_transaction_id')) { if ($pretend -notmatch $required) { throw "Pretend output missing $required." } }
    [void](Native (Get-Command php).Source @('artisan','migrate',"--path=$MigrationRelativePath",'--force','--no-interaction','--no-ansi') -echo)

    Step 'Verify schema and unchanged business counts before activation'
    $recorded = MySql "SELECT COUNT(*) FROM migrations WHERE migration='$MigrationName';"; if ([int]$recorded -ne 1) { throw 'Migration 053 was not recorded.' }
    $columns = [int](MySql "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='$ExpectedDatabase' AND table_name='payment_transactions' AND column_name IN ('confirmation_source','provider','provider_transaction_id','verification_details');")
    $table = [int](MySql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$ExpectedDatabase' AND table_name='customer_notifications';")
    if ($columns -ne 4 -or $table -ne 1) { throw 'Migration 053 schema verification failed.' }
    $afterMigration = Counts
    for ($i=0; $i -lt $before.Count; $i++) { $expected=[int64]$before[$i]; if ($i -eq 7) {$expected++}; if ([int64]$afterMigration[$i] -ne $expected) { throw "Unexpected count change at index $i." } }
    if ([int](MySql 'SELECT COUNT(*) FROM customer_notifications;') -ne 0) { throw 'Migration unexpectedly created notifications.' }

    Step 'Atomically enable deposit auto-confirmation feature flag'
    $envHashBefore = (Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash
    $EnvBackup = Join-Path $BackupRoot "logistics_backend_env_before_deposit_automation_$stamp.bak"
    [IO.File]::WriteAllBytes($EnvBackup, [IO.File]::ReadAllBytes($EnvPath))
    if ((Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash -ne $envHashBefore) { throw '.env changed before the feature flag write.' }
    $next = if ($envText -match '(?m)^SEPAY_DEPOSIT_AUTO_CONFIRMATION_ENABLED=.*$') { [regex]::Replace($envText,'(?m)^SEPAY_DEPOSIT_AUTO_CONFIRMATION_ENABLED=.*$','SEPAY_DEPOSIT_AUTO_CONFIRMATION_ENABLED=true') } else { $envText.TrimEnd()+"`r`nSEPAY_DEPOSIT_AUTO_CONFIRMATION_ENABLED=true`r`n" }
    $tempEnv = Join-Path $ProjectRoot ('.env.deposit-automation-'+[guid]::NewGuid().ToString('N')+'.tmp')
    [IO.File]::WriteAllText($tempEnv,$next,(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $tempEnv -Destination $EnvPath -Force
    $EnvWriteHash = (Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash

    Step 'Read-only runtime verification after activation'
    foreach ($key in @('APP_CONFIG_CACHE','DB_HOST','DB_PORT','DB_DATABASE','DB_USERNAME','DB_PASSWORD','MYSQL_ATTR_SSL_CA','MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')) { Set-ProcessEnvironment $key $OriginalEnvironment[$key] }
    $probe = Native (Get-Command php).Source @($ProbePath)
    $json = $probe | ConvertFrom-Json
    if ($json.database -ne $ExpectedDatabase -or [int]$json.port -ne 3310 -or -not $json.tls -or -not $json.sepay_enabled -or -not $json.webhook_enabled -or -not $json.deposit_auto_confirmation_enabled -or [int]$json.notification_table -ne 1) { throw "Runtime probe failed: $probe" }
    $final = Counts
    for ($i=0; $i -lt $afterMigration.Count; $i++) { if ([int64]$final[$i] -ne [int64]$afterMigration[$i]) { throw "Runtime probe changed business count at index $i." } }
    Write-Host "activation=SUCCESS runtimeProbe=$($probe.Trim()) countsAfter=$($final -join '|')"
} catch {
    Restore-EnvIfOwned
    throw (Redact $_.Exception.Message)
} finally {
    Restore-Environment
    if ($SecretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SecretPointer) }
    $PlainPassword = $null
}
