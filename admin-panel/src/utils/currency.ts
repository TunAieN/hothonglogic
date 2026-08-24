export const toNumber = (value?: number | string | null) => Number(value ?? 0);

export const hasPositiveMoney = (value?: number | string | null) =>
  value !== null && value !== undefined && value !== "" && toNumber(value) > 0;

const hasValue = (value?: number | string | null) => value !== null && value !== undefined && value !== "";

export const resolveLegacyCnyTotal = <
  T extends {
    product_total_cny?: number | string | null;
    product_total_vnd?: number | string | null;
    total_amount?: number | string | null;
    exchange_rate_locked_at?: string | null;
  },
>(order?: T | null) => {
  if (!order) return 0;

  const productTotalCny = hasValue(order.product_total_cny) ? toNumber(order.product_total_cny) : null;
  const legacyTotal = hasValue(order.total_amount) ? toNumber(order.total_amount) : 0;

  // Compatibility layer for legacy rows before product_total_cny was backfilled.
  // Remove this fallback after orders.total_amount is retired from the order API.
  if (productTotalCny === null) return legacyTotal;
  if (productTotalCny !== 0) return productTotalCny;

  const hasLockedSnapshot = Boolean(order.exchange_rate_locked_at) || hasPositiveMoney(order.product_total_vnd);
  if (hasLockedSnapshot || legacyTotal === 0) return productTotalCny;

  return legacyTotal;
};

export const isExchangeRateLocked = <T extends { exchange_rate_locked_at?: string | null }>(order?: T | null) =>
  Boolean(order?.exchange_rate_locked_at);

export const formatCny = (value?: number | string | null) =>
  `${toNumber(value).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} CNY`;

export const formatVnd = (value?: number | string | null) =>
  `${Math.round(toNumber(value)).toLocaleString("vi-VN")} VND`;

export const formatExchangeRate = (value?: number | string | null) =>
  value === null || value === undefined || value === ""
    ? "Tỷ giá chưa được cập nhật"
    : `1 CNY = ${toNumber(value).toLocaleString("vi-VN")} VND`;
