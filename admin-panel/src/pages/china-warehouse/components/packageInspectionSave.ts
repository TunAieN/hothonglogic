export type ItemQuantity = { order_item_id: string; quantity: number };

export const getInspectionChanges = (selected: ItemQuantity[], saved: Map<string, number>) =>
  selected.filter((item) => saved.get(item.order_item_id) !== item.quantity);

export const mergeInspectionItems = (saved: Map<string, number>, changes: ItemQuantity[]) => {
  const next = new Map(saved);
  changes.forEach((item) => next.set(item.order_item_id, item.quantity));
  return Array.from(next, ([order_item_id, quantity]) => ({ order_item_id, quantity }));
};
