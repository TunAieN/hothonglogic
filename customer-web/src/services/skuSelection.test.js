import { describe, expect, it } from "vitest";
import { optionIsSelectable, priceForQuantity, resolveSelectedSku, variantLabel } from "./skuSelection.js";

const groups = [
  { group_id: "color", name: "颜色分类", semantic: "color", values: [{ value_id: "red", label: "红色" }, { value_id: "blue", label: "蓝色" }] },
  { group_id: "size", name: "尺码", semantic: "size", values: [{ value_id: "s", label: "S" }, { value_id: "l", label: "L" }] },
];
const skus = [
  { sku_id: "red-s", attributes: [{ group_id: "color", value_id: "red" }, { group_id: "size", value_id: "s" }], price_cny: 10, availability: true },
  { sku_id: "blue-l", attributes: [{ group_id: "color", value_id: "blue" }, { group_id: "size", value_id: "l" }], price_cny: 12, availability: false },
];

describe("SKU selection", () => {
  it("resolves only an explicitly supplied valid combination", () => {
    expect(resolveSelectedSku(groups, skus, { color: "red", size: "s" })?.sku_id).toBe("red-s");
    expect(resolveSelectedSku(groups, skus, { color: "red", size: "l" })).toBeNull();
  });

  it("disables invalid and verified out-of-stock options without inventing combinations", () => {
    expect(optionIsSelectable("size", "s", skus, { color: "red" }, true)).toBe(true);
    expect(optionIsSelectable("size", "l", skus, { color: "red" }, true)).toBe(false);
    expect(optionIsSelectable("size", "l", skus, { color: "red" }, false)).toBe(true);
  });

  it("updates labels and SKU prices from the selected combination", () => {
    expect(variantLabel(groups, { color: "red", size: "s" })).toBe("颜色分类: 红色 / 尺码: S");
    expect(priceForQuantity({ sku: skus[0], quantity: 1, fallbackPrice: 9 })).toBe(10);
  });

  it("applies the highest verified 1688 quantity tier", () => {
    expect(priceForQuantity({ productTiers: [{ minimum_quantity: 1, price_cny: 9 }, { minimum_quantity: 10, price_cny: 8.2 }], quantity: 12, fallbackPrice: 10 })).toBe(8.2);
  });
});
