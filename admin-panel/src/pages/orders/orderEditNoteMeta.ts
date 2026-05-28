import type { OrderEditFormValues, OrderEditMeta, ShippingEntryFormValue } from "./orderEditTypes";

const META_START = "[order-edit-meta]";
const META_END = "[/order-edit-meta]";

const defaultShippingEntry = (): ShippingEntryFormValue => ({
  packageId: undefined,
  trackingCode: "",
  parcelValue: 0,
  shippingCompany: "vn-express",
  packagingType: "wooden-crating",
  packageNote: "",
  selectedItems: [],
});

export const getDefaultShippingEntry = defaultShippingEntry;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toStringValue = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const toNumberValue = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toShippingEntries = (value: unknown): ShippingEntryFormValue[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return [defaultShippingEntry()];
  }

  return value.map((entry) => {
    if (!isObject(entry)) {
      return defaultShippingEntry();
    }

    return {
      packageId: toStringValue(entry.packageId) || undefined,
      trackingCode: toStringValue(entry.trackingCode),
      parcelValue: toNumberValue(entry.parcelValue, 0),
      shippingCompany: toStringValue(entry.shippingCompany, "vn-express"),
      packagingType: toStringValue(entry.packagingType, "wooden-crating"),
      packageNote: toStringValue(entry.packageNote),
      selectedItems: Array.isArray(entry.selectedItems)
        ? entry.selectedItems
            .filter(isObject)
            .map((selectedItem) => ({
              orderItemId: toStringValue(selectedItem.orderItemId),
              quantity: Math.max(0, toNumberValue(selectedItem.quantity, 0)),
            }))
            .filter((selectedItem) => selectedItem.orderItemId && selectedItem.quantity > 0)
        : [],
    };
  });
};

export const parseOrderEditNote = (note?: string | null): {
  meta: Partial<OrderEditMeta>;
  plainNote: string;
} => {
  if (!note) {
    return { meta: {}, plainNote: "" };
  }

  const startIndex = note.indexOf(META_START);
  const endIndex = note.indexOf(META_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return { meta: {}, plainNote: note.trim() };
  }

  const rawMeta = note
    .slice(startIndex + META_START.length, endIndex)
    .trim();
  const plainNote = `${note.slice(0, startIndex)}${note.slice(endIndex + META_END.length)}`
    .trim();

  try {
    const parsed = JSON.parse(rawMeta) as unknown;

    if (!isObject(parsed)) {
      return { meta: {}, plainNote };
    }

    return {
      meta: {
        accountManagerId: toStringValue(parsed.accountManagerId) || undefined,
        customerId: toStringValue(parsed.customerId) || undefined,
        receiverName: toStringValue(parsed.receiverName),
        receiverPhone: toStringValue(parsed.receiverPhone),
        receiverAddress: toStringValue(parsed.receiverAddress),
        shippingMethod: toStringValue(parsed.shippingMethod, "normal"),
        shippingEntries: toShippingEntries(parsed.shippingEntries),
      },
      plainNote,
    };
  } catch {
    return { meta: {}, plainNote: note.trim() };
  }
};

export const serializeOrderEditNote = (values: OrderEditFormValues) => {
  const meta: OrderEditMeta = {
    accountManagerId: values.accountManagerId,
    customerId: values.customerId,
    receiverName: values.receiverName,
    receiverPhone: values.receiverPhone,
    receiverAddress: values.receiverAddress,
    shippingMethod: values.shippingMethod,
    shippingEntries:
      values.shippingEntries?.length > 0
        ? values.shippingEntries
        : [defaultShippingEntry()],
  };

  const metaBlock = `${META_START}\n${JSON.stringify(meta, null, 2)}\n${META_END}`;
  const plainNote = values.note?.trim();

  return plainNote ? `${metaBlock}\n\n${plainNote}` : metaBlock;
};
