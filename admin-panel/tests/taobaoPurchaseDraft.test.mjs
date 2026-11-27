import test from "node:test";
import assert from "node:assert/strict";
import {
  allocationOutsidePurchase,
  availableQuantity,
  purchaseDraftTotals,
  selectableItems,
} from "../src/pages/orders/components/taobaoPurchaseDraft.ts";

const items = [
  { id: "A", product_name: "Sản phẩm A", quantity: 10 },
  { id: "B", product_name: "Sản phẩm B", quantity: 1 },
];

test("dropdown starts with every unallocated product and hides selected items in the same card", () => {
  const drafts = [{ items: [] }];
  assert.deepEqual(selectableItems(items, drafts, 0).map((item) => item.id), ["A", "B"]);
  drafts[0].items.push({ order_item_id: "A", quantity: 6 });
  assert.deepEqual(selectableItems(items, drafts, 0).map((item) => item.id), ["B"]);
});

test("a partial allocation remains selectable in another purchase with the exact remainder", () => {
  const drafts = [{ items: [{ order_item_id: "A", quantity: 6 }] }, { items: [] }];
  assert.equal(availableQuantity(items[0], drafts), 4);
  assert.deepEqual(selectableItems(items, drafts, 1).map((item) => item.id), ["A", "B"]);
});

test("a fully allocated product disappears from later purchase dropdowns", () => {
  const drafts = [{ items: [{ order_item_id: "A", quantity: 6 }] }, { items: [{ order_item_id: "A", quantity: 4 }] }, { items: [] }];
  assert.equal(availableQuantity(items[0], drafts), 0);
  assert.deepEqual(selectableItems(items, drafts, 2).map((item) => item.id), ["B"]);
});

test("editing a card excludes its own quantity when calculating its maximum", () => {
  const drafts = [{ items: [{ order_item_id: "A", quantity: 6 }] }, { items: [{ order_item_id: "A", quantity: 3 }] }];
  assert.equal(allocationOutsidePurchase(drafts, 1, "A"), 6);
  assert.equal(availableQuantity(items[0], drafts, 1), 4);
});

test("removing or reducing a line immediately restores remaining quantities and progress", () => {
  const drafts = [{ items: [{ order_item_id: "A", quantity: 10 }, { order_item_id: "B", quantity: 1 }] }];
  assert.deepEqual(purchaseDraftTotals(items, drafts), {
    ordered: 11,
    bought: 11,
    remaining: 0,
    purchasedByItem: new Map([["A", 10], ["B", 1]]),
  });
  drafts[0].items = [{ order_item_id: "A", quantity: 5 }];
  const totals = purchaseDraftTotals(items, drafts);
  assert.equal(totals.bought, 5);
  assert.equal(totals.remaining, 6);
  assert.equal(availableQuantity(items[1], drafts), 1);
});
