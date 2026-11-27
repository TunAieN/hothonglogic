-- Read-only preflight. No INSERT/UPDATE/DELETE/DDL statements are permitted here.
SELECT DATABASE() AS target_database, @@hostname AS server_host, @@port AS server_port;

SELECT COUNT(*) AS customer_count FROM customers;
SELECT COALESCE(NULLIF(TRIM(vip_group), ''), '<blank>') AS vip_group, COUNT(*) AS customers
FROM customers
GROUP BY COALESCE(NULLIF(TRIM(vip_group), ''), '<blank>')
ORDER BY customers DESC, vip_group;

SELECT id, code, name, email, phone, vip_group
FROM customers
WHERE vip_group IS NULL
   OR TRIM(vip_group) = ''
   OR LOWER(TRIM(vip_group)) NOT IN ('bronze', 'silver', 'gold', 'platinum')
ORDER BY id;

SELECT status, COUNT(*) AS orders, SUM(COALESCE(product_total_vnd, 0)) AS product_total_vnd
FROM orders
GROUP BY status
ORDER BY status;

SELECT o.id, o.order_code, o.status, o.deposit_percent, o.deposit_amount_vnd,
       o.deposit_paid_amount_vnd, o.deposit_remaining_amount_vnd,
       SUM(CASE WHEN pv.voucher_type = 'deposit' AND pv.cancelled_at IS NULL THEN 1 ELSE 0 END) AS active_deposit_vouchers
FROM orders o
LEFT JOIN payment_vouchers pv ON pv.order_id = o.id
WHERE o.status = 'awaiting_deposit'
GROUP BY o.id, o.order_code, o.status, o.deposit_percent, o.deposit_amount_vnd,
         o.deposit_paid_amount_vnd, o.deposit_remaining_amount_vnd
HAVING active_deposit_vouchers <> 1
ORDER BY o.id;

SELECT migration, batch
FROM migrations
WHERE migration = '2026_11_25_000051_create_vip_and_order_deposit_policy_domain';

