[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$CredentialPath = 'C:\VietTrungSecrets\viettrung-dba.xml'
$BackupRoot = 'C:\VietTrungBackups'
$CaPath = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\data\ca.pem'
$MySqlExe = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysql.exe'
$MySqlDumpExe = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysqldump.exe'
$EnvPath = Join-Path $ProjectRoot '.env'
$ProbePath = Join-Path $ProjectRoot 'database\manual\deposit-payment-automation-053\RuntimeReadOnlyProbe.php'
$ConfigCache = Join-Path $ProjectRoot 'bootstrap\cache\config.php'
$SecretPointer = [IntPtr]::Zero
$PlainPassword = $null
$EnvBackup = $null
$EnvWriteHash = $null
$Keys = @('APP_ENV','APP_DEBUG','APP_CONFIG_CACHE','DB_CONNECTION','DB_HOST','DB_PORT','DB_DATABASE','DB_USERNAME','DB_PASSWORD','MYSQL_ATTR_SSL_CA','MYSQL_ATTR_SSL_VERIFY_SERVER_CERT','MYSQL_PWD')
$Original = @{}

function Step([string] $message) { Write-Host "`n==> $message" }
function Set-ProcessEnvironment([string] $name, [AllowNull()][string] $value) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
function Restore-Environment { foreach ($key in $Keys) { Set-ProcessEnvironment $key $Original[$key] } }
function Redact([string] $value) { if ($null -ne $PlainPassword) { return $value.Replace($PlainPassword, '[REDACTED]') }; return $value }
function Native([string] $file, [string[]] $arguments, [switch] $echo) {
    $output = (& $file @arguments 2>&1 | Out-String); $exit = $LASTEXITCODE; $safe = Redact $output
    if ($exit -ne 0) { throw "Command failed ($exit).`n$safe" }
    if ($echo -and -not [string]::IsNullOrWhiteSpace($safe)) { Write-Host $safe.TrimEnd() }
    return $safe
}
function MySql([string] $sql) {
    $args = @('--host=127.0.0.1','--port=3310','--user=viettrung_dba','--protocol=TCP','--ssl-mode=VERIFY_CA',"--ssl-ca=$CaPath",'--default-character-set=utf8mb4','--batch','--raw','--skip-column-names','--database=logistics_system',"--execute=$sql")
    return (Native $MySqlExe $args).Trim()
}
function Counts {
    return (MySql "SELECT CONCAT_WS('|',(SELECT COUNT(*) FROM customers),(SELECT COUNT(*) FROM orders),(SELECT COUNT(*) FROM payment_vouchers),(SELECT COUNT(*) FROM payment_transactions),(SELECT COUNT(*) FROM customer_balance_ledgers),(SELECT COUNT(*) FROM customer_payment_intents),(SELECT COUNT(*) FROM sepay_webhook_events),(SELECT COUNT(*) FROM customer_notifications),(SELECT COUNT(*) FROM audit_logs),(SELECT COUNT(*) FROM migrations));").Split('|')
}
function Restore-EnvIfOwned {
    if ($EnvBackup -and $EnvWriteHash -and (Test-Path -LiteralPath $EnvBackup) -and (Test-Path -LiteralPath $EnvPath)) {
        $current = (Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash
        if ($current -eq $EnvWriteHash) {
            [IO.File]::WriteAllBytes($EnvPath, [IO.File]::ReadAllBytes($EnvBackup))
            Write-Warning 'Restored the original .env because runtime verification failed.'
        } else {
            Write-Warning 'Did not restore .env because another process changed it after activation.'
        }
    }
}

try {
    foreach ($key in $Keys) { $Original[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
    Step 'Preflight exact production target and runtime files'
    foreach ($path in @($CredentialPath,$CaPath,$MySqlExe,$MySqlDumpExe,$EnvPath,$ProbePath)) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing required file: $path" } }
    if (Test-Path -LiteralPath $ConfigCache) { throw 'Laravel config cache is active; controlled cache deployment is required.' }
    if ((Get-Service -Name 'VietTrungMySQL84').Status -ne 'Running') { throw 'VietTrungMySQL84 is not running.' }
    if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 3310 -InformationLevel Quiet -WarningAction SilentlyContinue)) { throw 'Production port 3310 is not reachable.' }
    if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 8000 -InformationLevel Quiet -WarningAction SilentlyContinue)) { throw 'Laravel port 8000 is not reachable.' }

    Step 'Decrypt DBA credential only in process memory'
    $credential = Import-Clixml -LiteralPath $CredentialPath
    if ($credential -isnot [PSCredential] -or $credential.UserName -notin @('viettrung_dba','viettrung_dba@127.0.0.1')) { throw 'Unexpected DBA credential.' }
    $SecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
    $PlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($SecretPointer)
    if ([string]::IsNullOrWhiteSpace($PlainPassword)) { throw 'DPAPI password is empty.' }
    Set-ProcessEnvironment 'MYSQL_PWD' $PlainPassword

    Step 'Verify production identity, TLS, migrations and feature state'
    $identity = (MySql "SELECT CONCAT_WS('|',CURRENT_USER(),DATABASE(),@@port,@@version); SHOW SESSION STATUS LIKE 'Ssl_cipher';") -split "`r?`n"
    $parts = $identity[0].Split('|')
    if ($parts[0] -ne 'viettrung_dba@127.0.0.1' -or $parts[1] -ne 'logistics_system' -or [int]$parts[2] -ne 3310) { throw 'Production identity verification failed.' }
    $cipher = ($identity | Where-Object { $_ -like "Ssl_cipher`t*" } | Select-Object -First 1).Split("`t")[-1]
    if (-not $cipher) { throw 'TLS cipher is empty.' }
    $ran = [int](MySql "SELECT COUNT(*) FROM migrations WHERE migration IN ('2026_11_23_000049_create_customer_finance_sepay_domain','2026_11_23_000050_harden_sepay_webhook_events','2026_11_25_000051_create_vip_and_order_deposit_policy_domain','2026_11_26_000052_add_risk_surcharge_policy','2026_11_26_000053_add_deposit_payment_automation_domain');")
    if ($ran -ne 5) { throw 'Required migrations 049-053 are not all recorded.' }
    $envText = [IO.File]::ReadAllText($EnvPath)
    foreach ($required in @('SEPAY_ENABLED','SEPAY_WEBHOOK_ENABLED','SEPAY_WEBHOOK_SECRET','SEPAY_VERIFIED_ACCOUNTS')) { if ($envText -notmatch "(?m)^$required=(.+)$" -or [string]::IsNullOrWhiteSpace($Matches[1])) { throw "$required is missing or empty." } }
    if ($envText -notmatch '(?m)^SEPAY_ENABLED=true\s*$' -or $envText -notmatch '(?m)^SEPAY_WEBHOOK_ENABLED=true\s*$' -or $envText -notmatch '(?m)^SEPAY_DEPOSIT_AUTO_CONFIRMATION_ENABLED=true\s*$') { throw 'Existing SePay/deposit automation runtime is not enabled.' }
    if ($envText -match '(?m)^SEPAY_DIRECT_VOUCHER_PAYMENT_ENABLED=true\s*$') { throw 'Direct voucher payment is already enabled; refusing duplicate activation.' }
    $before = Counts
    $legacy = MySql "SELECT CONCAT_WS('|',id,voucher_code,voucher_type,status,CAST(total_amount AS UNSIGNED),CAST(paid_amount AS UNSIGNED)) FROM payment_vouchers WHERE voucher_code='DC000022' LIMIT 1;"
    Write-Host "identity=$($parts[0]) database=$($parts[1]) port=$($parts[2]) mysql=$($parts[3]) tls=$cipher countsBefore=$($before -join '|') legacyVoucher=$legacy"

    Step 'Create and verify fresh production backup'
    if (-not (Test-Path -LiteralPath $BackupRoot -PathType Container)) { New-Item -ItemType Directory -Path $BackupRoot | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backup = Join-Path $BackupRoot "logistics_system_before_direct_voucher_payment_$stamp.sql"
    [void](Native $MySqlDumpExe @('--host=127.0.0.1','--port=3310','--user=viettrung_dba','--protocol=TCP','--ssl-mode=VERIFY_CA',"--ssl-ca=$CaPath",'--single-transaction','--quick','--routines','--triggers','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF','--default-character-set=utf8mb4',"--result-file=$backup",'logistics_system'))
    $backupFile = Get-Item -LiteralPath $backup
    if ($backupFile.Length -lt 100000 -or (Select-String -LiteralPath $backup -Pattern '^CREATE TABLE ' -AllMatches).Count -lt 50) { throw 'Backup validation failed.' }
    $backupHash = (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash
    Write-Host "backup=$backup size=$($backupFile.Length) sha256=$backupHash"

    Step 'Atomically enable direct voucher payment feature flag'
    $envHashBefore = (Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash
    $EnvBackup = Join-Path $BackupRoot "logistics_backend_env_before_direct_voucher_payment_$stamp.bak"
    [IO.File]::WriteAllBytes($EnvBackup, [IO.File]::ReadAllBytes($EnvPath))
    if ((Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash -ne $envHashBefore) { throw '.env changed before the feature flag write.' }
    $next = if ($envText -match '(?m)^SEPAY_DIRECT_VOUCHER_PAYMENT_ENABLED=.*$') { [regex]::Replace($envText,'(?m)^SEPAY_DIRECT_VOUCHER_PAYMENT_ENABLED=.*$','SEPAY_DIRECT_VOUCHER_PAYMENT_ENABLED=true') } else { $envText.TrimEnd()+"`r`nSEPAY_DIRECT_VOUCHER_PAYMENT_ENABLED=true`r`n" }
    $tempEnv = Join-Path $ProjectRoot ('.env.direct-voucher-'+[guid]::NewGuid().ToString('N')+'.tmp')
    [IO.File]::WriteAllText($tempEnv,$next,(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $tempEnv -Destination $EnvPath -Force
    $EnvWriteHash = (Get-FileHash -LiteralPath $EnvPath -Algorithm SHA256).Hash

    Step 'Verify application runtime through viettrung_app and TLS'
    Set-ProcessEnvironment 'APP_ENV' 'production'; Set-ProcessEnvironment 'APP_DEBUG' 'false'
    Set-ProcessEnvironment 'APP_CONFIG_CACHE' (Join-Path ([IO.Path]::GetTempPath()) ('viettrung-direct-payment-'+[guid]::NewGuid().ToString('N')+'.php'))
    foreach ($key in @('DB_CONNECTION','DB_HOST','DB_PORT','DB_DATABASE','DB_USERNAME','DB_PASSWORD','MYSQL_ATTR_SSL_CA','MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')) { Set-ProcessEnvironment $key $Original[$key] }
    $php = (Get-Command php).Source
    $probe = Native $php @($ProbePath)
    $json = $probe | ConvertFrom-Json
    if ($json.database -ne 'logistics_system' -or [int]$json.port -ne 3310 -or -not $json.tls -or -not $json.sepay_enabled -or -not $json.webhook_enabled -or -not $json.deposit_auto_confirmation_enabled -or -not $json.direct_voucher_payment_enabled) { throw "Runtime probe failed: $probe" }
    $after = Counts
    for ($i=0; $i -lt $before.Count; $i++) { if ([int64]$before[$i] -ne [int64]$after[$i]) { throw "Unexpected production count change at index $i." } }
    Write-Host "activation=SUCCESS runtimeProbe=$($probe.Trim()) countsAfter=$($after -join '|')"
} catch {
    Restore-EnvIfOwned
    throw (Redact $_.Exception.Message)
} finally {
    Restore-Environment
    if ($SecretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SecretPointer) }
    $PlainPassword = $null
}
