# VIP and deposit policy migration 051

This package is intentionally review-only. Nothing in this directory is executed by Laravel automatically.

## Approval gates

1. Run `00_preflight_read_only.sql` with a read-only MySQL account against the intended database.
2. Review every customer whose `vip_group` is null, blank, or not one of Bronze/Silver/Gold/Platinum. Migration 051 does not change them.
3. Approve the proposed membership thresholds separately from financial activation.
4. Approve risk minimum percentages. Migration 051 leaves every risk floor null.
5. Keep `deposit_policy_enabled = 0` until the owner signs off. Migration 051 seeds all proposed VIP deposit percentages disabled.
6. Re-enable the isolated QA account on `127.0.0.1:3311/logistics_system_test`, apply migration 051 there, and run the complete backend suite.

## Reviewed apply command (do not run before approval)

```text
php artisan migrate --path=database/migrations/2026_11_25_000051_create_vip_and_order_deposit_policy_domain.php --force
```

Never use `migrate:fresh`, `migrate:refresh`, `db:wipe`, or a production seeder. After the scoped migration, run `02_verify_read_only.sql` before enabling any financial policy.

## Existing-customer strategy

- `customers.vip_group` is retained.
- `customers.vip_tier_id` is nullable and migration 051 performs no backfill.
- Existing Bronze/Silver/Gold/Platinum text values can be mapped only by a separately reviewed reconciliation step.
- Blank or unknown values require an explicit owner-approved decision.
- New customers receive the single active default tier through backend transactions.

