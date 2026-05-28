import type { UploadFile } from "antd/es/upload/interface";

export type SelectOption = {
  label: string;
  value: string;
};

export type ShippingEntryFormValue = {
  packageId?: string;
  trackingCode: string;
  parcelValue?: number | null;
  shippingCompany?: string;
  packagingType?: string;
  packageNote?: string;
  selectedItems: ShippingEntryItemSelectionFormValue[];
};

export type ShippingEntryItemSelectionFormValue = {
  orderItemId: string;
  quantity: number;
};

export type OrderEditFormValues = {
  accountManagerId?: string;
  customerId?: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  shippingMethod?: string;
  shippingEntries: ShippingEntryFormValue[];
  note?: string;
  attachments?: UploadFile[];
};

export type OrderEditMeta = Omit<OrderEditFormValues, "attachments" | "note">;

export const SHIPPING_METHOD_OPTIONS: SelectOption[] = [
  { label: "Chậm (Normal Delivery)", value: "normal" },
  { label: "Nhanh (Priority Delivery)", value: "priority" },
  { label: "Hỏa tốc (Express Delivery)", value: "express" },
];

export const SHIPPING_COMPANY_OPTIONS: SelectOption[] = [
  { label: "VN Express", value: "vn-express" },
  { label: "J&T Express", value: "jt-express" },
  { label: "Giao Hàng Nhanh", value: "ghn" },
  { label: "DHL eCommerce", value: "dhl" },
];

export const PACKAGING_TYPE_OPTIONS: SelectOption[] = [
  { label: "Đóng gỗ (Wooden Crating)", value: "wooden-crating" },
  { label: "Carton tiêu chuẩn", value: "standard-carton" },
  { label: "Túi chống sốc", value: "shockproof-bag" },
  { label: "Kiện chống ẩm", value: "moisture-protection" },
];
