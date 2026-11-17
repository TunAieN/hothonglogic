export const selectionEntries = (groups, selection) => (groups || []).map((group) => ({
  group,
  value: group.values?.find((option) => option.value_id === selection?.[group.group_id]) || null,
}));

export function skuMatchesSelection(sku, selection, ignoredGroupId = null) {
  const selected = Object.entries(selection || {}).filter(([groupId, valueId]) => groupId !== ignoredGroupId && valueId);
  return selected.every(([groupId, valueId]) => sku.attributes?.some((attribute) => attribute.group_id === groupId && attribute.value_id === valueId));
}

export function optionIsSelectable(groupId, valueId, skus, selection, extractionComplete) {
  if (!extractionComplete || !(skus || []).length) return true;
  return skus.some((sku) => sku.availability !== false
    && skuMatchesSelection(sku, selection, groupId)
    && sku.attributes?.some((attribute) => attribute.group_id === groupId && attribute.value_id === valueId));
}

export function resolveSelectedSku(groups, skus, selection) {
  if (!(groups || []).length || Object.keys(selection || {}).length < groups.length) return null;
  return (skus || []).find((sku) => groups.every((group) => sku.attributes?.some((attribute) => attribute.group_id === group.group_id && attribute.value_id === selection[group.group_id]))) || null;
}

export function variantLabel(groups, selection) {
  return selectionEntries(groups, selection).map(({ group, value }) => value ? `${group.name}: ${value.label}` : null).filter(Boolean).join(" / ");
}

export function semanticValue(groups, selection, semantic) {
  return selectionEntries(groups, selection).find(({ group, value }) => group.semantic === semantic && value)?.value?.label || "";
}

export function priceForQuantity({ sku, productTiers = [], quantity, fallbackPrice = null }) {
  const tiers = sku?.quantity_price_tiers?.length ? sku.quantity_price_tiers : productTiers;
  const numericQuantity = Math.max(1, Number(quantity) || 1);
  const tier = [...(tiers || [])].filter((entry) => Number(entry.minimum_quantity) <= numericQuantity && entry.price_cny != null).sort((a, b) => Number(b.minimum_quantity) - Number(a.minimum_quantity))[0];
  return tier?.price_cny ?? sku?.price_cny ?? fallbackPrice ?? null;
}
