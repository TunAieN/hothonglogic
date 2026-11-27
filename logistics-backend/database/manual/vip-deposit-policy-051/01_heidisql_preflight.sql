-- VIP/deposit policy migration 051: HeidiSQL read-only preflight.
-- Execute this entire file first. Do not continue unless every gate is PASS.
-- This file performs no writes and no DDL.

USE `logistics_system`;

SELECT
    DATABASE() AS target_database,
    @@hostname AS server_host,
    @@port AS server_port,
    @@version AS mysql_version,
    CURRENT_USER() AS authenticated_account,
    CASE
        WHEN DATABASE() = 'logistics_system' AND @@port = 3310 THEN 'PASS'
        ELSE 'STOP'
    END AS target_gate;

SHOW GRANTS FOR CURRENT_USER();

SELECT
    COUNT(*) AS dependency_tables_matching,
    CASE WHEN COUNT(*) = 4 THEN 'PASS' ELSE 'STOP' END AS dependency_table_gate
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('users', 'customers', 'orders', 'migrations')
  AND engine = 'InnoDB'
  AND table_collation = 'utf8mb4_unicode_ci';

SELECT
    table_name,
    column_name,
    column_type,
    is_nullable,
    extra
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND (
      (table_name IN ('users', 'customers', 'orders') AND column_name = 'id')
      OR (table_name = 'customers' AND column_name = 'vip_group')
      OR (table_name = 'migrations' AND column_name IN ('id', 'migration', 'batch'))
  )
ORDER BY table_name, ordinal_position;

SELECT
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (
            'vip_tiers',
            'customer_vip_spend_events',
            'customer_vip_histories',
            'risk_deposit_policies',
            'order_deposit_policy_snapshots'
        )) AS target_tables_existing,
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'customers'
        AND column_name IN ('vip_tier_id', 'vip_qualified_spend_vnd')) AS target_columns_existing,
    (SELECT COUNT(*) FROM migrations
      WHERE migration = '2026_11_25_000051_create_vip_and_order_deposit_policy_domain') AS migration_rows_existing,
    CASE
        WHEN
            (SELECT COUNT(*) FROM information_schema.tables
              WHERE table_schema = DATABASE()
                AND table_name IN (
                    'vip_tiers',
                    'customer_vip_spend_events',
                    'customer_vip_histories',
                    'risk_deposit_policies',
                    'order_deposit_policy_snapshots'
                )) = 0
            AND (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_schema = DATABASE()
                    AND table_name = 'customers'
                    AND column_name IN ('vip_tier_id', 'vip_qualified_spend_vnd')) = 0
            AND (SELECT COUNT(*) FROM migrations
                  WHERE migration = '2026_11_25_000051_create_vip_and_order_deposit_policy_domain') = 0
        THEN 'PASS'
        ELSE 'STOP: existing or partially applied migration'
    END AS clean_start_gate;

SELECT
    COUNT(*) AS conflicting_constraint_or_index_names,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'STOP' END AS name_collision_gate
FROM (
    SELECT constraint_name AS object_name
    FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE()
      AND constraint_name IN (
          'vip_tiers_updated_by_foreign',
          'vip_tiers_code_unique',
          'vip_tiers_name_unique',
          'vip_tiers_priority_unique',
          'customers_vip_tier_id_foreign',
          'customer_vip_spend_events_customer_id_foreign',
          'customer_vip_spend_events_created_by_foreign',
          'vip_spend_source_event_unique',
          'customer_vip_histories_customer_id_foreign',
          'customer_vip_histories_from_vip_tier_id_foreign',
          'customer_vip_histories_to_vip_tier_id_foreign',
          'customer_vip_histories_changed_by_foreign',
          'risk_deposit_policies_updated_by_foreign',
          'risk_deposit_policies_code_unique',
          'risk_deposit_policies_name_unique',
          'risk_deposit_policies_priority_unique',
          'order_deposit_policy_snapshots_order_id_foreign',
          'order_deposit_policy_snapshots_order_id_unique',
          'order_deposit_policy_snapshots_customer_id_foreign',
          'order_deposit_policy_snapshots_vip_tier_id_foreign',
          'order_deposit_policy_snapshots_risk_deposit_policy_id_foreign',
          'order_deposit_policy_snapshots_assessed_by_foreign',
          'order_deposit_policy_snapshots_approved_by_foreign'
      )
    UNION ALL
    SELECT index_name
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND index_name IN (
          'vip_tiers_is_active_minimum_spend_vnd_index',
          'customers_vip_tier_id_vip_qualified_spend_vnd_index',
          'customer_vip_spend_events_customer_id_occurred_at_index',
          'customer_vip_histories_customer_id_created_at_index'
      )
) collisions;

SELECT 'customers' AS metric, COUNT(*) AS row_count FROM customers
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'payment_vouchers', COUNT(*) FROM payment_vouchers
UNION ALL SELECT 'customer_balance_ledgers', COUNT(*) FROM customer_balance_ledgers
UNION ALL SELECT 'sepay_webhook_events', COUNT(*) FROM sepay_webhook_events
UNION ALL SELECT 'waiting_payment_vouchers', COUNT(*) FROM payment_vouchers WHERE status = 'waiting_payment'
UNION ALL SELECT 'pending_orders', COUNT(*) FROM orders WHERE status = 'pending'
UNION ALL SELECT 'awaiting_deposit_orders', COUNT(*) FROM orders WHERE status = 'awaiting_deposit';

SELECT COALESCE(vip_group, '<NULL>') AS vip_group, COUNT(*) AS customers
FROM customers
GROUP BY vip_group
ORDER BY vip_group;

SELECT COALESCE(MAX(batch), 0) AS current_max_migration_batch,
       COUNT(*) AS migration_rows
FROM migrations;

-- Expected deployment baseline from 2026-11-26:
-- customers=12, orders=42, payment_vouchers=21,
-- customer_balance_ledgers=1, sepay_webhook_events=1,
-- target_tables_existing=0, target_columns_existing=0, migration_rows_existing=0.
-- STOP if the target, privilege, dependency, clean-start, or name-collision gate is not PASS.

