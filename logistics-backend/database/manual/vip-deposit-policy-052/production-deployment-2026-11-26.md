# Production deployment — VIP risk surcharge migration 052

## Result

Migration `2026_11_26_000052_add_risk_surcharge_policy` was applied successfully to MySQL 8.4.3 at `127.0.0.1:3310/logistics_system` on 2026-11-26 (Asia/Bangkok).

- Laravel migration result: `DONE` in 183 ms
- Migration batch: `51`
- Scoped Laravel status after deployment: `Ran`
- Migration 051 remained recorded and was not re-run.
- No unrelated Pending migration was executed.
- All four `deposit_policy_enabled` flags remain `0`.

## Secure deployment connection

- DPAPI credential decrypted in memory for `viettrung_dba`; the password was not printed, passed on the command line, written to Git, or persisted in `.env`.
- Exact identity: `viettrung_dba@127.0.0.1`
- Exact database/port: `logistics_system` / `3310`
- mysql.exe verified the production CA using `VERIFY_CA` and negotiated `TLS_AES_128_GCM_SHA256`.
- Laravel PDO used the same CA, encrypted transport, and negotiated `TLS_AES_256_GCM_SHA384`. Hostname matching was disabled because the auto-generated certificate CN is not `127.0.0.1`.
- `APP_DEBUG=false` and an isolated, non-existent `APP_CONFIG_CACHE` path were supplied only to the deployment process.
- MySQL was not restarted; root, `viettrung_app`, Laragon port 3306, and application `.env` were not modified.

## Backup

Final pre-migration backup:

- Path: `C:\VietTrungBackups\logistics_system_before_vip052_20261126_125507.sql`
- Size: `458,348` bytes
- SHA-256: `9C98BDBF13943D1B23144C87BF1DEEBFE30055F918A95D760CC431ACD7A843AD`
- SQL content checks: 52 `CREATE TABLE` statements and 45 `INSERT INTO` statements
- Dump method: MySQL 8.4 mysqldump, `single-transaction`, `quick`, routines, triggers, hex blobs, no tablespaces, UTF-8 MB4, TLS `VERIFY_CA`

An earlier valid backup was also created during the first stopped PDO preflight:

- `C:\VietTrungBackups\logistics_system_before_vip052_20261126_125321.sql`
- Size: `458,348` bytes
- SHA-256: `B645AB890289F19AF4F9DCBF997D8B38F6CCBBA5C2A46260F24416C5D300041E`

Port 3311 was listening, but no approved isolated restore database/credential was supplied. Restore testing was therefore skipped; production was never used as a restore target.

## Reviewed migration

- Migration SHA-256: `04A253DEF625819C1812D131D324BE8D9CA22730735F5E51FB75711AE430BBD3`
- Scoped `--pretend`: PASS
- MySQL 8.4 syntax: PASS
- Destructive SQL scan: no `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or `DELETE FROM`

## Schema changes

`risk_deposit_policies`:

- `surcharge_percent DECIMAL(5,2) NULL`
- Unique index `risk_deposit_surcharge_unique`

`order_deposit_policy_snapshots`:

- `automatic_risk_code VARCHAR(30) NULL`
- `automatic_risk_reason TEXT NULL`
- `risk_selection_source VARCHAR(20) NOT NULL DEFAULT 'manual'`
- `risk_evidence JSON NULL`
- `risk_surcharge_percent DECIMAL(5,2) NULL`
- `additive_percent DECIMAL(5,2) NULL`
- `policy_formula VARCHAR(60) NULL`
- `policy_version VARCHAR(30) NULL`

The existing `minimum_deposit_percent` absolute-floor field remains unchanged and was not repurposed.

## Policy state after migration

| Risk | Surcharge | Absolute floor | Manager approval |
| --- | ---: | --- | ---: |
| Low | 5.00 | `NULL` | 0 |
| Medium | 10.00 | `NULL` | 0 |
| High | 20.00 | `NULL` | 0 |
| Special | 30.00 | `NULL` | 1 |

| VIP | Base deposit | Enabled |
| --- | ---: | ---: |
| Bronze | 60.00 | 0 |
| Silver | 50.00 | 0 |
| Gold | 40.00 | 0 |
| Platinum | 30.00 | 0 |

Because every tier remains disabled, new confirmations continue using the existing 70% fallback until a separate owner-approved activation.

## Before/after reconciliation

| Metric | Before | After |
| --- | ---: | ---: |
| Customers | 13 | 13 |
| Orders | 43 | 43 |
| Payment vouchers | 21 | 21 |
| Payment transactions | 18 | 18 |
| Customer balance ledgers | 1 | 1 |
| SePay webhook events | 1 | 1 |
| Order deposit policy snapshots | 0 | 0 |
| Audit logs | 96 | 96 |
| Migration rows | 55 | 56 |
| Enabled VIP tiers | 0 | 0 |

No test order, voucher, payment, snapshot, ledger, wallet, or SePay event was created.

## Application and server verification

- `viettrung_app@127.0.0.1` read the four surcharge values through a temporary CA/TLS environment and negotiated `TLS_AES_256_GCM_SHA384`.
- Scoped Laravel migration status: `[51] Ran`.
- Lighthouse GraphQL schema validation: PASS.
- Migration PHP syntax: PASS.
- MySQL error log length remained `27,167` bytes and contained no new error entry.
- Default application CLI configuration initially connected without a TLS cipher; no persistent `.env` change was made because it was explicitly prohibited. The temporary TLS postflight succeeded.

## Code deployment status and remaining activation gates

Backend and Admin Panel changes for the additive formula are prepared and build/schema tests passed, but this database task did not deploy application code or unrelated changes.

Before enabling automatic VIP + risk deposits:

1. Deploy only the reviewed backend/Admin Panel changes compatible with schema 052.
2. Verify the persistent production application process is configured for the intended TLS policy without committing credentials.
3. Run isolated QA confirmation/payment-flow tests.
4. Obtain separate final owner approval to enable `deposit_policy_enabled` for the intended tiers.

Configuration rollback after activation is performed by disabling the audited tier flags. Existing issued vouchers retain their saved snapshots.
