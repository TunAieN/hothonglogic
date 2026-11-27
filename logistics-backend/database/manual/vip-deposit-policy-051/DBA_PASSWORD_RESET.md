# Reset `viettrung_dba@127.0.0.1` with MySQL 8.4 `init_file`

## Scope

The companion PowerShell script resets only the password of the existing account `viettrung_dba@127.0.0.1`. It does not change `root`, `viettrung_app`, privileges, application tables, the data directory, authentication server configuration, Laragon MySQL, or migration state.

It uses `SET PASSWORD FOR ...` inside the startup init file. MySQL 8.4 passes this value to the authentication plugin already associated with the account, avoiding the implicit plugin selection performed by `ALTER USER ... IDENTIFIED BY` when no plugin is named.

## Reviewed production facts

- Windows service: `VietTrungMySQL84`, Running, delayed automatic start.
- Service identity: `NT SERVICE\VietTrungMySQL84`.
- Service command: MySQL 8.4.3 with `--defaults-file=C:\ProgramData\VietTrungOrder\MySQL\8.4\my.ini`.
- Listener: `127.0.0.1:3310`, owned by the service's `mysqld` child process.
- Data directory: `C:\ProgramData\VietTrungOrder\MySQL\8.4\data`, approximately 239 MB at review time.
- Error log most recent startup: normal InnoDB initialization followed by `ready for connections` on port 3310.
- `my.ini`: one `[mysqld]` group, no existing `init-file`, loopback binding, port 3310, expected data directory.
- Reviewed database backup: `C:\VietTrungBackups\logistics_system_before_vip051_20261125_235915.sql`, 443,463 bytes, SHA-256 `2C0BFEEA6FD7EB88CB5E1D1F0B6E01F3A242F44AD7F74536F57E5A4AD79F5098`.

The database backup has not been restored into an isolated MySQL instance. The script treats this as an explicit warning but verifies its exact size and checksum before offering the downtime confirmation.

## Review and execution

Script: `Reset-VietTrungDbaPassword.ps1`

Run it only from an elevated 64-bit PowerShell window after reviewing the complete source:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
& 'C:\laragon\www\extention\logistics-backend\database\manual\vip-deposit-policy-051\Reset-VietTrungDbaPassword.ps1'
```

The elevation requirement is enforced at runtime. The isolated self-test does not require elevation and performs no file, service, port, or database access:

```powershell
& 'C:\laragon\www\extention\logistics-backend\database\manual\vip-deposit-policy-051\Reset-VietTrungDbaPassword.ps1' -SelfTest
```

The script performs these phases:

1. Revalidates executable, service identity/path/state, listener ownership, config, data directory, and backup checksum.
2. Creates a timestamped backup directory under `C:\VietTrungBackups` containing the exact original `my.ini`, its ACL, service query output, CIM metadata, and exported service registry configuration.
3. Prompts twice with `Read-Host -AsSecureString` and rejects mismatch, fewer than 16 characters, or control characters.
4. Creates a restricted init SQL file containing a session-only `sql_log_bin=0` guard followed by the single password-reset statement. Its ACL permits only Administrators and SYSTEM full control, and `NT SERVICE\VietTrungMySQL84` read/execute.
5. Produces a staged `my.ini` with `init-file` directly under the single `[mysqld]` group and validates it with `mysqld --validate-config`.
6. Makes no production change until the operator types the exact downtime phrase displayed by the script.
7. Rechecks the production config hash, then opens `my.ini` with an exclusive file lock, rechecks the hash from that same handle, and only then writes and verifies the staged bytes while still holding the lock. A write failure attempts to restore the prior bytes before releasing the handle. This closes the check/write race and preserves the existing file ACL.
8. Restarts only `VietTrungMySQL84` and verifies four exact DBA fields: `CURRENT_USER()`, port, MySQL version, and the expected active `init_file` path.
9. Restores the original bytes only when the current hash is the known staged hash, removes the temporary SQL file, and restarts normally.
10. Confirms the exact DBA account/port/version again with `init_file` empty, then uses Laravel's scoped read-only `migrate:status` command to verify the existing `.env` still connects as `viettrung_app` to `127.0.0.1:3310/logistics_system`.

The password is never printed, included in a command line, written to Git, or placed in `my.ini`. During each automated DBA login check it is injected only into the child `mysql.exe` environment; the parent PowerShell process environment is not modified. The temporary init SQL necessarily contains the cleartext password while the official startup-reset mechanism runs. Its parent directory is already restricted before the secret is written, the file receives an explicit restricted ACL, and it is deleted after the original config is restored. PowerShell strings cannot be reliably zeroed in managed memory, so the script drops all plaintext references and forces garbage collection as defense in depth; this is not presented as guaranteed memory erasure.

All native programs are invoked through `System.Diagnostics.Process` with `UseShellExecute=false` and separate asynchronous stdout/stderr capture. Success is determined exclusively by the native `ExitCode`:

- exit code `0` is success even if MySQL writes a deprecation warning such as `MY-011070` to stderr;
- stderr from a successful process is surfaced as a warning, not converted into a PowerShell terminating error;
- a nonzero exit code stops the workflow and reports the exit code plus complete stdout and stderr;
- the DBA password is added only to the child `mysql.exe` environment and is never added to the parent PowerShell process environment.

This wrapper is used consistently for `mysqld`, `mysql.exe`, PHP/Laravel, `sc.exe`, and `reg.exe`. The production `binlog_format` option is not modified or removed.

## Failure behavior

- Downtime approval and production mutation are separate states. Approval alone never enables recovery.
- Any preflight or checksum failure before the exclusive config write skips recovery and never stops/restarts MySQL.
- Recovery is entered only after a config write or service action actually started, or after a server was started with the temporary init config.
- Recovery restores `my.ini` only when its hash is either the reviewed original hash or the exact staged hash created by this run. An unknown hash is treated as a concurrent external edit and is never overwritten automatically.
- If the config was temporarily written but the running service never loaded it, recovery restores the file without restarting a healthy service.
- If the service is stopped, or it successfully started with `init_file`, recovery restores known-safe config and performs only the restart required to return to a normal startup.
- Successful recovery also runs the Laravel `viettrung_app` read-only connectivity check.
- It never starts a second server instance, uses `skip-grant-tables`, initializes the data directory, edits grant tables directly, or runs migration `051`.
- If an unknown concurrent config hash or another recovery error is reported, the script refuses to overwrite it and prints the reviewed backup path for manual investigation.

Only after the script reports success should deployment return to the separate migration `051` preflight.

## Non-production simulation coverage

`-SelfTest` exercises only pure state/parser functions and reports PASS/FAIL without touching production. Covered cases include:

- downtime approval without mutation does not request recovery;
- checksum failure before config write does not request recovery;
- config write, service action, and init-start states do request recovery;
- original hash results in no write, the known staged hash permits restore, and an unknown concurrent hash is refused;
- exact DBA row parsing for configured and empty `init_file` states;
- malformed rows, the wrong account, and port 3306 are rejected.
- a native process that writes a simulated `MY-011070` warning to stderr and exits `0` is accepted;
- a native process that writes a simulated configuration error and exits nonzero is rejected with stdout, stderr, and exit code preserved.

The Laravel post-recovery probe was separately exercised read-only against the running service and verified `viettrung_app@127.0.0.1`, port 3310, database `logistics_system`, with migration `051` still Pending.
