# HeidiSQL deployment procedure for migration 051

## Equivalence decision

Manual deployment is feasible because migration `051` contains deterministic MySQL schema operations and two deterministic seed inserts. It does not dispatch jobs, emit events, call application services, update existing business rows, or perform hidden PHP branching.

The PHP-only behavior translated into SQL is:

- `now()` becomes one shared `UTC_TIMESTAMP()` value because Laravel is configured with timezone `UTC`;
- four proposed VIP rows are inserted with every `deposit_policy_enabled` value set to `0`;
- four risk rows are inserted with every `minimum_deposit_percent` value set to `NULL`;
- Laravel's migration record is added only after schema and seed verification passes;
- `down()` is intentionally empty, so no rollback SQL is provided.

The generated schema matches the reviewed Laravel `--pretend` output. Explicit `ENGINE=InnoDB`, `utf8mb4`, and `utf8mb4_unicode_ci` clauses make the server defaults unambiguous and match the production dependency tables.

## Files and mandatory order

1. `01_heidisql_preflight.sql` — read-only; all named gates must report `PASS`.
2. `02_heidisql_apply_schema_and_seed.sql` — DDL and eight configuration rows; no Laravel migration record.
3. `03_heidisql_finalize_migration.sql` — inspect results and conditionally insert the Laravel migration record.
4. `02_verify_read_only.sql` — final independent read-only verification.

In HeidiSQL, open each file separately and execute only the current file. Do not select all files or concatenate them. Keep query error handling configured to stop on the first error.

## Before execution

- Confirm the active session is `viettrung_dba@127.0.0.1`, host `127.0.0.1`, port `3310`, database `logistics_system`.
- Confirm the valid backup still exists at `C:\VietTrungBackups\logistics_system_before_vip051_20261125_235915.sql`, size `443463` bytes, SHA-256 `2C0BFEEA6FD7EB88CB5E1D1F0B6E01F3A242F44AD7F74536F57E5A4AD79F5098`.
- Confirm the preflight reports zero target tables, zero target columns, and no migration `051` record.
- Confirm baseline counts: 12 customers, 42 orders, 21 payment vouchers, 1 ledger row, and 1 SePay webhook event.
- Confirm the grant output includes `CREATE`, `ALTER`, `INDEX`, `REFERENCES`, `SELECT`, and `INSERT` for the target database or globally.

## Failure rules

MySQL DDL implicitly commits. A failure cannot be assumed to roll back earlier statements.

If any statement in the apply file fails:

1. Stop immediately.
2. Save the exact MySQL error and the failing statement.
3. Do not rerun the apply file.
4. Do not drop any partially created object and do not insert the migration record.
5. Inspect `information_schema` and prepare a separately reviewed continuation plan.

If the apply file finishes but finalization returns `migration_rows_inserted = 0`, do not rerun the apply file. Review the boolean verification result and row counts, then rerun only the finalization file after the cause has been reviewed and corrected.

## Expected final state

- Five new InnoDB tables exist.
- `customers.vip_tier_id` is nullable and all 12 existing values remain `NULL`.
- `customers.vip_qualified_spend_vnd` is `0` for all existing customers.
- `customers.vip_group` distribution remains unchanged.
- Four VIP tiers exist; all financial-policy flags are disabled.
- Four risk policies exist; all risk floors are `NULL`.
- Spend events, VIP histories, and deposit snapshots are empty.
- Orders, payment vouchers, ledger, SePay, TaskFlow, warehouse, and shipping data are untouched.
- Migration `2026_11_25_000051_create_vip_and_order_deposit_policy_domain` is recorded once, in `MAX(batch) + 1` (expected batch 50 if no other migration was recorded first).

After this state is confirmed, Laravel `migrate:status` should report `051` as Ran while all unrelated Pending migrations remain untouched.
