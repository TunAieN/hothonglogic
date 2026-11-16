# VietTrung Order business reconciliation report

Status: **REVIEW REQUIRED — NO DATA CHANGES APPLIED**

Source checked: `logistics_system` on the isolated MySQL 8.4 candidate at `127.0.0.1:3309`.

This report intentionally contains only internal record IDs, workflow status, and aggregate monetary differences. It excludes customer identity, contact details, credentials, tokens, bank references, notes, and record payloads.

## Order CNY discrepancies

Expected comparison: `orders.product_total_cny` against the sum of `order_items.subtotal_cny`.

| Order ID | Status | Stored CNY | Item CNY | Difference CNY |
|---:|---|---:|---:|---:|
| 11 | awaiting_tracking | 26.62 | 0.00 | 26.62 |
| 16 | receiving | 133.31 | 0.00 | 133.31 |
| 18 | receiving | 133.31 | 0.00 | 133.31 |
| 3078 | pending | 6.86 | 0.00 | 6.86 |
| 3079 | pending | 59.90 | 0.00 | 59.90 |
| 3282 | pending | 170.00 | 0.00 | 170.00 |

Summary: six orders. The two `receiving` differences total 266.62 CNY; the three `pending` differences total 236.76 CNY.

## Invoice VND discrepancies

Expected comparison: `invoices.total_amount` against the sum of `invoice_items.amount`.

| Invoice ID | Status | Stored VND | Item VND | Difference VND |
|---:|---|---:|---:|---:|
| 4 | issued | 272,500 | 272,520 | -20 |
| 76 | issued | 306,720 | 135,000 | 171,720 |
| 129 | issued | 11,250,531 | 11,802,159 | -551,628 |

Summary: three issued invoices. These must be reconciled with accounting before any automated correction is considered.

## Unmatched China package

| CN package ID | Status | Order ID | Linked item rows |
|---:|---|---:|---:|
| 14 | unmatched | NULL | 0 |

## Required decision

Business and accounting owners must either accept these as pre-existing exceptions for cutover or provide a separately reviewed correction plan. No correction should be bundled into the database cutover.
