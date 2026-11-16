# VietTrung Order MySQL pre-cutover report

Status: **CANDIDATE PREPARED — CUTOVER NOT AUTHORIZED**

## Candidate identity

- MySQL: 8.4.3 Community Server
- Endpoint: `127.0.0.1:3309`
- Database: `logistics_system`
- Datadir: `C:\laragon\www\extention\.mysql-production-candidate-20261115\data\`
- Server UUID: `35682ae5-e05b-11f1-9911-b44506abce66`
- Server ID: `8409`
- Bind address: loopback only
- Binary log: enabled, ROW, FULL row image, 30-day expiry
- Durability: `sync_binlog=1`, `innodb_flush_log_at_trx_commit=1`
- Candidate files and DPAPI-protected credentials are excluded from Git.

The candidate identity differs from ports 3306 and 3308. Neither older instance was started, imported into, migrated, or modified during this stage.

The candidate currently runs as an isolated background process, not a registered Windows service. Service registration, startup policy, monitoring, and scheduled backups remain approval-gated production tasks.

## Recovery source and validation

- Source: `E:\MySQL_CuuHo_20261115\logistics_system_ready_45tables_20261115.sql`
- Size: 416,791 bytes
- SHA-256: `DAB9363E82FF7B3C90B1E878C47B1B0D13C65DBD8828C16F2405B79E6CEFE818`
- Import target was verified as port 3309, the candidate datadir, candidate UUID, and an empty `logistics_system` database before import.
- Import used the database-scoped migration account; no `migrate:fresh`, `db:wipe`, or Laravel migration was run.

Post-import result:

- 45 base tables
- 601 exact rows
- 86 foreign keys
- 0 orphan rows across all foreign keys
- 0 tables without a primary key
- Customer Authentication migration present exactly once

Required business counts:

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

The difference from 600 to 601 rows is valid: the 41-table backup contains 50 `migrations` rows, while the 45-table backup contains 51. The one added row is `2026_11_14_000000_create_customer_authentication_tables`. The four new Customer Authentication tables are empty in the candidate snapshot.

## Account separation

- Runtime application account: CRUD only on `logistics_system`; no schema privileges.
- Migration account: database-scoped administrative privileges on `logistics_system`; no global grant and no grant option.
- Backup account: SELECT/LOCK TABLES/SHOW VIEW/EVENT/TRIGGER only on `logistics_system`.
- Test runner: USAGE only on `logistics_system`, with access explicitly denied; it has privileges only on `logistics_system_auth_stage_test`.
- Root is password protected. Generated secrets are stored locally as Windows DPAPI ciphertext with a current-user-only ACL and are not present in Git or this report.

## Authentication smoke test

All write-capable tests ran against `logistics_system_auth_stage_test`, never against the candidate `logistics_system`. Mail used the in-memory `array` driver and no real customer mail was sent.

Result: 19/19 PASS, covering CSRF rejection/cookie, registration, unverified-login rejection, email verification, customer login, CustomerMe, principal isolation, Customer-versus-Admin guard isolation, forgot/reset password, old-session revocation, login with the new password, logout, post-logout rejection, Admin login, and authenticated Admin GraphQL principal.

No PHPUnit database-reset suite was run on MySQL 3309. Demo mode remains guarded by `import.meta.env.DEV` and the current local value is false; the production deployment must explicitly set `VITE_ENABLE_CUSTOMER_PORTAL_DEMO=false` before building.

## Personal Access Token policy

The restored snapshot has 19 Admin Personal Access Tokens, all owned by User principals. All 19 have no expiry; one has never been used. No token values or hashes were printed, changed, or deleted.

Recommended cutover policy:

1. During the approved maintenance window, revoke all 19 restored Admin tokens immediately before reopening traffic.
2. Require Admin Panel and Chrome Extension users to authenticate again against the candidate backend.
3. Issue replacement tokens with explicit expiry and least-privilege abilities rather than unrestricted, non-expiring tokens.
4. Record the revocation time and monitor failed bearer-token attempts after reopening.

This is recommended because possession of any previously issued plaintext bearer token cannot be disproved from the database hash alone. Revocation is not authorized during preparation and has not been performed.

## Application connection inventory

- Laravel backend is the only component in this repository that connects directly to MySQL. It requires the approved `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and secret-injected `DB_PASSWORD`.
- Admin Panel uses `VITE_API_BASE_URL` and calls Laravel GraphQL/REST; it does not connect to MySQL.
- Customer Web uses `VITE_CUSTOMER_API_URL` and Laravel session/CSRF endpoints; it does not connect to MySQL.
- Chrome Extension uses its configured GraphQL endpoint; it does not connect to MySQL. Its current production example endpoints are placeholders and require an approved release build.
- Laravel queue defaults to `sync` in the checked example configuration. Any deployment-specific queue workers must still be stopped and restarted at cutover.
- The checked Laravel scheduler contains no active scheduled jobs. Windows Task Scheduler, Supervisor/Horizon, webhook consumers, warehouse scanners, and external scripts must still be inventoried on the deployment host.
- Laravel cached configuration must be cleared and rebuilt after the connection switch; effective port/datadir/UUID/database/user must be verified without printing the password.

No production `.env`, frontend endpoint, extension endpoint, cached configuration, worker, or website connection was changed in this stage.

## Financial and operational risks

- Six order CNY discrepancies, three invoice VND discrepancies, and one unmatched CN package remain unchanged. See `business-reconciliation-20261115.md`.
- The candidate is localhost-only and is not yet a managed service with restart monitoring.
- Automated backup scheduling and restore-drill monitoring are not yet active for the candidate.
- All restored Admin tokens are non-expiring until an approved revocation step.
- A rollback after new writes must preserve and reconcile post-cutover registrations, orders, payments, warehouse events, password changes, and audit logs. It must never overwrite the new database blindly.

## Approval-gated final actions

1. Accept or separately resolve the listed business discrepancies.
2. Approve the maintenance window, named cutover operator, rollback operator, and customer communication.
3. Approve production service registration/startup, filesystem ACLs, backup schedule, monitoring, and any network/TLS exposure.
4. Take and hash the final pre-cutover backups and perform a disposable restore check.
5. Put all public applications in maintenance mode and stop every writer.
6. Prove there are no old write connections or active write transactions.
7. Approve token revocation and mandatory Admin/Extension re-login.
8. Approve the backend DB environment switch and secret injection.
9. Clear/rebuild Laravel config cache and restart approved workers.
10. Verify the effective connection identity through Laravel.
11. Run the approved read-only smoke suite, then any explicitly approved non-financial write test.
12. Verify Admin Panel, Customer Web, and Chrome Extension against the backend.
13. Open traffic gradually and monitor connections, permissions, errors, binlogs, and data writes.
14. If rollback is required, stop writers, preserve the candidate database and binlog coordinates, then reconcile post-cutover writes into a verified recovered target.

No item in this section has been executed as a production cutover action.
