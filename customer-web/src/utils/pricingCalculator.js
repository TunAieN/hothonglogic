export const formatVnd = (value) => {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("vi-VN")} VNĐ`;
};

const parsePositiveNumber = (value, label, { allowZero = false } = {}) => {
  if (value === "" || value === null || value === undefined) {
    return { error: `Vui lòng nhập ${label}.` };
  }

  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const number = Number(normalized);

  if (!Number.isFinite(number)) return { error: `${label} không hợp lệ.` };
  if (allowZero ? number < 0 : number <= 0) {
    return { error: `${label} phải ${allowZero ? "lớn hơn hoặc bằng 0" : "lớn hơn 0"}.` };
  }

  return { value: number };
};

const findTier = (tiers, amount) => tiers.find((tier) => {
  const min = tier.min ?? 0;
  const max = tier.max ?? Number.POSITIVE_INFINITY;
  return amount >= min && amount <= max;
});

const calculatePurchaseFee = (goodsValueVnd, rule) => {
  if (rule.type === "percentage") return goodsValueVnd * rule.value;
  if (rule.type === "fixed") return rule.value;
  return null;
};

export const calculateEstimate = (input, config) => {
  const errors = [];
  const price = parsePositiveNumber(input.productPriceCny, "giá sản phẩm");
  const quantity = parsePositiveNumber(input.quantity, "số lượng");
  const shippingAmount = parsePositiveNumber(
    input.shippingAmount,
    input.shippingMode === "m3" ? "thể tích" : "trọng lượng",
  );

  if (price.error) errors.push(price.error);
  if (quantity.error) errors.push(quantity.error);
  if (shippingAmount.error) errors.push(shippingAmount.error);
  if (!input.destinationId) errors.push("Vui lòng chọn điểm nhận hàng.");

  if (errors.length) {
    return { status: "invalid", errors, missing: [], breakdown: null };
  }

  const missing = [];
  const exchangeRate = config.exchangeRate.value;
  const purchaseRules = config.purchaseFeeRules[input.customerType] || [];
  const shippingRates = config.shippingRates[input.shippingMode] || [];

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) missing.push("Tỷ giá CNY/VND");
  if (!purchaseRules.length) missing.push("Quy tắc phí mua hộ");
  if (!shippingRates.length) missing.push(`Đơn giá vận chuyển theo ${input.shippingMode === "m3" ? "m³" : "kg"}`);
  if (!config.destinations.some((item) => item.id === input.destinationId)) missing.push("Điểm nhận hàng hợp lệ");

  if (missing.length) {
    return { status: "incomplete", errors: [], missing, breakdown: null };
  }

  const goodsValueVnd = price.value * quantity.value * exchangeRate;
  const purchaseRule = findTier(purchaseRules, goodsValueVnd);
  const shippingRule = findTier(
    shippingRates.filter((rate) => rate.destinationId === input.destinationId),
    shippingAmount.value,
  );

  if (!purchaseRule) missing.push("Bậc phí mua hộ phù hợp");
  if (!shippingRule) missing.push("Bậc giá vận chuyển phù hợp");
  if (missing.length) return { status: "incomplete", errors: [], missing, breakdown: null };

  const purchaseFee = calculatePurchaseFee(goodsValueVnd, purchaseRule);
  const shippingFee = shippingAmount.value * shippingRule.pricePerUnit;
  if (!Number.isFinite(purchaseFee) || !Number.isFinite(shippingFee)) {
    return { status: "incomplete", errors: [], missing: ["Công thức phí hợp lệ"], breakdown: null };
  }

  const breakdown = {
    goodsValueVnd,
    purchaseFee,
    shippingFee,
    additionalFee: 0,
  };
  breakdown.total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);

  return { status: "ready", errors: [], missing: [], breakdown };
};
