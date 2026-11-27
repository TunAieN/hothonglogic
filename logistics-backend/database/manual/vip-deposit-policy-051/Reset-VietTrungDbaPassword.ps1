#requires -Version 5.1

[CmdletBinding()]
param(
    [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ServiceName = 'VietTrungMySQL84'
$ExpectedServiceIdentity = 'NT SERVICE\VietTrungMySQL84'
$MySqlServerExe = 'C:\Program Files\VietTrungOrder\MySQL\8.4.3\bin\mysqld.exe'
$MySqlClientExe = 'C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe'
$ScExe = Join-Path $env:SystemRoot 'System32\sc.exe'
$RegExe = Join-Path $env:SystemRoot 'System32\reg.exe'
$LaravelBackend = 'C:\laragon\www\extention\logistics-backend'
$LaravelArtisan = 'C:\laragon\www\extention\logistics-backend\artisan'
$VipMigrationRelativePath = 'database/migrations/2026_11_25_000051_create_vip_and_order_deposit_policy_domain.php'
$MyIniPath = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\my.ini'
$ExpectedDataDir = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\data'
$ExpectedErrorLog = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\logs\mysql-error.log'
$ResetRoot = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\password-reset'
$BackupRoot = 'C:\VietTrungBackups'
$DatabaseBackup = 'C:\VietTrungBackups\logistics_system_before_vip051_20261125_235915.sql'
$ExpectedDatabaseBackupSize = 443463L
$ExpectedDatabaseBackupSha256 = '2C0BFEEA6FD7EB88CB5E1D1F0B6E01F3A242F44AD7F74536F57E5A4AD79F5098'
$TargetHost = '127.0.0.1'
$TargetPort = 3310
$TargetAccount = 'viettrung_dba@127.0.0.1'
$ConfirmationText = 'RESET-VIETTRUNG-DBA-ON-3310'

$plainPassword = $null
$confirmPlainPassword = $null
$initFilePath = $null
$backupDirectory = $null
$originalConfigBackup = $null
$originalConfigAclBackup = $null
$originalConfigAcl = $null
$originalConfigHash = $null
$stagedConfigHash = $null
$downtimeApproved = $false
$configWriteStarted = $false
$serviceActionStarted = $false
$serviceStartedWithInit = $false

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-ExactPath([string]$Path, [string]$Description) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Description does not exist: $Path"
    }
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this script from an elevated 64-bit PowerShell window.'
    }
}

function ConvertTo-NativeArgument([AllowEmptyString()][string]$Argument) {
    if ($null -eq $Argument -or $Argument.Length -eq 0) { return '""' }
    if ($Argument -notmatch '[\s"]') { return $Argument }

    $builder = New-Object Text.StringBuilder
    [void]$builder.Append('"')
    $backslashes = 0
    foreach ($character in $Argument.ToCharArray()) {
        if ($character -eq '\') {
            $backslashes++
            continue
        }
        if ($character -eq '"') {
            [void]$builder.Append(('\' * (($backslashes * 2) + 1)))
            [void]$builder.Append('"')
            $backslashes = 0
            continue
        }
        if ($backslashes -gt 0) {
            [void]$builder.Append(('\' * $backslashes))
            $backslashes = 0
        }
        [void]$builder.Append($character)
    }
    if ($backslashes -gt 0) {
        [void]$builder.Append(('\' * ($backslashes * 2)))
    }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Invoke-NativeProcess {
    param(
        [Parameter(Mandatory=$true)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory = '',
        [hashtable]$Environment = @{}
    )

    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $FilePath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
    if ($WorkingDirectory) { $startInfo.WorkingDirectory = $WorkingDirectory }
    foreach ($name in $Environment.Keys) {
        $startInfo.EnvironmentVariables[$name] = [string]$Environment[$name]
    }

    $process = New-Object Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw "Failed to start native process: $FilePath" }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $stdout = $stdoutTask.Result
        $stderr = $stderrTask.Result
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            StdOut = $stdout
            StdErr = $stderr
        }
    }
    finally {
        $process.Dispose()
    }
}

function Format-NativeFailure([string]$Operation, $Result) {
    $stdout = if ([string]::IsNullOrWhiteSpace($Result.StdOut)) { '<empty>' } else { $Result.StdOut.Trim() }
    $stderr = if ([string]::IsNullOrWhiteSpace($Result.StdErr)) { '<empty>' } else { $Result.StdErr.Trim() }
    return "$Operation failed with exit code $($Result.ExitCode). STDOUT: $stdout STDERR: $stderr"
}

function Write-NativeWarning([string]$Operation, $Result) {
    if (-not [string]::IsNullOrWhiteSpace($Result.StdErr)) {
        Write-Warning "$Operation completed with exit code 0 and STDERR output: $($Result.StdErr.Trim())"
    }
}

function Assert-ValidateConfigResult($Result, [switch]$SuppressWarning) {
    if ($Result.ExitCode -ne 0) {
        throw (Format-NativeFailure 'mysqld --validate-config' $Result)
    }
    if (-not $SuppressWarning) {
        Write-NativeWarning 'mysqld --validate-config' $Result
    }
}

function Get-PlainText([Security.SecureString]$SecureValue) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Wait-ServiceState([string]$Name, [string]$DesiredState, [int]$TimeoutSeconds = 90) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $service = Get-Service -Name $Name
        if ($service.Status.ToString() -eq $DesiredState) {
            return
        }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)

    throw "Service $Name did not reach state $DesiredState within $TimeoutSeconds seconds."
}

function Wait-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutSeconds = 90) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $client = New-Object Net.Sockets.TcpClient
        try {
            $task = $client.ConnectAsync($HostName, $Port)
            if ($task.Wait(1000) -and $client.Connected) {
                return
            }
        }
        catch {
            # The server can legitimately refuse connections while starting.
        }
        finally {
            $client.Dispose()
        }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)

    throw "TCP $HostName`:$Port was not reachable within $TimeoutSeconds seconds."
}

