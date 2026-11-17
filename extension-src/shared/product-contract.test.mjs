import assert from "node:assert/strict";
import test from "node:test";
import "./product-contract.js";

const contract = globalThis.VietTrungProductContract;

test("detects and normalizes supported marketplace URLs", () => {
  assert.equal(contract.platformForUrl("https://detail.1688.com/offer/123.html"), "1688");
  assert.equal(contract.normalizeUrl("https://item.taobao.com/item.htm?id=123&utm_source=test#detail"), "https://item.taobao.com/item.htm?id=123");
  assert.throws(() => contract.normalizeUrl("http://127.0.0.1/internal"), /UNSUPPORTED_PRODUCT_URL/);
});

test("normalizes nullable prices and structured SKU combinations without fabricating values", () => {
  const product = contract.normalizeProduct({
    url: "https://detail.tmall.com/item.htm?id=456",
    title: "Áo thử nghiệm",
    images: ["//img.example.test/a.jpg"],
    skus: [{ id: "red-l", label: "Đỏ / L", color: "Đỏ", size: "L", price: "88.50", availability: true }],
  }, { requestId: "request123" });
  assert.equal(product.request_id, "request123");
  assert.equal(product.price_cny, null);
  assert.deepEqual(product.skus[0], { sku_id: "red-l", combination_id: null, label: "Đỏ / L", attributes: [], color: "Đỏ", size: "L", price_cny: 88.5, image: null, availability: true, minimum_quantity: null, quantity_price_tiers: [] });
});

test("does not mark a verified simple product partial merely because skus are empty", () => {
  const product = contract.normalizeProduct({
    url: "https://detail.tmall.com/item.htm?id=789", title: "Sản phẩm đơn giản", image: "https://img.test/simple.jpg", price: "9.89",
    has_variants: false, sku_extraction_complete: true, skus: [], attribute_groups: [],
  });
  assert.equal(product.extraction_status, "success");
  assert.equal(product.missing_fields.includes("skus"), false);
});

test("keeps partial status when variant groups exist but combinations are incomplete", () => {
  const product = contract.normalizeProduct({
    url: "https://item.taobao.com/item.htm?id=999", title: "Sản phẩm có biến thể", image: "https://img.test/a.jpg", price: "10",
    has_variants: true, sku_extraction_complete: false, skus: [], attribute_groups: [{ name: "型号", values: [{ label: "A" }] }],
  });
  assert.equal(product.extraction_status, "partial");
  assert.deepEqual(product.missing_fields, ["skus"]);
  assert.equal(product.skus.length, 0);
});
