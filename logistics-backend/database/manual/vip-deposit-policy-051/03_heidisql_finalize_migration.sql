-- VIP/deposit policy migration 051: verify and conditionally record Laravel migration.
-- Run this only after 02_heidisql_apply_schema_and_seed.sql completed with no error.
-- The INSERT into migrations occurs only when every strict verification condition passes.

USE `logistics_system`;

SELECT table_name, engine, table_collation
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
      'vip_tiers',
      'customer_vip_spend_events',
      'customer_vip_histories',
      'risk_deposit_policies',
      'order_deposit_policy_snapshots'
  )
ORDER BY table_name;

SELECT column_name, column_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'customers'
  AND column_name IN ('vip_tier_id', 'vip_qualified_spend_vnd')
ORDER BY ordinal_position;

SELECT code, name, priority, minimum_spend_vnd, base_deposit_percent,
       credit_limit_vnd, deposit_policy_enabled, is_default, is_active
FROM vip_tiers
ORDER BY priority;

SELECT code, name, priority, minimum_deposit_percent,
       requires_manager_approval, is_active
FROM risk_deposit_policies
ORDER BY priority;

SELECT
    (SELECT COUNT(*) FROM customers) AS customers,
    (SELECT COUNT(*) FROM orders) AS orders,
    (SELECT COUNT(*) FROM payment_vouchers) AS payment_vouchers,
    (SELECT COUNT(*) FROM customer_balance_ledgers) AS customer_balance_ledgers,
    (SELECT COUNT(*) FROM sepay_webhook_events) AS sepay_webhook_events,
    (SELECT COUNT(*) FROM customers
      WHERE vip_tier_id IS NOT NULL OR vip_qualified_spend_vnd <> 0) AS customers_vip_changed,
    (SELECT COUNT(*) FROM customer_vip_spend_events) AS spend_events,
    (SELECT COUNT(*) FROM customer_vip_histories) AS vip_histories,
    (SELECT COUNT(*) FROM order_deposit_policy_snapshots) AS deposit_snapshots;

SELECT COALESCE(vip_group, '<NULL>') AS vip_group, COUNT(*) AS customers
FROM customers
GROUP BY vip_group
ORDER BY vip_group;

SELECT
    (SELECT COUNT(*)
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (
            'vip_tiers', 'customer_vip_spend_events', 'customer_vip_histories',
            'risk_deposit_policies', 'order_deposit_policy_snapshots'
        )
        AND engine = 'InnoDB'
        AND table_collation = 'utf8mb4_unicode_ci') = 5 AS five_tables_ok,
    (SELECT COUNT(*)
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'customers'
        AND ((column_name = 'vip_tier_id' AND column_type = 'bigint unsigned' AND is_nullable = 'YES')
          OR (column_name = 'vip_qualified_spend_vnd' AND column_type = 'bigint unsigned'
              AND is_nullable = 'NO' AND column_default = '0'))) = 2 AS customer_columns_ok,
    (SELECT COUNT(*) FROM information_schema.referential_constraints
      WHERE constraint_schema = DATABASE()
        AND constraint_name IN (
            'vip_tiers_updated_by_foreign',
            'customers_vip_tier_id_foreign',
            'customer_vip_spend_events_customer_id_foreign',
            'customer_vip_spend_events_created_by_foreign',
            'customer_vip_histories_customer_id_foreign',
            'customer_vip_histories_from_vip_tier_id_foreign',
            'customer_vip_histories_to_vip_tier_id_foreign',
            'customer_vip_histories_changed_by_foreign',
            'risk_deposit_policies_updated_by_foreign',
            'order_deposit_policy_snapshots_order_id_foreign',
            'order_deposit_policy_snapshots_customer_id_foreign',
            'order_deposit_policy_snapshots_vip_tier_id_foreign',
            'order_deposit_policy_snapshots_risk_deposit_policy_id_foreign',
            'order_deposit_policy_snapshots_assessed_by_foreign',
            'order_deposit_policy_snapshots_approved_by_foreign'
        )) = 15
      AND (SELECT COUNT(*) FROM information_schema.table_constraints
            WHERE constraint_schema = DATABASE() AND constraint_type = 'UNIQUE'
              AND constraint_name IN (
                  'vip_tiers_code_unique', 'vip_tiers_name_unique', 'vip_tiers_priority_unique',
                  'vip_spend_source_event_unique',
                  'risk_deposit_policies_code_unique', 'risk_deposit_policies_name_unique',
                  'risk_deposit_policies_priority_unique',
                  'order_deposit_policy_snapshots_order_id_unique'
              )) = 8
      AND (SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND index_name IN (
                  'vip_tiers_is_active_minimum_spend_vnd_index',
                  'customers_vip_tier_id_vip_qualified_spend_vnd_index',
                  'customer_vip_spend_events_customer_id_occurred_at_index',
                  'customer_vip_histories_customer_id_created_at_index'
              )) = 4 AS constraints_and_indexes_ok,
    (SELECT COUNT(*) FROM vip_tiers) = 4
      AND (SELECT COUNT(*) FROM vip_tiers
            WHERE (code='bronze' AND name='Bronze' AND priority=10 AND minimum_spend_vnd=0
                   AND base_deposit_percent=80.00 AND credit_limit_vnd IS NULL
                   AND deposit_policy_enabled=0 AND is_default=1 AND is_active=1)
               OR (code='silver' AND name='Silver' AND priority=20 AND minimum_spend_vnd=10000000
                   AND base_deposit_percent=70.00 AND credit_limit_vnd IS NULL
                   AND deposit_policy_enabled=0 AND is_default=0 AND is_active=1)
               OR (code='gold' AND name='Gold' AND priority=30 AND minimum_spend_vnd=50000000
                   AND base_deposit_percent=60.00 AND credit_limit_vnd IS NULL
                   AND deposit_policy_enabled=0 AND is_default=0 AND is_active=1)
               OR (code='platinum' AND name='Platinum' AND priority=40 AND minimum_spend_vnd=150000000
                   AND base_deposit_percent=50.00 AND credit_limit_vnd IS NULL
                   AND deposit_policy_enabled=0 AND is_default=0 AND is_active=1)) = 4 AS vip_seed_ok,
    (SELECT COUNT(*) FROM risk_deposit_policies) = 4
      AND (SELECT COUNT(*) FROM risk_deposit_policies
            WHERE minimum_deposit_percent IS NULL AND is_active=1
              AND ((code='low' AND name='Thấp' AND priority=10 AND requires_manager_approval=0)
                OR (code='medium' AND name='Trung bình' AND priority=20 AND requires_manager_approval=0)
                OR (code='high' AND name='Cao' AND priority=30 AND requires_manager_approval=0)
                OR (code='special' AND name='Đặc biệt' AND priority=40 AND requires_manager_approval=1))) = 4 AS risk_seed_ok,
    (SELECT COUNT(*) FROM customers
      WHERE vip_tier_id IS NOT NULL OR vip_qualified_spend_vnd <> 0) = 0 AS no_customer_backfill_ok,
    (SELECT COUNT(*) FROM customer_vip_spend_events) = 0
      AND (SELECT COUNT(*) FROM customer_vip_histories) = 0
      AND (SELECT COUNT(*) FROM order_deposit_policy_snapshots) = 0 AS no_runtime_rows_ok,
    (SELECT COUNT(*) FROM migrations
      WHERE migration='2026_11_25_000051_create_vip_and_order_deposit_policy_domain') = 0 AS migration_not_recorded_yet;

