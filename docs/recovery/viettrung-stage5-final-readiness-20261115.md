# VietTrung Order Stage 5 final readiness report

Status: **STAGE A COMPLETE — NOT YET APPROVED OR READY FOR CUTOVER**

This report records read-only checks and isolated cleanup only. No production environment file, Windows Service, database token, business record, or application endpoint was changed.

## 1. Candidate cutover decision

The database contents are ready, but the operating environment is not yet ready for cutover.

Candidate identity verified through a live connection:

- MySQL 8.4.3
- endpoint `127.0.0.1:3309`
- database `logistics_system`
- datadir `C:\laragon\www\extention\.mysql-production-candidate-20261115\data\`
- UUID `35682ae5-e05b-11f1-9911-b44506abce66`
- binary log enabled with ROW/FULL
- 45 base tables and exactly 601 rows
- 86 foreign keys and zero orphan rows
- zero tables without a primary key
- zero active InnoDB transactions at the final check
- no application connection to the candidate at the final check

The backup checksum was revalidated:

`DAB9363E82FF7B3C90B1E878C47B1B0D13C65DBD8828C16F2405B79E6CEFE818`

Ten business tables covering customers, orders, invoices, and payments matched the source dump by exact INSERT-statement SHA-256 comparison. Required counts remain:

| Table | Rows |
|---|---:|
| customers | 10 |
| users | 11 |
| orders | 37 |
| order_items | 56 |
| payment_vouchers | 21 |
| payment_transactions | 18 |
| invoices | 13 |
| invoice_items | 17 |
| audit_logs | 96 |
| personal_access_tokens | 19 |

All four Customer Authentication tables are present and empty in the operational candidate. No Stage 4 smoke-test email or customer marker exists in `logistics_system`; smoke-test data remains isolated in the separate test database.

## 2. Proposed long-term MySQL location

Recommended paths outside the repository:

- config: `C:\ProgramData\VietTrungOrder\MySQL\8.4\my.ini`
- datadir: `C:\ProgramData\VietTrungOrder\MySQL\8.4\data\`
- logs/binlogs: `C:\ProgramData\VietTrungOrder\MySQL\8.4\logs\`
- secure-file directory: `C:\ProgramData\VietTrungOrder\MySQL\8.4\secure-files\`

Drive C currently has approximately 34.40 GB free; the candidate datadir is approximately 219 MB. Drive E has approximately 47.58 GB free and should remain a separate rescue/backup location rather than the only live-data and backup location.

Do not move the running datadir in place. The safer approved procedure is to preserve the existing candidate, initialize a clean long-term MySQL instance in `ProgramData`, import the verified 45-table dump, recreate/rotate scoped accounts, repeat all 45/601/86/orphan checks, then switch the service endpoint only after approval. The candidate remains an immutable fallback artifact.

## 3. Windows Service and DPAPI status

Not resolved yet:

- No MySQL/VietTrung Windows Service is registered.
- The candidate runs as a manually started process and will not automatically survive reboot.
- No service account ACL has been applied to the proposed `ProgramData` paths.
- Service recovery policy and startup ordering have not been configured or tested.

Recommended service identity: a dedicated service such as `VietTrungMySQL84`, running under a dedicated least-privilege account or the corresponding virtual service account. Grant that identity only the required filesystem rights to the production MySQL directories.

The existing DPAPI credential file decrypts for the current Windows user and is protected by a current-user ACL. It will not automatically decrypt for another service or scheduled-task account. MySQL itself does not require a database password to start as a Windows Service; therefore no password should be placed in `my.ini`. Production application, backup, and operator credentials must be rotated/provisioned separately under the identity that consumes them.

An additional blocker was discovered: Laragon started the original MySQL datadir on port 3306 at approximately `2026-11-15 02:08:52` local time. No established TCP connection to 3306 existed at the final check, but the original server was listening. It was not stopped or queried during Stage A. Laragon's MySQL auto-start behavior must be disabled or operationally separated before cutover so the damaged original cannot be mistaken for the production target.

## 4. Laravel configuration changes required

The current backend `.env` is development configuration and must not be used for production:

- `APP_ENV=local`
- `APP_DEBUG=true`
- `APP_URL` uses HTTP localhost
- database points to port 3306 using root with no password
- session and cache use local files
- queue is synchronous
- SMTP points to Mailpit
- no Laravel config cache currently exists

Approval-gated production changes:

1. Preserve the existing `APP_KEY` exactly; do not regenerate it.
2. Set `APP_ENV=production` and `APP_DEBUG=false`.
3. Set the approved HTTPS `APP_URL` and `CUSTOMER_WEB_URL`.
4. Set the verified production MySQL host/port/database and the restricted application account. Inject its password from an ACL-protected secret source outside Git.
5. Keep file sessions for the initial single-node cutover unless a separately designed Redis/database-session change is approved. The candidate has no `sessions` table, so switching to database sessions without schema work would fail.
6. Keep file cache initially or approve a separately provisioned shared cache. Do not select database cache because cache tables are absent.
7. Keep `QUEUE_CONNECTION=sync` only if synchronous execution is explicitly accepted. A database queue cannot be enabled because job infrastructure tables are absent.
8. Replace Mailpit with production SMTP, TLS, verified sender identity, and a controlled delivery test before Customer registration is opened.
9. Set secure cookie/domain/SameSite options for the final domain topology.
10. Clear and rebuild Laravel config cache only after the approved environment switch, then inspect effective values without printing passwords.

Admin Panel uses `VITE_API_BASE_URL`; Customer Web uses `VITE_CUSTOMER_API_URL`; the Chrome Extension uses its GraphQL endpoint. These clients do not connect directly to MySQL and must be pointed only to the verified Laravel backend.

## 5. Session, CSRF, CORS, and authentication status

Current session behavior:

- session driver: file
- HTTP-only cookie: enabled
- SameSite: `lax`
- secure-cookie setting is not enabled in the current local environment
- no `sessions` database table is present or required for the current driver

Customer Authentication routes use the web middleware group with encrypted cookies, file sessions, and CSRF validation. Stage 4 isolated HTTP testing passed 19/19, including CSRF, CustomerMe, password reset, session revocation, Admin/Customer guard isolation, and Admin bearer authentication.

Production CORS is unresolved. Current CORS paths cover only `api/*` and `graphql`, allow every origin, and set `supports_credentials=false`. They do not cover `sanctum/csrf-cookie` or `customer-auth/*`.

Before cutover, choose and verify one topology:

- Preferred: same-origin/reverse-proxy Customer Web and auth endpoints, avoiding cross-origin session cookies.
- If separate origins are mandatory: use explicit allowed origins, include the Sanctum and Customer Auth paths, enable credentialed requests, set `SANCTUM_STATEFUL_DOMAINS`, select the correct cookie domain, and require HTTPS. Use SameSite `none` only when truly cross-site and only with Secure cookies.

Admin readiness:

- 10 of 11 Admin users are active.
- all 11 Admin users have non-empty password hashes.
- Admin login and authenticated GraphQL principal passed in the isolated test database.
- Login against the operational candidate was deliberately not attempted because it creates a new Personal Access Token.

Customer readiness:

- the operational candidate has zero Customer Accounts, by design.
- registration, verification, login, CustomerMe, logout, and reset passed in the isolated test database.
- existing business customers do not automatically have portal credentials; they must register or go through the explicit link-review process after launch.

## 6. Security status and token policy

- Runtime application account has only SELECT/INSERT/UPDATE/DELETE on `logistics_system`; it has no DROP/ALTER privilege.
- Migration and backup accounts are separate and database-scoped.
- Test runner is denied access to `logistics_system` and has rights only on the isolated Auth test database.
- Database Safety Guard source and unit test remain present; its prior isolated test result was 5/5 PASS.
- No generated candidate credential was found in tracked Git files.
- No PHPUnit or destructive migration command was run against the operational candidate.

The 19 restored Admin Personal Access Tokens are all non-expiring; one has never been used. No token was changed or deleted during Stage A.

Recommended approved action immediately before reopening:

1. revoke all 19 restored tokens;
2. require Admin Panel and Extension users to log in again;
3. issue replacement tokens with explicit expiry and scoped abilities;
4. record revocation time and monitor rejected old bearer tokens.

## 7. Temporary business restrictions

The six order CNY discrepancies, three invoice VND discrepancies, and one unmatched CN package remain uncorrected and are not accounting-approved.

Until business/accounting sign-off, keep read-only views available but block or tightly permission these mutations:

- `createOrder`, `updateOrder`, `deleteOrder`, `confirmOrderDepositPayment`;
- `createPaymentVoucher`, `createDepositPaymentVoucher`, `cancelPaymentVoucher`, `confirmPaymentTransaction`, `issuePaymentVoucherInvoice`;
- exchange-rate and shipping-rate mutations that can change downstream financial calculations;
- CN package update/delete/item-confirmation for the unmatched workflow;
- Vietnam warehouse discrepancy-resolution and receipt-confirmation writes that could lock in package/financial state.

Do not use a real order, payment, invoice, or warehouse receipt as a cutover smoke test. Any approved production write test must be non-financial, uniquely tagged, and reversible.

## 8. Writer lock plan

At the final cutover gate, maintenance mode is only one layer. Apply all of the following:

1. block public POST/PUT/PATCH/DELETE and GraphQL mutations at the proxy/API layer;
2. stop Laravel API processes that can write, queue/Horizon workers, scheduler, webhook/payment callbacks, scanners, imports, and background scripts;
3. disable Admin and Extension write access;
4. stop or isolate the old 3306 server after explicit approval and prevent Laragon from restarting it;
5. verify OS TCP sessions, MySQL processlist, active InnoDB transactions, and binlog coordinates;
6. keep the target application account disabled or without traffic until connection identity is verified;
7. reopen writers only after UUID/datadir/database/user checks and read-only smoke tests pass.

No matching Laravel/MySQL Scheduled Task was found. The repository scheduler has no active scheduled job and the only repository script is an Extension validator. Deployment-host services, external webhook systems, scanners, and scripts still require an operator sign-off because absence from this repository does not prove they do not exist elsewhere.

## 9. Final backup and rollback plan

Before any connection switch:

1. stop all writers and record local/UTC time;
2. create a consistent MySQL 8.4 logical dump with routines, triggers, events, hex blobs, and GTID purge disabled;
3. record size, SHA-256, server UUID, and binary-log file/position;
4. restore that dump into a disposable database/instance and repeat counts/FK/orphan validation;
5. after a clean shutdown, take a physical copy of the approved long-term datadir if the operator requires a physical rollback artifact;
6. retain the original 3306 datadir, recovery 3308, candidate 3309, source dumps, binlogs, and all manifests.

Operational backup proposal:

- nightly encrypted logical backup copied off the live-data volume;
- binlog archival more frequently than the acceptable data-loss window;
- 14 daily, 8 weekly, and 12 monthly restore points, subject to the business retention policy;
- automated checksum/age monitoring;
- scheduled restore drills to an isolated MySQL instance, with 45/601/FK/orphan checks for the baseline and application smoke tests.

Rollback after production writes must first stop writers, capture a new dump and binlog coordinates, and inventory new registrations/orders/payments/warehouse events. Never overwrite the active database or reconnect to the damaged original blindly.

## 10. Writes and state changes requiring explicit Stage B approval

The following have not been executed and require a new written approval with scope/time:

1. stop/isolate MySQL 3306 or change Laragon auto-start behavior;
2. create production directories and filesystem ACLs under `ProgramData`;
3. initialize/import a long-term MySQL datadir and create/rotate production accounts;
4. register, start, stop, or configure the Windows Service and recovery policy;
5. create final logical/physical backups and restore-test databases;
6. place Laravel/proxy/frontends/Extension into maintenance or write-locked mode;
7. stop/restart API, queue, scheduler, webhook, scanner, or worker processes;
8. edit backend `.env`, frontend/Extension endpoints, CORS, cookie, SMTP, or HTTPS settings;
9. clear/rebuild Laravel config cache;
10. revoke the 19 Admin tokens;
11. perform any controlled authentication or other write smoke test against the production database;
12. open traffic and enable production writes;
13. perform rollback or reconcile post-cutover writes.

Stage A stops here pending explicit approval for Stage B.
