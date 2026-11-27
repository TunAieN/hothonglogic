-- Run only after an explicitly approved scoped migration 051.
SELECT migration, batch
FROM migrations
WHERE migration = '2026_11_25_000051_create_vip_and_order_deposit_policy_domain';

SELECT code, name, priority, minimum_spend_vnd, base_deposit_percent,
       credit_limit_vnd, deposit_policy_enabled, is_default, is_active
FROM vip_tiers
ORDER BY priority;

SELECT code, name, priority, minimum_deposit_percent, requires_manager_approval, is_active
FROM risk_deposit_policies
ORDER BY priority;

SELECT SUM(is_default = 1 AND is_active = 1) AS active_default_tiers,
       SUM(deposit_policy_enabled = 1) AS financially_enabled_tiers
FROM vip_tiers;

SELECT COUNT(*) AS customers_changed_unexpectedly
FROM customers
WHERE vip_tier_id IS NOT NULL OR vip_qualified_spend_vnd <> 0;

SELECT COUNT(*) AS spend_events FROM customer_vip_spend_events;
SELECT COUNT(*) AS tier_histories FROM customer_vip_histories;
SELECT COUNT(*) AS deposit_policy_snapshots FROM order_deposit_policy_snapshots;

