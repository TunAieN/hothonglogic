# Production deployment — VIP and deposit policy migration 051

## Result

Migration `2026_11_25_000051_create_vip_and_order_deposit_policy_domain` was applied successfully to `127.0.0.1:3310/logistics_system` on 2026-11-26 (Asia/Bangkok).

- Laravel migration result: `DONE` in 1,650 ms
- Migration batch: `50`
- Scoped status after deployment: `Ran`
- No unrelated pending migration was executed.

## Secure deployment connection

- DPAPI credential decrypted successfully for `viettrung_dba`.
- MySQL identity verified as `viettrung_dba@127.0.0.1`.
- Laravel PDO identity verified against database `logistics_system`, port `3310`.
- The DBA account requires TLS. Deployment used the production CA through temporary environment variables and negotiated `TLS_AES_256_GCM_SHA384`.
- `.env` was not modified.
- `config/database.php` now supports the opt-in environment variable `MYSQL_ATTR_SSL_VERIFY_SERVER_CERT`; behavior is unchanged when the variable is absent.

## Reviewed backup and migration

- Backup: `C:\VietTrungBackups\logistics_system_before_vip051_20261125_235915.sql`
- Size: 443,463 bytes
- SHA-256: `2C0BFEEA6FD7EB88CB5E1D1F0B6E01F3A242F44AD7F74536F57E5A4AD79F5098`
- Migration SHA-256: `27F148729C1500F19ED56B29BCA2CE8F576200531F641B4501C05D3F2B1A6094`
- Scoped pretend result: five `CREATE TABLE`, 28 `ALTER TABLE`, two seed `INSERT`, zero destructive statements.

## Before/after data reconciliation

| Metric | Before | After |
|---|---:|---:|
| Customers | 12 | 12 |
| Orders | 42 | 42 |
| Payment vouchers | 21 | 21 |
| Waiting-payment vouchers | 5 | 5 |
| Customer balance ledger rows | 1 | 1 |
| SePay webhook events | 1 | 1 |
| Pending orders | 8 | 8 |
| Awaiting-deposit orders | 3 | 3 |

Existing `vip_group` distribution remained unchanged:

| Value | Customers |
|---|---:|
| `NULL` | 2 |
| VIP Bronze | 2 |
| VIP Silver | 4 |
| VIP Gold | 3 |
| VIP Platinum | 1 |

No existing customer was backfilled: all 12 have `vip_tier_id = NULL` and `vip_qualified_spend_vnd = 0` immediately after deployment.

## New schema and seed state

- Five new InnoDB/`utf8mb4_unicode_ci` tables exist.
- `customers.vip_tier_id`: nullable `BIGINT UNSIGNED`.
- `customers.vip_qualified_spend_vnd`: non-null `BIGINT UNSIGNED`, default `0`.
- Expected constraints verified: 15 foreign keys, eight unique constraints, four named secondary indexes.
- Four VIP tiers exist with thresholds 0 / 10,000,000 / 50,000,000 / 150,000,000 VND.
- Exactly one active default tier exists: Bronze.
- Every `deposit_policy_enabled` value is `0`.
- Four risk policies exist; every `minimum_deposit_percent` remains `NULL`.
- Spend events, VIP histories, and order deposit snapshots are empty.
- Vietnamese risk-policy names were verified by their UTF-8 bytes.

## Application verification

- Runtime application connection: `viettrung_app@127.0.0.1`, database `logistics_system`, port `3310`.
- Application read of `vip_tiers` and `risk_deposit_policies`: four rows each.
- Laravel scoped migration status: `[50] Ran`.
- Lighthouse GraphQL schema validation: PASS.
- PHP syntax for `config/database.php`: PASS.

No order, voucher, wallet, ledger, SePay, TaskFlow, warehouse, shipping, or tracking data was written by the deployment beyond the reviewed migration schema and policy seed rows. Financial deposit policy activation and existing-customer VIP reconciliation remain separate owner-approved actions.
