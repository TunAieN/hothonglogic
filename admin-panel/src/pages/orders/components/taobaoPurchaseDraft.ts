import type { OrderItem } from "../../../shared/types";

export type PurchaseDraftLine = { order_item_id: string; quantity: number };
export type PurchaseDraft = { items: PurchaseDraftLine[] };

export function allocationByItem(purchases: PurchaseDraft[]) {
  const totals = new Map<string, number>();
  purchases.forEach((purchase) => purchase.items.forEach((line) => {
    const itemId = String(line.order_item_id);
    totals.set(itemId, (totals.get(itemId) ?? 0) + Math.max(0, Number(line.quantity) || 0));
  }));
  return totals;
}

export function allocationOutsidePurchase(purchases: PurchaseDraft[], purchaseIndex: number, itemId: string) {
  return purchases.reduce((total, purchase, index) => index === purchaseIndex
    ? total
    : total + (purchase.items.find((line) => String(line.order_item_id) === String(itemId))?.quantity ?? 0), 0);
}

export function availableQuantity(item: OrderItem, purchases: PurchaseDraft[], purchaseIndex?: number) {
  const allocated = purchaseIndex === undefined
    ? allocationByItem(purchases).get(String(item.id)) ?? 0
    : allocationOutsidePurchase(purchases, purchaseIndex, item.id);
  return Math.max(0, Number(item.quantity) - allocated);
}

export function selectableItems(items: OrderItem[], purchases: PurchaseDraft[], purchaseIndex: number) {
  const selected = new Set(purchases[purchaseIndex]?.items.map((line) => String(line.order_item_id)) ?? []);
  return items.filter((item) => !selected.has(String(item.id)) && availableQuantity(item, purchases) > 0);
}

export function purchaseDraftTotals(items: OrderItem[], purchases: PurchaseDraft[]) {
  const purchasedByItem = allocationByItem(purchases);
  const ordered = items.reduce((sum, item) => sum + Number(item.quantity), 0);
  const bought = [...purchasedByItem.values()].reduce((sum, value) => sum + value, 0);
  return { ordered, bought, remaining: Math.max(0, ordered - bought), purchasedByItem };
}
