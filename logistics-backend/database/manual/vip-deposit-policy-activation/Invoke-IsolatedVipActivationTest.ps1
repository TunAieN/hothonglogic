[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$RehearsalConfig = Join-Path $Workspace '.mysql-provenance-rehearsal-20261118\my-rehearsal.ini'
$RehearsalExe = 'C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqld.exe'
$MySqlBase = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3'
$MySqlExe = Join-Path $MySqlBase 'bin\mysql.exe'
$MySqlAdminExe = Join-Path $MySqlBase 'bin\mysqladmin.exe'
$MySqlServerExe = Join-Path $MySqlBase 'bin\mysqld.exe'
$ProductionPid = (Get-NetTCPConnection -LocalPort 3310 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -First 1
$RehearsalStopped = $false
$TemporaryServer = $null
$TemporaryRoot = $null
$Password = $null

function Wait-Listener([int] $Port, [bool] $Present, [int] $TimeoutSeconds = 30) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ([bool] $listener -eq $Present) { return $listener }
        Start-Sleep -Milliseconds 350
    } while ((Get-Date) -lt $deadline)
    throw "Listener state for port $Port did not become Present=$Present."
}

function Start-Rehearsal {
    Start-Process -FilePath $RehearsalExe `
        -ArgumentList "--defaults-file=`"$RehearsalConfig`"" `
        -WindowStyle Hidden | Out-Null
    return Wait-Listener 3311 $true
}

try {
    foreach ($path in @($RehearsalConfig, $RehearsalExe, $MySqlExe, $MySqlAdminExe, $MySqlServerExe)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing required file: $path" }
    }

    $rehearsalProcesses = Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'mysqld.exe' -and $_.CommandLine -match 'my-rehearsal\.ini'
    }
    if ($rehearsalProcesses.Count -ne 2) { throw 'Expected exactly two rehearsal parent/child processes.' }
    foreach ($process in $rehearsalProcesses) {
        if ($process.CommandLine -notmatch [regex]::Escape($RehearsalConfig)) {
            throw "PID $($process.ProcessId) does not use the verified rehearsal config."
        }
    }

    foreach ($process in ($rehearsalProcesses | Sort-Object ProcessId -Descending)) {
        Stop-Process -Id $process.ProcessId -Force
    }
    $RehearsalStopped = $true
    Wait-Listener 3311 $false | Out-Null

    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $TemporaryRoot = Join-Path $Workspace ".tmp-vip-activation-qa-$stamp"
    $dataPath = Join-Path $TemporaryRoot 'data'
    $logPath = Join-Path $TemporaryRoot 'mysql.err'
    $pidPath = Join-Path $TemporaryRoot 'mysql.pid'
    New-Item -ItemType Directory -Path $dataPath -Force | Out-Null

    $initializeOutput = (& $MySqlServerExe '--no-defaults' '--initialize-insecure' `
        "--basedir=$MySqlBase" "--datadir=$dataPath" '--console' 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "Temporary MySQL initialization failed: $initializeOutput" }

    $TemporaryServer = Start-Process -FilePath $MySqlServerExe -ArgumentList @(
        '--no-defaults',
        "--datadir=`"$dataPath`"",
        '--port=3311',
        '--bind-address=127.0.0.1',
        '--mysqlx=0',
        '--skip-log-bin',
        "--log-error=`"$logPath`"",
        "--pid-file=`"$pidPath`""
    ) -WindowStyle Hidden -PassThru
    Wait-Listener 3311 $true | Out-Null

    $Password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $sql = @"
CREATE DATABASE logistics_system_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'viettrung_qa_runner'@'127.0.0.1' IDENTIFIED BY '$Password';
GRANT ALL PRIVILEGES ON logistics_system_test.* TO 'viettrung_qa_runner'@'127.0.0.1';
FLUSH PRIVILEGES;
"@
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $MySqlExe
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($argument in @('--host=127.0.0.1', '--port=3311', '--protocol=TCP', '--user=root')) {
        [void] $startInfo.ArgumentList.Add($argument)
    }
    $client = [Diagnostics.Process]::Start($startInfo)
    $client.StandardInput.WriteLine($sql)
    $client.StandardInput.Close()
    $null = $client.StandardOutput.ReadToEnd()
    $clientError = $client.StandardError.ReadToEnd()
    $client.WaitForExit()
    if ($client.ExitCode -ne 0) { throw "Temporary QA setup failed: $clientError" }

    [Environment]::SetEnvironmentVariable('DB_PASSWORD', $Password, 'Process')
    Push-Location $ProjectRoot
    try {
        & php 'vendor\bin\phpunit' '-c' 'phpunit.vip-isolated-mysql.xml' '--stop-on-failure'
        if ($LASTEXITCODE -ne 0) { throw "VIP integration test failed with exit code $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
    Write-Host 'ISOLATED_TEST_RESULT=PASS'
} finally {
    [Environment]::SetEnvironmentVariable('DB_PASSWORD', $null, 'Process')
    $Password = $null

    if ($TemporaryServer -and -not $TemporaryServer.HasExited) {
        & $MySqlAdminExe '--host=127.0.0.1' '--port=3311' '--protocol=TCP' '--user=root' 'shutdown' 2>$null | Out-Null
        try { $TemporaryServer.WaitForExit(10000) | Out-Null } catch {}
        if (-not $TemporaryServer.HasExited) {
            Stop-Process -Id $TemporaryServer.Id -Force -ErrorAction SilentlyContinue
        }
    }

    if ($TemporaryRoot -and (Test-Path -LiteralPath $TemporaryRoot)) {
        $resolvedRoot = (Resolve-Path -LiteralPath $TemporaryRoot).Path
        $expectedPrefix = $Workspace + '\.tmp-vip-activation-qa-'
        if (-not $resolvedRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Refusing to clean up outside the verified temporary QA path.'
        }
        Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
        Write-Host 'ISOLATED_QA_CLEANUP=COMPLETE'
    }

    if ($RehearsalStopped) {
        $listener = Start-Rehearsal
        Write-Host "REHEARSAL_RESTORED=YES PID=$($listener.OwningProcess)"
    }

    $productionPidAfter = (Get-NetTCPConnection -LocalPort 3310 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -First 1
    if ($productionPidAfter -ne $ProductionPid) { throw 'Production MySQL listener PID changed unexpectedly.' }
    Write-Host "PRODUCTION_3310_UNCHANGED_PID=$productionPidAfter"
}
