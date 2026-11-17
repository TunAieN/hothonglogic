import assert from "node:assert/strict";
import test from "node:test";
import "./sku-extractor.js";

const extractor = globalThis.VietTrungSkuExtractor;
const baseUrl = "https://detail.tmall.com/item.htm?id=123";
const groups = [
  { pid: "1", name: "颜色分类", values: [{ vid: "11", name: "红色", image: "//img.test/red.jpg" }, { vid: "12", name: "蓝色" }] },
  { pid: "2", name: "尺码", values: [{ vid: "21", name: "S" }, { vid: "22", name: "L" }] },
];

test("Taobao preserves one verified SKU without inventing an image or price", () => {
  const result = extractor.normalizeContainer({
    skuBase: {
      props: [{ pid: "7", name: "型号", values: [{ vid: "71", name: "标准版" }] }],
      skus: [{ skuId: "tb-one", propPath: "7:71" }],
    },
    skuCore: { sku2info: { "tb-one": {} } },
  }, "https://item.taobao.com/item.htm?id=123");
  assert.equal(result.skus.length, 1);
  assert.equal(result.skus[0].sku_id, "tb-one");
  assert.equal(result.skus[0].price_cny, null);
  assert.equal(result.skus[0].image, null);
});

test("Taobao keeps only the multiple combinations supplied by the page", () => {
  const result = extractor.normalizeContainer({
    skuBase: { props: groups, skus: [{ skuId: "tb-red-s", propPath: "1:11;2:21" }, { skuId: "tb-blue-l", propPath: "1:12;2:22" }] },
    skuCore: { sku2info: { "tb-red-s": { price: "10" }, "tb-blue-l": { price: "12" } } },
  }, "https://item.taobao.com/item.htm?id=456");
  assert.deepEqual(result.skus.map((sku) => sku.sku_id), ["tb-red-s", "tb-blue-l"]);
  assert.equal(result.skus.length, 2);
});

test("Tmall maps verified multi-attribute SKU IDs, prices, images and stock", () => {
  const result = extractor.normalizeContainer({
    skuBase: { props: groups, skus: [{ skuId: "101", propPath: "1:11;2:21" }, { skuId: "102", propPath: "1:12;2:22" }] },
    skuCore: { sku2info: { 101: { price: { priceText: "9.89" }, quantity: 3 }, 102: { price: { priceText: "12.50" }, quantity: 0 } } },
  }, baseUrl);
  assert.equal(result.sku_extraction_complete, true);
  assert.equal(result.skus.length, 2);
  assert.deepEqual(result.skus[0].attributes.map(({ name, value }) => ({ name, value })), [{ name: "颜色分类", value: "红色" }, { name: "尺码", value: "S" }]);
  assert.equal(result.skus[0].price_cny, 9.89);
  assert.equal(result.skus[0].image, "https://img.test/red.jpg");
  assert.equal(result.skus[1].availability, false);
});

test("does not create a Cartesian product for missing combinations", () => {
  const result = extractor.normalizeContainer({ skuBase: { props: groups, skus: [{ skuId: "only-real", propPath: "1:11;2:22" }] }, skuCore: { sku2info: { "only-real": { price: "15" } } } }, baseUrl);
  assert.equal(result.skus.length, 1);
  assert.equal(result.skus[0].sku_id, "only-real");
});

test("supports a single generic Tmall attribute without forcing color or size", () => {
  const result = extractor.normalizeContainer({
    skuBase: { props: [{ pid: "3", name: "净含量", values: [{ vid: "31", name: "500ml" }] }], skus: [{ skuId: "volume-500", propPath: "3:31" }] },
    skuCore: { sku2info: { "volume-500": {} } },
  }, baseUrl);
  assert.equal(result.attribute_groups[0].semantic, null);
  assert.equal(result.skus[0].color, null);
  assert.equal(result.skus[0].size, null);
  assert.equal(result.skus[0].price_cny, null);
});

test("supports 1688 explicit combinations and quantity price tiers", () => {
  const result = extractor.normalizeContainer({ skuModel: {
    skuProps: [{ prop: "规格", values: [{ value: "整箱", id: "box" }, { value: "单个", id: "single" }] }],
    skuInfoMap: { "整箱": { skuId: "box-sku", price: "80", amountOnSale: 5 }, "单个": { skuId: "single-sku", price: "9", amountOnSale: 0 } },
    skuRangePrices: [{ startQuantity: 1, price: "9" }, { startQuantity: 10, price: "8.2" }],
  } }, "https://detail.1688.com/offer/456.html");
  assert.equal(result.skus.length, 2);
  assert.equal(result.skus[1].availability, false);
  assert.deepEqual(result.quantity_price_tiers, [{ minimum_quantity: 1, price_cny: 9 }, { minimum_quantity: 10, price_cny: 8.2 }]);
});

test("drops invalid SKU entries without a verified SKU ID", () => {
  const result = extractor.normalizeContainer({ skuBase: { props: groups, skus: [{ propPath: "1:11;2:21" }] } }, baseUrl);
  assert.deepEqual(result.skus, []);
  assert.equal(result.has_variants, true);
  assert.equal(result.sku_extraction_complete, false);
});

test("reads balanced embedded SKU objects without evaluating page JavaScript", () => {
  const source = 'window.__DATA__={"skuBase":{"skus":[{"skuId":"safe"}]}},window.dangerous=alert(1);';
  assert.deepEqual(extractor.balancedValue(source, '"skuBase"'), { skus: [{ skuId: "safe" }] });
});
