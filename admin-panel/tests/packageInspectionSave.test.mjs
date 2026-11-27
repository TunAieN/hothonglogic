import test from "node:test";
import assert from "node:assert/strict";
import { getInspectionChanges, mergeInspectionItems } from "../src/pages/china-warehouse/components/packageInspectionSave.ts";

test("reordered or unchanged inspection selections do not need a write", () => {
  const saved = new Map([["1", 2], ["2", 3]]);
  const items = [{ order_item_id: "2", quantity: 3 }, { order_item_id: "1", quantity: 2 }];
  assert.deepEqual(getInspectionChanges(items, saved), []);
});

test("update and addition keep other saved inspection items and leave the old snapshot intact", () => {
  const saved = new Map([["1", 2], ["2", 3]]);
  const items = [{ order_item_id: "2", quantity: 4 }, { order_item_id: "3", quantity: 1 }];
  assert.deepEqual(getInspectionChanges(items, saved), items);
  assert.deepEqual(mergeInspectionItems(saved, items), [{ order_item_id: "1", quantity: 2 }, ...items]);
  assert.deepEqual([...saved], [["1", 2], ["2", 3]]);
});