function Set-RestrictedDirectoryAcl([string]$Path) {
    $administrators = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
    $system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
    $serviceAccount = New-Object Security.Principal.NTAccount('NT SERVICE', $ServiceName)

    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($administrators)
    $inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    $propagation = [Security.AccessControl.PropagationFlags]::None
    $allow = [Security.AccessControl.AccessControlType]::Allow
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($administrators, 'FullControl', $inheritance, $propagation, $allow))
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($system, 'FullControl', $inheritance, $propagation, $allow))
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($serviceAccount, 'ReadAndExecute', $inheritance, $propagation, $allow))
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Set-RestrictedFileAcl([string]$Path) {
    $administrators = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
    $system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
    $serviceAccount = New-Object Security.Principal.NTAccount('NT SERVICE', $ServiceName)

    $acl = New-Object Security.AccessControl.FileSecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($administrators)
    $allow = [Security.AccessControl.AccessControlType]::Allow
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($administrators, 'FullControl', $allow))
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($system, 'FullControl', $allow))
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($serviceAccount, 'ReadAndExecute', $allow))
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Get-ByteArraySha256([byte[]]$Bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '')
    }
    finally {
        $sha.Dispose()
    }
}

function Write-ConfigWithExpectedHash([string]$SourcePath, [string]$ExpectedCurrentHash) {
    $replacementBytes = [IO.File]::ReadAllBytes($SourcePath)
    $stream = [IO.File]::Open($MyIniPath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $currentBytes = $null
    $writeBegan = $false
    try {
        $currentBytes = [byte[]]::new([int]$stream.Length)
        $offset = 0
        while ($offset -lt $currentBytes.Length) {
            $read = $stream.Read($currentBytes, $offset, $currentBytes.Length - $offset)
            if ($read -le 0) { throw 'Unexpected end of my.ini while holding the exclusive lock.' }
            $offset += $read
        }

        $lockedHash = Get-ByteArraySha256 -Bytes $currentBytes
        if ($lockedHash -ne $ExpectedCurrentHash) {
            throw "my.ini changed concurrently (expected $ExpectedCurrentHash, found $lockedHash). No bytes were written."
        }

        # From this point, a failed write requires recovery.
        $script:configWriteStarted = $true
        $writeBegan = $true
        $stream.Position = 0
        $stream.SetLength(0)
        $stream.Write($replacementBytes, 0, $replacementBytes.Length)
        $stream.Flush($true)

        $stream.Position = 0
        $verificationBytes = [byte[]]::new([int]$stream.Length)
        $offset = 0
        while ($offset -lt $verificationBytes.Length) {
            $read = $stream.Read($verificationBytes, $offset, $verificationBytes.Length - $offset)
            if ($read -le 0) { throw 'Unexpected end of my.ini during locked write verification.' }
            $offset += $read
        }
        if ((Get-ByteArraySha256 -Bytes $verificationBytes) -ne (Get-ByteArraySha256 -Bytes $replacementBytes)) {
            throw 'my.ini locked write verification failed.'
        }
    }
    catch {
        $writeFailure = $_.Exception
        if ($writeBegan -and $currentBytes) {
            try {
                $stream.Position = 0
                $stream.SetLength(0)
                $stream.Write($currentBytes, 0, $currentBytes.Length)
                $stream.Flush($true)
                $script:configWriteStarted = $false
            }
            catch {
                # Leave configWriteStarted true. Outer recovery will inspect hashes
                # and will not overwrite an unknown concurrent/partial state.
            }
        }
        throw $writeFailure
    }
    finally {
        $stream.Dispose()
    }

    $expectedWrittenHash = Get-ByteArraySha256 -Bytes $replacementBytes
    return $expectedWrittenHash
}

function Get-ConfigRecoveryAction([string]$CurrentHash, [string]$OriginalHash, [string]$StagedHash) {
    if ($CurrentHash -eq $OriginalHash) { return 'None' }
    if ($CurrentHash -eq $StagedHash) { return 'Restore' }
    return 'Refuse'
}

function Test-RecoveryRequired([bool]$ConfigWrite, [bool]$ServiceAction, [bool]$StartedWithInit) {
    return ($ConfigWrite -or $ServiceAction -or $StartedWithInit)
}

function ConvertFrom-DbaVerificationRow([string]$Row, [string]$ExpectedInitFile) {
    $fields = $Row.Split([char]9)
    if ($fields.Count -ne 4) {
        throw "Expected four tab-separated DBA verification fields; received $($fields.Count)."
    }
    if ($fields[0] -cne 'viettrung_dba@127.0.0.1') {
        throw "Unexpected authenticated account: $($fields[0])"
    }
    $actualPort = 0
    if (-not [int]::TryParse($fields[1], [ref]$actualPort) -or $actualPort -ne $TargetPort) {
        throw "Unexpected MySQL port: $($fields[1])"
    }
    if ($fields[2] -notlike '8.4.3*') {
        throw "Unexpected MySQL version: $($fields[2])"
    }

    $actualInitFile = if ($fields[3] -ceq '<EMPTY>') { '' } else { $fields[3].Replace('\', '/').Trim('"') }
    $normalizedExpected = $ExpectedInitFile.Replace('\', '/').Trim('"')
    if (-not [string]::Equals($actualInitFile, $normalizedExpected, [StringComparison]::OrdinalIgnoreCase)) {
        $actualLabel = if ($actualInitFile) { '<configured>' } else { '<empty>' }
        $expectedLabel = if ($normalizedExpected) { '<configured>' } else { '<empty>' }
        throw "Unexpected init_file state: expected $expectedLabel, got $actualLabel."
    }

    return [pscustomobject]@{
        Account = $fields[0]
        Port = $actualPort
        Version = $fields[2]
        InitFile = $actualInitFile
    }
}

function Invoke-SelfTest {
    $cases = @(
        @{ Name='approval only'; Actual=(Test-RecoveryRequired $false $false $false); Expected=$false },
        @{ Name='checksum failure before write'; Actual=(Test-RecoveryRequired $false $false $false); Expected=$false },
        @{ Name='config write started'; Actual=(Test-RecoveryRequired $true $false $false); Expected=$true },
        @{ Name='service action started'; Actual=(Test-RecoveryRequired $false $true $false); Expected=$true },
        @{ Name='server started with init'; Actual=(Test-RecoveryRequired $false $false $true); Expected=$true },
        @{ Name='original hash'; Actual=(Get-ConfigRecoveryAction 'ORIGINAL' 'ORIGINAL' 'STAGED'); Expected='None' },
        @{ Name='known staged hash'; Actual=(Get-ConfigRecoveryAction 'STAGED' 'ORIGINAL' 'STAGED'); Expected='Restore' },
        @{ Name='unknown concurrent hash'; Actual=(Get-ConfigRecoveryAction 'OTHER' 'ORIGINAL' 'STAGED'); Expected='Refuse' }
    )

    foreach ($case in $cases) {
        if ($case.Actual -cne $case.Expected) {
            throw "Self-test failed: $($case.Name). Expected $($case.Expected), got $($case.Actual)."
        }
        Write-Host "PASS: $($case.Name)"
    }
    $configured = ConvertFrom-DbaVerificationRow "viettrung_dba@127.0.0.1`t3310`t8.4.3`tC:/secure/reset.sql" 'C:\secure\reset.sql'
    if ($configured.Account -cne 'viettrung_dba@127.0.0.1' -or $configured.Port -ne 3310 -or -not $configured.InitFile) {
        throw 'Self-test failed: exact configured init_file DBA row parsing.'
    }
    Write-Host 'PASS: exact configured init_file DBA row parsing'

    $empty = ConvertFrom-DbaVerificationRow "viettrung_dba@127.0.0.1`t3310`t8.4.3`t<EMPTY>" ''
    if ($empty.InitFile -cne '') { throw 'Self-test failed: exact empty init_file DBA row parsing.' }
    Write-Host 'PASS: exact empty init_file DBA row parsing'

    foreach ($invalidRow in @(
        "wrong_user@127.0.0.1`t3310`t8.4.3`t<EMPTY>",
        "viettrung_dba@127.0.0.1`t3306`t8.4.3`t<EMPTY>",
        "viettrung_dba@127.0.0.1`t3310`t8.4.3"
    )) {
        $rejected = $false
        try { [void](ConvertFrom-DbaVerificationRow $invalidRow '') } catch { $rejected = $true }
        if (-not $rejected) { throw "Self-test failed: invalid DBA row was accepted: $invalidRow" }
    }
    Write-Host 'PASS: malformed/wrong-account/wrong-port DBA rows rejected'

    $powerShellExe = [Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    $warningResult = Invoke-NativeProcess -FilePath $powerShellExe -Arguments @(
        '-NoProfile', '-NonInteractive', '-Command',
        "[Console]::Out.WriteLine('validation stdout'); [Console]::Error.WriteLine('[Warning] [MY-011070] binlog_format is deprecated'); exit 0"
    )
    Assert-ValidateConfigResult $warningResult -SuppressWarning
    if ($warningResult.ExitCode -ne 0 -or
        $warningResult.StdOut.Trim() -cne 'validation stdout' -or
        $warningResult.StdErr -notmatch 'MY-011070') {
        throw 'Self-test failed: exit-code-0 stderr warning handling.'
    }
    Write-Host 'PASS: native stderr warning with exit code 0 accepted'

    $errorResult = Invoke-NativeProcess -FilePath $powerShellExe -Arguments @(
        '-NoProfile', '-NonInteractive', '-Command',
        "[Console]::Out.WriteLine('validation stdout'); [Console]::Error.WriteLine('real config error'); exit 7"
    )
    $errorRejected = $false
    try {
        Assert-ValidateConfigResult $errorResult -SuppressWarning
    }
    catch {
        $errorRejected = ($_.Exception.Message -match 'exit code 7' -and $_.Exception.Message -match 'real config error')
    }
    if (-not $errorRejected) { throw 'Self-test failed: nonzero validate-config result was not fully reported.' }
    Write-Host 'PASS: native stderr error with nonzero exit code rejected and reported'

    Write-Host 'SELF_TEST=PASS (no production files, services, ports, or databases were accessed).' -ForegroundColor Green
}

function Test-DbaLogin([string]$Password, [string]$ExpectedInitFile) {
    $query = "SELECT CURRENT_USER(), @@port, @@version, IF(COALESCE(@@global.init_file, '') = '', '<EMPTY>', @@global.init_file);"
    $result = Invoke-NativeProcess -FilePath $MySqlClientExe -Arguments @(
        '--protocol=TCP',
        "--host=$TargetHost",
        "--port=$TargetPort",
        '--user=viettrung_dba',
        '--connect-timeout=10',
        '--batch', '--silent', '--raw', '--skip-column-names',
        "--execute=$query"
    ) -Environment @{ MYSQL_PWD = $Password }

    if ($result.ExitCode -ne 0) {
        throw (Format-NativeFailure 'DBA login test' $result)
    }
    Write-NativeWarning 'DBA login test' $result

    $rows = @($result.StdOut -split "`r?`n" | Where-Object { $_ -ne '' })
    if ($rows.Count -ne 1) {
        throw "Expected exactly one DBA verification row; received $($rows.Count)."
    }
    $verification = ConvertFrom-DbaVerificationRow -Row $rows[0] -ExpectedInitFile $ExpectedInitFile
    $initLabel = if ($verification.InitFile) { 'configured' } else { 'empty' }
    Write-Host "DBA login verified: account=$($verification.Account); port=$($verification.Port); version=$($verification.Version); init_file=$initLabel"
}

function Test-LaravelApplicationConnection {
    Assert-ExactPath $LaravelArtisan 'Laravel artisan entry point'
    $envPath = Join-Path $LaravelBackend '.env'
    Assert-ExactPath $envPath 'Laravel environment file'
    $expected = @{
        DB_HOST = '127.0.0.1'
        DB_PORT = '3310'
        DB_DATABASE = 'logistics_system'
        DB_USERNAME = 'viettrung_app'
    }
    $actual = @{}
    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ($line -match '^(DB_HOST|DB_PORT|DB_DATABASE|DB_USERNAME)=(.*)$') {
            $actual[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    foreach ($key in $expected.Keys) {
        if (-not $actual.ContainsKey($key) -or $actual[$key] -cne $expected[$key]) {
            throw "Laravel $key does not match the reviewed production application connection."
        }
    }

    $php = (Get-Command php -ErrorAction Stop).Source
    Push-Location $LaravelBackend
    try {
        $probeCode = @'
require 'C:/laragon/www/extention/logistics-backend/vendor/autoload.php';
$app = require 'C:/laragon/www/extention/logistics-backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$row = Illuminate\Support\Facades\DB::selectOne("SELECT CURRENT_USER() AS db_user, @@port AS db_port, DATABASE() AS db_name");
echo $row->db_user, "\t", $row->db_port, "\t", $row->db_name;
'@
        $probeResult = Invoke-NativeProcess -FilePath $php -Arguments @('-r', $probeCode) -WorkingDirectory $LaravelBackend
        if ($probeResult.ExitCode -ne 0) {
            throw (Format-NativeFailure 'Laravel application identity probe' $probeResult)
        }
        Write-NativeWarning 'Laravel application identity probe' $probeResult
        $probeRows = @($probeResult.StdOut -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
        if ($probeRows.Count -ne 1) { throw "Expected one Laravel identity row; received $($probeRows.Count)." }
        $probeFields = $probeRows[0].Split([char]9)
        if ($probeFields.Count -ne 3 -or
            $probeFields[0] -cne 'viettrung_app@127.0.0.1' -or
            $probeFields[1] -cne '3310' -or
            $probeFields[2] -cne 'logistics_system') {
            throw 'Laravel runtime did not authenticate as viettrung_app@127.0.0.1 on 3310/logistics_system.'
        }

        $statusResult = Invoke-NativeProcess -FilePath $php -Arguments @(
            'artisan', 'migrate:status', "--path=$VipMigrationRelativePath", '--no-ansi'
        ) -WorkingDirectory $LaravelBackend
        if ($statusResult.ExitCode -ne 0) {
            throw (Format-NativeFailure 'Laravel scoped migration status' $statusResult)
        }
        Write-NativeWarning 'Laravel scoped migration status' $statusResult
        if ($statusResult.StdOut -notmatch '2026_11_25_000051_create_vip_and_order_deposit_policy_domain') {
            throw 'Laravel connected, but the scoped migration status row was not returned.'
        }
        Write-Host 'Laravel viettrung_app read-only connection and scoped migration-status check: PASS'
    }
    finally {
        Pop-Location
    }
}

function Restore-OriginalConfigAndService {
    Write-Warning 'Recovery path entered because a production config/service action had started.'
    $currentHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $MyIniPath).Hash
    $action = Get-ConfigRecoveryAction -CurrentHash $currentHash -OriginalHash $originalConfigHash -StagedHash $stagedConfigHash
    if ($action -eq 'Refuse') {
        throw "my.ini has an unknown concurrent hash ($currentHash). Automatic recovery refuses to overwrite it."
    }
    if ($action -eq 'Restore') {
        [void](Write-ConfigWithExpectedHash -SourcePath $originalConfigBackup -ExpectedCurrentHash $stagedConfigHash)
    }
    $script:configWriteStarted = $false

    $service = Get-Service -Name $ServiceName
    if ($service.Status -eq 'StopPending') {
        Wait-ServiceState -Name $ServiceName -DesiredState 'Stopped'
        $service = Get-Service -Name $ServiceName
    }
    elseif ($service.Status -eq 'StartPending') {
        Wait-ServiceState -Name $ServiceName -DesiredState 'Running'
        $service = Get-Service -Name $ServiceName
    }

    if ($service.Status -eq 'Stopped') {
        Start-Service -Name $ServiceName
        Wait-ServiceState -Name $ServiceName -DesiredState 'Running'
    }
    elseif ($service.Status -eq 'Running' -and $serviceStartedWithInit) {
        Stop-Service -Name $ServiceName -Force
        Wait-ServiceState -Name $ServiceName -DesiredState 'Stopped'
        Start-Service -Name $ServiceName
        Wait-ServiceState -Name $ServiceName -DesiredState 'Running'
    }
    elseif ($service.Status -ne 'Running') {
        throw "Cannot safely recover service from state $($service.Status)."
    }

    Wait-TcpPort -HostName $TargetHost -Port $TargetPort
    $script:serviceStartedWithInit = $false
    $script:serviceActionStarted = $false
    Test-LaravelApplicationConnection
}

if ($SelfTest) {
    Invoke-SelfTest
    return
}

Assert-Administrator

try {
    Write-Step 'Validating immutable paths and executable version'
    Assert-ExactPath $MySqlServerExe 'MySQL server executable'
    Assert-ExactPath $MySqlClientExe 'MySQL client executable'
    Assert-ExactPath $MyIniPath 'MySQL option file'
    Assert-ExactPath $ExpectedDataDir 'MySQL data directory'
    Assert-ExactPath $ExpectedErrorLog 'MySQL error log'
    Assert-ExactPath $DatabaseBackup 'Production database backup'

    $versionResult = Invoke-NativeProcess -FilePath $MySqlServerExe -Arguments @('--version')
    if ($versionResult.ExitCode -ne 0) {
        throw (Format-NativeFailure 'mysqld --version' $versionResult)
    }
    Write-NativeWarning 'mysqld --version' $versionResult
    $versionOutput = $versionResult.StdOut.Trim()
    if ($versionOutput -notmatch 'Ver 8\.4\.3') { throw "Unexpected mysqld version: $versionOutput" }
    Write-Host $versionOutput

    Write-Step 'Validating service identity, command line, state, and listener'
    $serviceCim = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
    if (-not $serviceCim) { throw "Service $ServiceName was not found." }
    if ($serviceCim.State -ne 'Running') { throw "Service is not running: $($serviceCim.State)" }
    if ($serviceCim.StartName -ne $ExpectedServiceIdentity) { throw "Unexpected service identity: $($serviceCim.StartName)" }
    if ($serviceCim.PathName -notlike "*$MySqlServerExe*") { throw "Service does not use the expected mysqld.exe." }
    if ($serviceCim.PathName -notlike "*--defaults-file=$MyIniPath*") { throw "Service does not use the expected my.ini." }

    $listener = Get-NetTCPConnection -LocalPort $TargetPort -State Listen | Select-Object -First 1
    if (-not $listener -or $listener.LocalAddress -ne $TargetHost) { throw "Expected listener $TargetHost`:$TargetPort was not found." }
    $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if (-not $listenerProcess -or [uint32]$listenerProcess.ParentProcessId -ne [uint32]$serviceCim.ProcessId) {
        throw "Port $TargetPort is not owned by the mysqld child of $ServiceName."
    }

    Write-Step 'Validating my.ini and the protected database backup'
    $configText = [IO.File]::ReadAllText($MyIniPath)
    $mysqldSections = [regex]::Matches($configText, '(?im)^\s*\[mysqld\]\s*$')
    if ($mysqldSections.Count -ne 1) { throw "Expected exactly one [mysqld] section; found $($mysqldSections.Count)." }
    if ($configText -match '(?im)^\s*(?:loose-)?init[-_]file\s*=') { throw 'my.ini already contains an init-file setting.' }
    if ($configText -notmatch '(?im)^\s*datadir\s*=\s*C:/ProgramData/VietTrungOrder/MySQL/8\.4/data\s*$') { throw 'Unexpected datadir in my.ini.' }
    if ($configText -notmatch '(?im)^\s*port\s*=\s*3310\s*$') { throw 'Expected port 3310 was not found in my.ini.' }
    if ($configText -notmatch '(?im)^\s*bind-address\s*=\s*127\.0\.0\.1\s*$') { throw 'Expected loopback bind-address was not found in my.ini.' }
    if ($configText -match '(?im)^\s*general[-_]log\s*=\s*(?:1|ON|TRUE)\s*$') { throw 'general_log is enabled in my.ini; refusing to place a password statement in init_file.' }
    if ($configText -match '(?im)^\s*log[-_]raw\s*=\s*(?:1|ON|TRUE)\s*$') { throw 'log_raw is enabled in my.ini; refusing to place a password statement in init_file.' }

    $databaseBackupItem = Get-Item -LiteralPath $DatabaseBackup
    $databaseBackupHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $DatabaseBackup).Hash
    if ($databaseBackupItem.Length -ne $ExpectedDatabaseBackupSize -or $databaseBackupHash -ne $ExpectedDatabaseBackupSha256) {
        throw 'The existing production backup does not match its reviewed size/checksum.'
    }
    Write-Host "Backup verified: $DatabaseBackup"
    Write-Host "Size: $($databaseBackupItem.Length) bytes; SHA-256: $databaseBackupHash"
    Write-Warning 'The backup has passed checksum/content checks but has not been test-restored into an isolated MySQL instance.'

    Write-Step 'Backing up my.ini, ACL, and Windows service configuration'
    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backupDirectory = Join-Path $BackupRoot "mysql-dba-reset-$timestamp"
    New-Item -ItemType Directory -Path $backupDirectory | Out-Null
    $originalConfigBackup = Join-Path $backupDirectory 'my.ini.before-reset'
    $originalConfigAclBackup = Join-Path $backupDirectory 'my.ini.acl.xml'
    Copy-Item -LiteralPath $MyIniPath -Destination $originalConfigBackup
    $originalConfigAcl = Get-Acl -LiteralPath $MyIniPath
    $originalConfigAcl | Export-Clixml -LiteralPath $originalConfigAclBackup
    $originalConfigHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $MyIniPath).Hash
    $scQc = Invoke-NativeProcess -FilePath $ScExe -Arguments @('qc', $ServiceName)
    if ($scQc.ExitCode -ne 0) { throw (Format-NativeFailure 'sc.exe qc' $scQc) }
    Write-NativeWarning 'sc.exe qc' $scQc
    $scQc.StdOut | Set-Content -LiteralPath (Join-Path $backupDirectory 'service-qc.txt') -Encoding UTF8
    $scQuery = Invoke-NativeProcess -FilePath $ScExe -Arguments @('queryex', $ServiceName)
    if ($scQuery.ExitCode -ne 0) { throw (Format-NativeFailure 'sc.exe queryex' $scQuery) }
    Write-NativeWarning 'sc.exe queryex' $scQuery
    $scQuery.StdOut | Set-Content -LiteralPath (Join-Path $backupDirectory 'service-queryex.txt') -Encoding UTF8
    $serviceCim | Select-Object Name, State, StartMode, StartName, PathName, ProcessId |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupDirectory 'service-cim.json') -Encoding UTF8
    $regExport = Invoke-NativeProcess -FilePath $RegExe -Arguments @(
        'export', "HKLM\SYSTEM\CurrentControlSet\Services\$ServiceName", (Join-Path $backupDirectory 'service.reg'), '/y'
    )
    if ($regExport.ExitCode -ne 0) { throw (Format-NativeFailure 'reg.exe export' $regExport) }
    Write-NativeWarning 'reg.exe export' $regExport
    Write-Host "Configuration backup: $backupDirectory"
    Write-Host "Original my.ini SHA-256: $originalConfigHash"

    Write-Step 'Reading and validating the new password securely'
    $securePassword = Read-Host 'Enter the NEW password for viettrung_dba@127.0.0.1' -AsSecureString
    $secureConfirmation = Read-Host 'Enter the NEW password again' -AsSecureString
    $plainPassword = Get-PlainText $securePassword
    $confirmPlainPassword = Get-PlainText $secureConfirmation
    $securePassword.Dispose()
    $secureConfirmation.Dispose()

    if (-not [string]::Equals($plainPassword, $confirmPlainPassword, [StringComparison]::Ordinal)) {
        throw 'The two password entries do not match.'
    }
    if ($plainPassword.Length -lt 16) {
        throw 'Use a password of at least 16 characters.'
    }
    if ($plainPassword.ToCharArray() | Where-Object { [char]::IsControl($_) }) {
        throw 'Control characters are not permitted in the password.'
    }
    $confirmPlainPassword = $null

    Write-Step 'Creating the restricted init file and staged my.ini'
    if (-not (Test-Path -LiteralPath $ResetRoot)) {
        New-Item -ItemType Directory -Path $ResetRoot | Out-Null
    }
    Set-RestrictedDirectoryAcl -Path $ResetRoot

    $initFilePath = Join-Path $ResetRoot ("reset-viettrung-dba-$([Guid]::NewGuid().ToString('N')).sql")
    $escapedPassword = $plainPassword.Replace('\', '\\').Replace("'", "''")
    $passwordStatement = "SET SESSION sql_log_bin=0;`r`nSET PASSWORD FOR 'viettrung_dba'@'127.0.0.1' = '$escapedPassword';"
    [IO.File]::WriteAllText($initFilePath, $passwordStatement + "`r`n", (New-Object Text.UTF8Encoding($false)))
    Set-RestrictedFileAcl -Path $initFilePath
    $passwordStatement = $null
    $escapedPassword = $null

    $initFileOptionPath = $initFilePath.Replace('\', '/')
    $newline = if ($configText.Contains("`r`n")) { "`r`n" } else { "`n" }
    $mysqldMatch = $mysqldSections[0]
    $stagedConfigText = $configText.Insert($mysqldMatch.Index + $mysqldMatch.Length, "$newline" + "init-file=$initFileOptionPath")
    $stagedConfig = Join-Path $backupDirectory 'my.ini.with-init-file.staged'
    [IO.File]::WriteAllText($stagedConfig, $stagedConfigText, (New-Object Text.UTF8Encoding($false)))
    $stagedConfigHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $stagedConfig).Hash

    $validateResult = Invoke-NativeProcess -FilePath $MySqlServerExe -Arguments @(
        "--defaults-file=$stagedConfig", '--validate-config'
    )
    Assert-ValidateConfigResult $validateResult
    Write-Host 'Staged my.ini passed mysqld --validate-config.'
    Write-Host 'No production configuration or service state has been changed yet.' -ForegroundColor Green

    Write-Step 'Downtime authorization gate'
    Write-Host "This will stop and start ONLY service $ServiceName twice."
    Write-Host 'No migration will run. No application table will be modified.'
    $confirmation = Read-Host "Type exactly $ConfirmationText to approve the service interruption"
    if ($confirmation -cne $ConfirmationText) {
        Write-Host 'Downtime was not approved. Cleaning the temporary password file and exiting.' -ForegroundColor Yellow
        Remove-Item -LiteralPath $initFilePath -Force
        $initFilePath = $null
        return
    }
    $downtimeApproved = $true

    Write-Step 'Rechecking my.ini against the preflight hash'
    $currentConfigHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $MyIniPath).Hash
    if ($currentConfigHash -ne $originalConfigHash) {
        throw 'my.ini changed after preflight. Refusing to stop the service.'
    }

    Write-Step 'Installing the staged init-file reference and restarting the production service once'
    [void](Write-ConfigWithExpectedHash -SourcePath $stagedConfig -ExpectedCurrentHash $originalConfigHash)

    $serviceActionStarted = $true
    Stop-Service -Name $ServiceName
    Wait-ServiceState -Name $ServiceName -DesiredState 'Stopped'
    $serviceStartedWithInit = $true
    Start-Service -Name $ServiceName
    Wait-ServiceState -Name $ServiceName -DesiredState 'Running'
    Wait-TcpPort -HostName $TargetHost -Port $TargetPort
    $serviceActionStarted = $false

    Write-Step 'Testing the reset DBA login without displaying the password'
    Test-DbaLogin -Password $plainPassword -ExpectedInitFile $initFileOptionPath

    Write-Step 'Restoring the original startup configuration and deleting the init file'
    [void](Write-ConfigWithExpectedHash -SourcePath $originalConfigBackup -ExpectedCurrentHash $stagedConfigHash)
    $configWriteStarted = $false
    Remove-Item -LiteralPath $initFilePath -Force
    $initFilePath = $null

    $restoredHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $MyIniPath).Hash
    if ($restoredHash -ne $originalConfigHash) {
        throw 'Restored my.ini does not match the original SHA-256.'
    }

    Write-Step 'Restarting normally without init-file and testing the DBA login again'
    $serviceActionStarted = $true
    Stop-Service -Name $ServiceName
    Wait-ServiceState -Name $ServiceName -DesiredState 'Stopped'
    Start-Service -Name $ServiceName
    Wait-ServiceState -Name $ServiceName -DesiredState 'Running'
    Wait-TcpPort -HostName $TargetHost -Port $TargetPort
    $serviceStartedWithInit = $false
    $serviceActionStarted = $false
    Test-DbaLogin -Password $plainPassword -ExpectedInitFile ''
    Test-LaravelApplicationConnection

    Write-Host "`nSUCCESS: Password access for $TargetAccount was restored." -ForegroundColor Green
    Write-Host 'The original my.ini was restored, init-file is inactive, and the temporary SQL file was deleted.' -ForegroundColor Green
    Write-Host "Audit/backup directory: $backupDirectory"
    Write-Host 'Migration 051 was NOT executed.' -ForegroundColor Yellow
}
catch {
    $originalFailure = $_.Exception
    Write-Host "ERROR: $($originalFailure.Message)" -ForegroundColor Red
    Write-Host "STATE: downtimeApproved=$downtimeApproved; configWriteStarted=$configWriteStarted; serviceActionStarted=$serviceActionStarted; serviceStartedWithInit=$serviceStartedWithInit"
    $recoveryRequired = Test-RecoveryRequired -ConfigWrite $configWriteStarted -ServiceAction $serviceActionStarted -StartedWithInit $serviceStartedWithInit
    if ($recoveryRequired -and $originalConfigBackup -and (Test-Path -LiteralPath $originalConfigBackup)) {
        try {
            Restore-OriginalConfigAndService
            Write-Warning 'The original configuration was restored and the service is listening normally.'
        }
        catch {
            Write-Host "CRITICAL: automatic service recovery failed: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Restore manually from: $originalConfigBackup" -ForegroundColor Red
        }
    }
    else {
        Write-Warning 'No production config/service action had started; recovery and service restart were intentionally skipped.'
    }
    throw $originalFailure
}
finally {
    $plainPassword = $null
    $confirmPlainPassword = $null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()

    if (-not $configWriteStarted -and -not $serviceStartedWithInit -and $initFilePath -and (Test-Path -LiteralPath $initFilePath)) {
        try { Remove-Item -LiteralPath $initFilePath -Force } catch { Write-Warning "Could not delete temporary init file: $initFilePath" }
    }
}

