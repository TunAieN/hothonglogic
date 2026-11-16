$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Security

$mysqlBin = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysqldump.exe'
$credentialFile = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\secrets\backup-password.dpapi'
$backupRoot = 'E:\MySQL_VietTrung_Backups\automatic'
$dailyRoot = Join-Path $backupRoot 'daily'
$weeklyRoot = Join-Path $backupRoot 'weekly'
$monthlyRoot = Join-Path $backupRoot 'monthly'
$failureFile = Join-Path $backupRoot 'last-failure.txt'
$logFile = Join-Path $backupRoot 'backup.log'

function Assert-ExactDirectory([string] $path, [string] $expected) {
    $resolved = [IO.Path]::GetFullPath($path).TrimEnd('\')
    $safe = [IO.Path]::GetFullPath($expected).TrimEnd('\')
    if (-not $resolved.Equals($safe, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe backup directory: $resolved"
    }
}

function Assert-ApprovedRetentionDirectory([string] $path) {
    $resolved = [IO.Path]::GetFullPath($path).TrimEnd('\')
    $approved = @($dailyRoot, $weeklyRoot, $monthlyRoot) |
        ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') }
    if (-not ($approved | Where-Object { $_.Equals($resolved, [StringComparison]::OrdinalIgnoreCase) })) {
        throw "Retention refused outside approved directories: $resolved"
    }
}

function Remove-ExpiredBackupSet([string] $directory, [int] $days) {
    Assert-ApprovedRetentionDirectory $directory
    $cutoff = (Get-Date).AddDays(-$days)
    Get-ChildItem -LiteralPath $directory -File -Force |
        Where-Object { $_.Name -like 'logistics_system_*.sql' -or $_.Name -like 'logistics_system_*.sha256' -or $_.Name -like 'logistics_system_*.json' } |
        Where-Object LastWriteTime -lt $cutoff |
        Remove-Item -Force
}

foreach ($directory in @($backupRoot, $dailyRoot, $weeklyRoot, $monthlyRoot)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$baseName = "logistics_system_$timestamp"
$partial = Join-Path $dailyRoot "$baseName.sql.partial"
$final = Join-Path $dailyRoot "$baseName.sql"
$hashFile = Join-Path $dailyRoot "$baseName.sha256"
$manifestFile = Join-Path $dailyRoot "$baseName.json"
$protectedBytes = $null
$plainBytes = $null
$password = $null

try {
    $protectedBytes = [Convert]::FromBase64String((Get-Content -LiteralPath $credentialFile -Raw).Trim())
    $plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $protectedBytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::LocalMachine
    )
    $password = [Text.Encoding]::UTF8.GetString($plainBytes)
    $env:MYSQL_PWD = $password

    & $mysqlBin `
        --protocol=TCP `
        --host=127.0.0.1 `
        --port=3310 `
        --user=viettrung_backup `
        --single-transaction `
        --quick `
        --routines `
        --triggers `
        --events `
        --hex-blob `
        --set-gtid-purged=OFF `
        --default-character-set=utf8mb4 `
        --no-tablespaces `
        --result-file=$partial `
        logistics_system

    if ($LASTEXITCODE -ne 0) {
        throw "mysqldump failed with exit code $LASTEXITCODE"
    }
    if (-not (Test-Path -LiteralPath $partial) -or (Get-Item -LiteralPath $partial).Length -lt 1024) {
        throw 'Backup output is missing or unexpectedly small.'
    }

    Move-Item -LiteralPath $partial -Destination $final
    $hash = (Get-FileHash -LiteralPath $final -Algorithm SHA256).Hash
    "$hash  $([IO.Path]::GetFileName($final))" | Set-Content -LiteralPath $hashFile -Encoding ascii
    [ordered]@{
        created_at = (Get-Date).ToString('o')
        server = '127.0.0.1'
        port = 3310
        database = 'logistics_system'
        file = [IO.Path]::GetFileName($final)
        bytes = (Get-Item -LiteralPath $final).Length
        sha256 = $hash
    } | ConvertTo-Json | Set-Content -LiteralPath $manifestFile -Encoding utf8

    if ((Get-Date).DayOfWeek -eq [DayOfWeek]::Sunday) {
        Copy-Item -LiteralPath $final, $hashFile, $manifestFile -Destination $weeklyRoot
    }
    if ((Get-Date).Day -eq 1) {
        Copy-Item -LiteralPath $final, $hashFile, $manifestFile -Destination $monthlyRoot
    }

    Remove-ExpiredBackupSet $dailyRoot 14
    Remove-ExpiredBackupSet $weeklyRoot 56
    Remove-ExpiredBackupSet $monthlyRoot 365
    if (Test-Path -LiteralPath $failureFile) { Remove-Item -LiteralPath $failureFile -Force }
    "$(Get-Date -Format o) SUCCESS $([IO.Path]::GetFileName($final)) $hash" | Add-Content -LiteralPath $logFile -Encoding utf8
} catch {
    $message = "$(Get-Date -Format o) FAILED $($_.Exception.Message)"
    $message | Set-Content -LiteralPath $failureFile -Encoding utf8
    $message | Add-Content -LiteralPath $logFile -Encoding utf8
    & eventcreate.exe /T ERROR /ID 500 /L APPLICATION /SO VietTrungMySQL84Backup /D 'VietTrung MySQL 8.4 backup failed. Check the protected backup log.' 2>$null | Out-Null
    throw
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    if ($plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
    $password = $null
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
}