-- Strict finalization. This inserts exactly one migration row only if all schema,
-- seed, no-backfill, no-runtime-row, and baseline-count conditions are true.
INSERT INTO migrations (`migration`, `batch`)
SELECT
    '2026_11_25_000051_create_vip_and_order_deposit_policy_domain',
    (SELECT COALESCE(MAX(batch), 0) + 1 FROM migrations)
WHERE
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (
            'vip_tiers', 'customer_vip_spend_events', 'customer_vip_histories',
            'risk_deposit_policies', 'order_deposit_policy_snapshots'
        )
        AND engine = 'InnoDB'
        AND table_collation = 'utf8mb4_unicode_ci') = 5
    AND (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = 'customers'
            AND ((column_name='vip_tier_id' AND column_type='bigint unsigned' AND is_nullable='YES')
              OR (column_name='vip_qualified_spend_vnd' AND column_type='bigint unsigned'
                  AND is_nullable='NO' AND column_default='0'))) = 2
    AND (SELECT COUNT(*) FROM vip_tiers) = 4
    AND (SELECT COUNT(*) FROM vip_tiers
          WHERE (code='bronze' AND name='Bronze' AND priority=10 AND minimum_spend_vnd=0
                 AND base_deposit_percent=80.00 AND credit_limit_vnd IS NULL
                 AND deposit_policy_enabled=0 AND is_default=1 AND is_active=1)
             OR (code='silver' AND name='Silver' AND priority=20 AND minimum_spend_vnd=10000000
                 AND base_deposit_percent=70.00 AND credit_limit_vnd IS NULL
                 AND deposit_policy_enabled=0 AND is_default=0 AND is_active=1)
             OR (code='gold' AND name='Gold' AND priority=30 AND minimum_spend_vnd=50000000
                 AND base_deposit_percent=60.00 AND credit_limit_vnd IS NULL
                 AND deposit_policy_enabled=0 AND is_default=0 AND is_active=1)
             OR (code='platinum' AND name='Platinum' AND priority=40 AND minimum_spend_vnd=150000000
                 AND base_deposit_percent=50.00 AND credit_limit_vnd IS NULL
                 AND deposit_policy_enabled=0 AND is_default=0 AND is_active=1)) = 4
    AND (SELECT COUNT(*) FROM vip_tiers WHERE deposit_policy_enabled = 1) = 0
    AND (SELECT COUNT(*) FROM vip_tiers WHERE is_default = 1 AND is_active = 1) = 1
    AND (SELECT COUNT(*) FROM risk_deposit_policies) = 4
    AND (SELECT COUNT(*) FROM risk_deposit_policies
          WHERE minimum_deposit_percent IS NULL AND is_active=1
            AND ((code='low' AND name='Thấp' AND priority=10 AND requires_manager_approval=0)
              OR (code='medium' AND name='Trung bình' AND priority=20 AND requires_manager_approval=0)
              OR (code='high' AND name='Cao' AND priority=30 AND requires_manager_approval=0)
              OR (code='special' AND name='Đặc biệt' AND priority=40 AND requires_manager_approval=1))) = 4
    AND (SELECT COUNT(*) FROM risk_deposit_policies WHERE minimum_deposit_percent IS NOT NULL) = 0
    AND (SELECT COUNT(*) FROM customers
          WHERE vip_tier_id IS NOT NULL OR vip_qualified_spend_vnd <> 0) = 0
    AND (SELECT COUNT(*) FROM customer_vip_spend_events) = 0
    AND (SELECT COUNT(*) FROM customer_vip_histories) = 0
    AND (SELECT COUNT(*) FROM order_deposit_policy_snapshots) = 0
    AND (SELECT COUNT(*) FROM customers) = 12
    AND (SELECT COUNT(*) FROM orders) = 42
    AND (SELECT COUNT(*) FROM payment_vouchers) = 21
    AND (SELECT COUNT(*) FROM customer_balance_ledgers) = 1
    AND (SELECT COUNT(*) FROM sepay_webhook_events) = 1
    AND (SELECT COUNT(*) FROM payment_vouchers WHERE status='waiting_payment') = 5
    AND (SELECT COUNT(*) FROM orders WHERE status='pending') = 8
    AND (SELECT COUNT(*) FROM orders WHERE status='awaiting_deposit') = 3
    AND (SELECT COUNT(*) FROM customers WHERE vip_group IS NULL) = 2
    AND (SELECT COUNT(*) FROM customers WHERE vip_group='VIP Bronze') = 2
    AND (SELECT COUNT(*) FROM customers WHERE vip_group='VIP Silver') = 4
    AND (SELECT COUNT(*) FROM customers WHERE vip_group='VIP Gold') = 3
    AND (SELECT COUNT(*) FROM customers WHERE vip_group='VIP Platinum') = 1
    AND (SELECT COUNT(*) FROM information_schema.referential_constraints
          WHERE constraint_schema = DATABASE()
            AND constraint_name IN (
                'vip_tiers_updated_by_foreign', 'customers_vip_tier_id_foreign',
                'customer_vip_spend_events_customer_id_foreign',
                'customer_vip_spend_events_created_by_foreign',
                'customer_vip_histories_customer_id_foreign',
                'customer_vip_histories_from_vip_tier_id_foreign',
                'customer_vip_histories_to_vip_tier_id_foreign',
                'customer_vip_histories_changed_by_foreign',
                'risk_deposit_policies_updated_by_foreign',
                'order_deposit_policy_snapshots_order_id_foreign',
                'order_deposit_policy_snapshots_customer_id_foreign',
                'order_deposit_policy_snapshots_vip_tier_id_foreign',
                'order_deposit_policy_snapshots_risk_deposit_policy_id_foreign',
                'order_deposit_policy_snapshots_assessed_by_foreign',
                'order_deposit_policy_snapshots_approved_by_foreign'
            )) = 15
    AND (SELECT COUNT(*) FROM information_schema.table_constraints
          WHERE constraint_schema = DATABASE() AND constraint_type='UNIQUE'
            AND constraint_name IN (
                'vip_tiers_code_unique', 'vip_tiers_name_unique', 'vip_tiers_priority_unique',
                'vip_spend_source_event_unique',
                'risk_deposit_policies_code_unique', 'risk_deposit_policies_name_unique',
                'risk_deposit_policies_priority_unique',
                'order_deposit_policy_snapshots_order_id_unique'
            )) = 8
    AND (SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND index_name IN (
                'vip_tiers_is_active_minimum_spend_vnd_index',
                'customers_vip_tier_id_vip_qualified_spend_vnd_index',
                'customer_vip_spend_events_customer_id_occurred_at_index',
                'customer_vip_histories_customer_id_created_at_index'
            )) = 4
    AND NOT EXISTS (
        SELECT 1 FROM migrations
        WHERE migration = '2026_11_25_000051_create_vip_and_order_deposit_policy_domain'
    );

SELECT ROW_COUNT() AS migration_rows_inserted;
-- REQUIRED RESULT: migration_rows_inserted = 1.
-- If it is 0, STOP. Do not rerun the apply file. Inspect the verification results,
-- correct the cause through a separately reviewed action, then rerun only this file.

SELECT migration, batch
FROM migrations
WHERE migration = '2026_11_25_000051_create_vip_and_order_deposit_policy_domain';

