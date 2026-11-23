import { beforeEach, describe, expect, it, vi } from "vitest";
import { __testing, addItem, deleteDraft, getCart, getDrafts, getOrCreateSubmission, getTotals, removeSubmittedSnapshot, restoreDraftToCart, saveDraft, updateItem } from "./customerLocalCart.js";

const item = (patch = {}) => ({ product_url: "https://item.taobao.com/item.htm?id=1", platform: "Taobao", title: "Áo", sku_id: "red-m", selected_attributes: { color: "Đỏ", size: "M" }, quantity: 1, reference_price_cny: 12.5, product_note: "Kiểm hàng", ...patch });

describe("customer local cart", () => {
  beforeEach(() => localStorage.clear());

  it("isolates carts by customer and survives a new read", () => {
    addItem(11, item());
    addItem(12, item({ title: "Khác", product_url: "https://detail.1688.com/offer/2.html" }));
    expect(getCart(11).items.map((entry) => entry.title)).toEqual(["Áo"]);
    expect(getCart(12).items.map((entry) => entry.title)).toEqual(["Khác"]);
  });

  it("keeps different SKUs separate and merges an identical SKU and note", () => {
    addItem(11, item());
    addItem(11, item({ quantity: 2 }));
    addItem(11, item({ sku_id: "blue-m", selected_attributes: { color: "Xanh", size: "M" }, quantity: 3 }));
    expect(getCart(11).items).toHaveLength(2);
    expect(getCart(11).items.map((entry) => entry.quantity)).toEqual([3, 3]);
  });

  it("preserves a null price and calculates only known totals", () => {
    addItem(11, item());
    addItem(11, item({ product_url: "https://item.taobao.com/item.htm?id=2", sku_id: null, selected_attributes: {}, reference_price_cny: null }));
    expect(getCart(11).items[1].reference_price_cny).toBeNull();
    expect(getTotals(getCart(11).items)).toMatchObject({ itemCount: 2, totalQuantity: 2, knownTotalCny: 12.5, unknownPriceCount: 1 });
  });

  it("updates quantity and note and safely handles broken storage", () => {
    const added = addItem(11, item()).item;
    updateItem(11, added.local_item_id, { quantity: 4, product_note: "Ghi chú mới" });
    expect(getCart(11).items[0]).toMatchObject({ quantity: 4, product_note: "Ghi chú mới" });
    localStorage.setItem(`${__testing.CART_PREFIX}11`, "{broken");
    expect(getCart(11).items).toEqual([]);
  });

  it("keeps items changed or added while a submitted snapshot is in flight", () => {
    const first = addItem(11, item()).item;
    const snapshot = getCart(11).items.map((entry) => ({ ...entry }));
    const submission = getOrCreateSubmission(11, snapshot, "note");
    expect(getOrCreateSubmission(11, snapshot, "note").idempotency_key).toBe(submission.idempotency_key);
    updateItem(11, first.local_item_id, { quantity: 5 });
    addItem(11, item({ product_url: "https://item.taobao.com/item.htm?id=9", sku_id: "new" }));
    removeSubmittedSnapshot(11, snapshot, submission.idempotency_key);
    expect(getCart(11).items).toHaveLength(2);
    expect(getCart(11).items[0].quantity).toBe(5);
  });

  it("reuses pending metadata across reads/tabs but starts a new submission after confirmed cleanup", () => {
    addItem(11, item());
    const snapshotA = getCart(11).items.map((entry) => ({ ...entry }));
    const submissionA = getOrCreateSubmission(11, snapshotA, "note A");

    expect(getOrCreateSubmission(11, getCart(11).items, "note A").idempotency_key).toBe(submissionA.idempotency_key);
    removeSubmittedSnapshot(11, snapshotA, submissionA.idempotency_key);
    expect(localStorage.getItem(`${__testing.SUBMISSION_PREFIX}11`)).toBeNull();

    addItem(11, item({ product_url: "https://item.taobao.com/item.htm?id=next", sku_id: "next-sku" }));
    const submissionB = getOrCreateSubmission(11, getCart(11).items, "note B");
    expect(submissionB.idempotency_key).not.toBe(submissionA.idempotency_key);
    expect(getOrCreateSubmission(11, getCart(11).items, "note B").idempotency_key).toBe(submissionB.idempotency_key);
  });

  it("removes only submitted selected items and preserves unselected cart rows", () => {
    addItem(11, item());
    addItem(11, item({ product_url: "https://item.taobao.com/item.htm?id=2", sku_id: "blue-l" }));
    const snapshot = [getCart(11).items[0]];
    const submission = getOrCreateSubmission(11, snapshot, "");
    removeSubmittedSnapshot(11, snapshot, submission.idempotency_key);
    expect(getCart(11).items).toHaveLength(1);
    expect(getCart(11).items[0].sku_id).toBe("blue-l");
  });

  it("saves isolated draft snapshots, restores by merging and deletes without changing the cart", () => {
    addItem(11, item());
    const draft = saveDraft(11, getCart(11).items, "Gom đơn", "Nháp áo");
    expect(getDrafts(11)[0]).toMatchObject({ draft_id: draft.draft_id, title: "Nháp áo", request_note: "Gom đơn" });
    addItem(11, item({ product_url: "https://item.taobao.com/item.htm?id=2", sku_id: "other" }));
    restoreDraftToCart(11, draft.draft_id);
    expect(getCart(11).items).toHaveLength(2);
    expect(getCart(11).items[0].quantity).toBe(2);
    deleteDraft(11, draft.draft_id);
    expect(getDrafts(11)).toEqual([]);
    expect(getCart(11).items).toHaveLength(2);
  });

  it("reports blocked storage writes", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(() => addItem(11, item())).toThrow("Không thể lưu giỏ hàng");
  });
});
