# Production preflight — VIP and deposit policy migration 051

## Outcome

**Stopped before production DDL.** All read-only checks and the production backup completed, but no DDL-capable database account is currently usable. Migration `051` remains pending and production schema/data were not changed.

## Target and repository

- Checked at: 2026-11-25 23:58–2026-11-26 00:xx (Asia/Bangkok)
- Repository: `C:\laragon\www\extention`
- Branch: `feature/customer-finance-sepay`
- Base commit: `57db9ced...`
- Database: MySQL 8.4.3, `127.0.0.1:3310/logistics_system`
- Application account: `viettrung_app@127.0.0.1`
- Existing uncommitted Customer Finance/SePay work was preserved. No reset, clean, checkout, pull, or merge was run.

## Migration review

- File: `database/migrations/2026_11_25_000051_create_vip_and_order_deposit_policy_domain.php`
- SHA-256: `27F148729C1500F19ED56B29BCA2CE8F576200531F641B4501C05D3F2B1A6094`
- Laravel status: `Pending`
- `--pretend`: successful
- Destructive statements: none (`DROP`, `DELETE`, `TRUNCATE`, and updates to existing customer data are absent)
- Planned scope: five new tables, two nullable/default-safe customer columns, related foreign keys/indexes, four VIP tiers, and four risk levels.
- Existing `customers.vip_group`, ledger, payment-voucher, and SePay structures are not altered.
- All seeded VIP financial policies remain disabled; all risk minimum percentages remain `NULL`.

The global migration list contains unrelated historical entries marked Pending. Therefore the only reviewed apply command is the path-scoped command for `051`; the global `php artisan migrate` command must not be used.

## Production baseline (exact counts)

| Metric | Count |
|---|---:|
| Customers | 12 |
| Orders | 42 |
| Payment vouchers | 21 |
| Waiting-payment vouchers | 5 |
| Customer balance ledger rows | 1 |
| SePay webhook events | 1 |
| Pending orders | 8 |
| Awaiting-deposit orders | 3 |

Current `customers.vip_group` distribution:

| Value | Customers |
|---|---:|
| `NULL` | 2 |
| VIP Bronze | 2 |
| VIP Silver | 4 |
| VIP Gold | 3 |
| VIP Platinum | 1 |

Before stopping:

- Target tables present: 0/5
- Target customer columns present: 0/2
- Migration `051` rows in `migrations`: 0

## Backup

- Valid dump: `C:\VietTrungBackups\logistics_system_before_vip051_20261125_235915.sql`
- Size: 443,463 bytes
- SHA-256: `2C0BFEEA6FD7EB88CB5E1D1F0B6E01F3A242F44AD7F74536F57E5A4AD79F5098`
- Contents detected: 47 `CREATE TABLE` statements and 43 `INSERT INTO` statements
- Method: MySQL 8.4 `mysqldump`, single transaction, quick streaming, routines, triggers, hex blobs, no tablespaces, UTF-8 MB4
- MySQL EVENT definitions are not included because the application account has no permission to read them. The first failed dump was renamed to `logistics_system_before_vip051_20261125_235852.sql.incomplete` and must not be used.

Restore execution could not be tested: the QA account on port 3311 is rejected, Docker is unavailable, and the production application account cannot create an isolated database. The valid dump passed non-empty, checksum, and SQL-content checks only.

## Blocking safety gate

`SHOW GRANTS` reports only `SELECT, INSERT, UPDATE, DELETE` on `logistics_system.*` for the application account. It has no `CREATE`, `ALTER`, `INDEX`, or `REFERENCES` privilege, so it cannot safely apply migration `051`.

The local `root` account is also unusable because it is configured with `mysql_native_password`, while that authentication plugin is disabled on MySQL 8.4. No server restart, authentication-plugin change, grant change, or privilege elevation was attempted. The QA account on `127.0.0.1:3311` remains inaccessible.

## Required continuation

Provide a working deployment account with the minimum DDL permissions required on `logistics_system` (or repair the local administrative login through the normal DBA/Laragon procedure). Do not grant DDL to `viettrung_app`.

After a DDL-capable account is available:

1. Re-run the exact-count baseline and verify the backup file/checksum.
2. Apply only the reviewed path-scoped migration `051`.
3. Inspect actual schema immediately, especially if any DDL error occurs.
4. Run `02_verify_read_only.sql` and compare all counts/distributions above.
5. Keep customer backfill and all financial-policy activation disabled pending separate approval.
