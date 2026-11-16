$ErrorActionPreference = 'Stop'

$directory = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\secrets'
$marker = 'C:\ProgramData\VietTrungOrder\MySQL\8.4\secrets-acl.complete'
$operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path -LiteralPath $directory)) { throw 'Secrets directory is missing.' }
& icacls.exe $directory /inheritance:r /grant:r 'SYSTEM:(OI)(CI)(F)' 'BUILTIN\Administrators:(OI)(CI)(F)' "$operator`:(OI)(CI)(M)" | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Could not harden the secrets directory ACL.' }
"$(Get-Date -Format o) secrets ACL hardened" | Set-Content -LiteralPath $marker -Encoding utf8
