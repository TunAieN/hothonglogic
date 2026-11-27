# SePay migrations 049–050 — HeidiSQL runbook

These files are the manual deployment package for `logistics_system`.

Production execution note (2026-11-24): migrations 049 and 050 were applied on
`127.0.0.1:3310` and recorded together in batch 49. Post-deployment checks found
47 tables, 12 customers, 21 payment vouchers, and zero rows in both new tables.
Do not rerun the DDL files on that database; use the read-only verification file
and `php artisan migrate:status` to confirm the current state.

## Required order

1. Keep SePay disabled and arrange a short maintenance window that prevents financial writes.
2. Verify the backup file and, preferably, complete a restore rehearsal into an isolated database. The current backup has structural and data indicators, but no successful restore has been demonstrated.
3. In the already authenticated HeidiSQL session, select `logistics_system` on `127.0.0.1:3310`. The authenticated MySQL account name must be `viettrung_dba` (the host part may vary).
4. Open and execute `00_preflight_read_only.sql`. Database, port, DBA account, parent tables, parent ID types, dependency migrations, target-table absence, target migration status, and constraint-name availability must all return `PASS`. Save the customer/voucher baseline result. `SHOW GRANTS` must also show the intended DBA privileges; never expose or recover the saved password.
5. Execute `01_apply_049.sql` as one file with stop-on-error behavior. Review its final result set; both new tables must exist and be empty.
6. Execute `02_apply_050.sql`. Review all 23 final columns and the two new indexes.
7. Run `04_verify_read_only.sql` before recording migrations. Compare customer/voucher counts and fingerprints with the preflight output.
8. Only when the schema is fully correct, execute `03_record_migrations.sql`. All mismatch counters must be zero, exact counts must match their labels, `schema_ready_must_equal_1` must be `1`, and the final result must be `SUCCESS_COMMITTED_EXACTLY_TWO_MIGRATIONS` with `attempted_insert_row_count = 2`.
9. Run `04_verify_read_only.sql` again. The expected table count is 47, customer count is 12, voucher count is 21, and both new financial tables should still be empty while SePay remains disabled.
10. From the backend directory, `php artisan migrate:status` may then be used as a read-only confirmation. Do not run `php artisan migrate` because unrelated older migrations remain pending.

## Error and partial-completion policy

- If any preflight row is `FAIL`, stop before DDL. Do not edit the script to bypass the failed guard.
- MySQL DDL implicitly commits. Do not expect a surrounding transaction to undo schema changes.
- If the first 049 `CREATE TABLE` fails, stop, run `04_verify_read_only.sql`, and resolve the reported cause. Do not assume a rollback beyond that single atomic statement.
- If `customer_payment_intents` exists but `sepay_webhook_events` creation fails, do not drop the first table and do not rerun the entire file. Run `04_verify_read_only.sql`, correct the cause, and execute only the missing second `CREATE TABLE` block.
- Migration 050 is packaged as one atomic `ALTER TABLE`. If it errors, do not record migration 050 and do not retry blindly. Run `04_verify_read_only.sql` and confirm whether all eight columns and both indexes are absent or present before deciding the next step.
- If `03_record_migrations.sql` reports `FAILED_ROLLED_BACK_NO_MIGRATION_HISTORY_CONFIRMED`, stop. Its conditional transaction has rolled back. Review every diagnostic counter and do not insert migration history manually.
- `03_record_migrations.sql` uses a named lock plus a SERIALIZABLE transaction and migration-history row/gap locking. Do not run Laravel migration commands or another schema session in parallel. A repeated manual execution after success safely rolls back instead of duplicating history.
- The inserted-row count is derived from the guarded before/after migration-history cardinality in the same transaction. It intentionally does not use `ROW_COUNT()`: HeidiSQL may execute an internal statement between script statements and reset `ROW_COUNT()` to zero. Any cardinality delta other than exactly two still rolls back.
- If the HeidiSQL connection drops before the success result, treat the recording as unconfirmed and run `04_verify_read_only.sql`; an uncommitted InnoDB transaction is rolled back when the connection closes.
- Never manually add migration rows before the complete schema matches the verification output.
- No script in this package drops, truncates, wipes or seeds a table. `03_record_migrations.sql` is the only script that changes an existing table, and it is limited to two guarded rows in Laravel's `migrations` table.

## Backup limitation

- Reviewed file: `C:\VietTrungBackups\logistics_system_dba_before_sepay_20261124.sql`.
- SHA-256 at review time: `437D7506102E81029D6E8946EB497865AF434E75795305B72E8F1200D43393EA`.
- Static inspection found 45 `CREATE TABLE IF NOT EXISTS` statements, 40 insert blocks, 12 customer rows, 21 payment-voucher rows, and session/foreign-key-check restoration at the end.
- This is not proof of recoverability. No successful restore rehearsal has been demonstrated.
- Because the dump uses `CREATE TABLE IF NOT EXISTS` and has no table-drop phase, any restore rehearsal must target a new, isolated, empty database. Never restore it over `logistics_system` merely to test it.

## Source correspondence

- `01_apply_049.sql` corresponds to `2026_11_23_000049_create_customer_finance_sepay_domain.php` and preserves every emitted column, order, default, unique/index name, foreign-key name, referenced table, and delete rule. Laravel `migrate --pretend` emits `CREATE TABLE` followed by separate `ALTER TABLE` statements; the review package intentionally consolidates each table's keys and constraints into its atomic `CREATE TABLE` to reduce partial-completion windows. It also states `ENGINE=InnoDB` explicitly instead of relying on the server default; preflight and the recording guard require that same engine.
- `02_apply_050.sql` corresponds to `2026_11_23_000050_harden_sepay_webhook_events.php`. Laravel `migrate --pretend` emits one column `ALTER` plus two index `ALTER` statements; this package intentionally combines all eight columns and both indexes into one atomic MySQL 8.4 `ALTER TABLE`. The final schema is the same and is checked exactly before migration history can be recorded.
- Pending migrations 046–048 and other older pending migrations are not executed or recorded by this package.

