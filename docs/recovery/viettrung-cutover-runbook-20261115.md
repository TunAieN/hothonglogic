# VietTrung Order database cutover runbook

Status: **PREPARATION ONLY — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL**

## Recovery artifacts

- Physical recovery copy: `E:\MySQL_CuuHo_20261115\recovered-mysql-8.4-validated`
- Verified 41-table dump: `E:\MySQL_CuuHo_20261115\logistics_system_recovered_41tables_20261115.sql`
- Ready 45-table dump: `E:\MySQL_CuuHo_20261115\logistics_system_ready_45tables_20261115.sql`
- Original SQL backup: `C:\Users\84335\Downloads\logistics_system.sql`
- Original MySQL datadir: `C:\laragon\data\mysql-8.4` — never overwrite or delete during cutover.

## A. Preconditions and approval gate

Do not begin until all items are signed off:

1. A named operator and rollback operator are present.
2. A maintenance window and customer communication are approved.
3. The 45-table dump hash matches the recovery report.
4. A fresh import of the dump has 45 tables, 601 rows, 86 foreign keys, zero orphans, and no missing primary keys.
5. The known six CNY order discrepancies, three shipping-invoice discrepancies, and one unmatched CN package are explicitly accepted as pre-existing.
6. Admin, Customer Web, and Chrome Extension smoke-test scripts and credentials are ready.
7. The target MySQL service has a unique datadir, port, UUID, application account, backup account, and monitoring.
8. Binary logging and automated backups are enabled on the target before accepting writes.
9. No cached Laravel configuration is allowed to survive the connection switch.
10. An explicit written approval authorizes the cutover.

If any check fails, stop without changing application configuration.

## B. Enter maintenance mode

1. Record the exact cutover start time in Asia/Bangkok and UTC.
2. Put Laravel into maintenance mode with a private bypass secret held by the operators.
3. Confirm public Admin, Customer Web, GraphQL mutations, REST writes, and Extension writes receive maintenance responses.
4. Keep read-only status pages available only if they cannot reach write paths.

## C. Stop every writer

Stop or pause, in this order:

1. Queue workers and Horizon/Supervisor workers.
2. Laravel scheduler and Windows Task Scheduler entries.
3. Import jobs, warehouse scanners, webhook consumers, payment callbacks, and mail-triggered jobs.
4. Admin Panel sessions capable of mutations.
5. Customer Web write endpoints.
6. Chrome Extension API access.

Verify at the database that there are no unexpected application sessions or active write transactions. Do not rely only on the UI being in maintenance mode.

## D. Create final pre-cutover backups

1. Take a logical backup of every database that may be used for rollback, using MySQL 8.4 `mysqldump --single-transaction --quick --routines --triggers --events --hex-blob --set-gtid-purged=OFF`.
2. Record file size and SHA-256.
3. Copy the target datadir only after a clean MySQL shutdown, if a physical snapshot is required.
4. Record target binlog file/position or GTID immediately before opening writes.
5. Import the logical backup once into a disposable database and verify table/row counts.

Never write these backups into the Git repository.

## E. Validate the target database

Required target state:

- Exactly 45 base tables.
- Exactly 601 rows for the prepared snapshot.
- Original business-table counts match the 41-table recovery report.
- Four Customer Authentication tables exist and are initially empty.
- 86 foreign keys and zero orphan records.
- No missing primary keys.
- `customers=10`, `users=11`, `orders=37`, `order_items=56`, `payment_vouchers=21`, `payment_transactions=18`, `invoices=13`, `invoice_items=17`, and `audit_logs=96`.
- The Customer Authentication migration appears once in `migrations`.

Run only read-only validation queries. Do not correct business values during cutover.

## F. Switch Laravel safely

1. Back up the current production `.env` without placing it in Git.
2. Change only the approved `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and secret source for `DB_PASSWORD`.
3. Use an application account with only the runtime privileges it needs. Do not use root, the recovery operator, or the test runner.
4. Clear cached configuration, then rebuild it.
5. Inspect the effective Laravel database configuration without printing the password.
6. Query `@@server_uuid`, `@@port`, `@@datadir`, and `DATABASE()` through the application connection and compare them to the approved target.
7. Do not run `migrate`, `migrate:fresh`, `migrate:refresh`, or `db:wipe` during the connection switch. The approved target must already contain the completed schema.

## G. Confirm effective connection settings

Before any write smoke test, two operators must confirm:

- `DB_HOST` is the new host.
- `DB_PORT` is the new port.
- `DB_DATABASE=logistics_system` or the specifically approved production name.
- The username is the restricted application account.
- `@@datadir` is not `C:\laragon\data\mysql-8.4`.
- The server UUID is the approved target UUID.
- Laravel config cache contains the new connection.

## H. Application smoke tests

Run in this order with dedicated test identities:

1. Admin login and authenticated GraphQL `me`.
2. Read-only Admin pages: customers, orders, warehouse, payments, and invoices.
3. Customer registration with a non-customer test address.
4. Email verification through the approved test mail sink.
5. Customer login, CustomerMe, password reset, logout, and session expiry.
6. Confirm a Customer session cannot access Admin GraphQL.
7. Confirm Customer A cannot select or access Customer B.
8. Confirm Demo Mode is disabled.
9. Chrome Extension login and read-only lookup.
10. A single explicitly approved non-financial test write, followed by verification and cleanup, only if the business owner requires it.

Do not send email to real customers or create financial transactions.

## I. Prove the old database receives no writes

1. Keep the old database stopped or network-isolated where possible.
2. If it must remain online, revoke the old application account's write privileges after the new connection is confirmed.
3. Monitor connections, general/audit logs, and binlog growth on both servers.
4. Confirm no queue worker, scheduler, webhook, Extension instance, or cached application process retains the old connection.
5. Search deployment hosts for stale `.env` and cached configuration.

## J. Acceptance criteria before reopening

Reopen only when:

- All connection checks identify the new server.
- All required table/row/FK checks pass.
- Admin and Customer authentication pass.
- Admin Panel and Extension read paths pass.
- There are no writes to the old database.
- Error logs contain no database, session, CSRF, or authorization failures.
- Monitoring and backup jobs are healthy.
- The rollback operator confirms the rollback artifacts are usable.

Open traffic gradually, watch writes and error rates, then lift maintenance mode.

## K. Rollback plan

The damaged original database is not an acceptable automatic rollback target.

1. Immediately re-enter maintenance mode.
2. Stop all writers again.
3. Record the rollback time and the new database's binlog/GTID position.
4. Dump the new database before changing any connection. This preserves post-cutover registrations and transactions.
5. Roll back application configuration to the last **verified recovered snapshot**, not to the damaged original datadir.
6. Clear and rebuild Laravel config cache.
7. Verify server UUID/datadir/database before reopening.
8. Re-run the acceptance checks.
9. Keep the failed target and its binlogs immutable for reconciliation.

If no verified rollback database is online, remain in maintenance mode rather than reconnecting to the damaged original database.

## L. Preserve post-cutover data

If writes occurred after cutover:

1. Never discard or overwrite the new database.
2. Capture a logical backup and binlog coordinates before rollback.
3. Inventory new customer accounts, orders, payments, warehouse events, and password/session changes by primary key and timestamp.
4. Reconcile into the rollback target through reviewed, idempotent scripts on staging first.
5. Financial and warehouse changes require business approval; do not replay them blindly.
6. Preserve audit logs from both sides.

## M. Archive policy

Retain separately:

1. The original damaged datadir.
2. The original physical rescue copy and three binlogs.
3. The validated physical recovery copy.
4. The 41-table logical backup.
5. The 45-table ready backup.
6. The final pre-cutover and post-cutover backups.
7. Hash manifests, validation reports, and the approved runbook.

Use restricted filesystem permissions, encrypted offline/off-site copies, retention monitoring, and periodic restore drills. Do not delete any rescue artifact until the retention owner explicitly approves it.

## N. Prepared MySQL 8.4 candidate

The isolated candidate prepared during Stage 4 is documented in `viettrung-pre-cutover-report-20261115.md`. Its approved identity for future verification is:

- endpoint `127.0.0.1:3309`
- database `logistics_system`
- datadir `C:\laragon\www\extention\.mysql-production-candidate-20261115\data\`
- server UUID `35682ae5-e05b-11f1-9911-b44506abce66`
- server ID `8409`

Do not treat the presence of this candidate as authorization to switch an application. Before production use, separately approve Windows service registration/startup, directory ACLs, automated backups, monitoring, network exposure, TLS policy, and secret injection.

## O. Final operator sequence

After written cutover approval, execute and record these gates in order:

1. Hash and restore-test the final source and candidate backups.
2. Enter maintenance mode and verify all public write endpoints are closed.
3. Stop workers, schedulers, callbacks, scanners, imports, and other writers.
4. Confirm zero old write sessions and zero active write transactions.
5. Revalidate candidate port, datadir, UUID, schema counts, foreign keys, and business exceptions.
6. Revoke restored Admin Personal Access Tokens if the token policy is approved.
7. Change only the backend database environment and secret source.
8. Clear/rebuild Laravel cached configuration and restart only approved processes.
9. Verify the effective Laravel connection identity before any smoke-test write.
10. Test Admin, Customer Web, and Chrome Extension in the approved order.
11. Confirm old MySQL/binlogs remain unchanged while the candidate receives intended traffic.
12. Reopen gradually and monitor database errors, authorization failures, connections, and binlog growth.
13. Keep all pre-cutover databases and backups immutable for rollback.
14. On rollback, preserve candidate writes first; never reconnect blindly to the damaged original or overwrite post-cutover data.
