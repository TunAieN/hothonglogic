import type { User } from "./common";
import type { Customer } from "./customer";

export type OrderStatus =
  | "draft"
  | "pending"
  | "awaiting_deposit"
  | "deposited"
  | "purchasing"
  | "awaiting_tracking"
  | "waiting_cn_warehouse"
  | "receiving"
  | "shipped"
  | "delivered"
  | "completed"
  | "complaint"
  | "cancelled"
  | "awaiting_tracking";

export interface OrderItem {
  id: string;
  product_name: string;
  product_link?: string | null;
  price_cny: number;
  exchange_rate?: number | null;
  unit_price_vnd?: number | null;
  quantity: number;
  subtotal_cny?: number | null;
  subtotal_vnd?: number | null;
  note?: string | null;
  product_image?: string | null;
  seller?: string | null;
  shop_id?: string | null;
  shop_name?: string | null;
  size?: string | null;
  color?: string | null;
}

export interface OrderItemInput {
  product_name: string;
  product_link?: string | null;
  price_cny: number;
  quantity: number;
  note?: string | null;
  product_image?: string | null;
  seller?: string | null;
  shop_id?: string | null;
  shop_name?: string | null;
  size?: string | null;
  color?: string | null;
}

export interface CnPackageItem {
  id: string;
  cn_package_id: string;
  order_item_id: string;
  quantity: number;
  order_item: OrderItem;
}

export interface CnWarehouse {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  status?: string | null;
}

export type CnBatchStatus =
  | "pending"
  | "exporting"
  | "arrived_vn"
  | "completed"
  | "cancelled";

export interface CnBatch {
  id: string;
  batch_code: string;
  warehouse_id: string;
  destination_warehouse_name?: string | null;
  total_packages?: number | null;
  status: CnBatchStatus;
  shipping_type: "fast" | "normal";
  departed_at?: string | null;
  expected_arrival_at?: string | null;
  arrived_at?: string | null;
  total_weight?: number | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  warehouse: CnWarehouse;
  packages?: CnPackage[];
}

export interface CnBatchPackage {
  id: string;
  cn_batch_id: string;
  cn_package_id: string;
  batch: CnBatch;
  package?: CnPackage;
}

export interface CnBatchCreateInput {
  destination_warehouse_name?: string | null;
  shipping_type?: "fast" | "normal";
  departed_at?: string | null;
  expected_arrival_at?: string | null;
  arrived_at?: string | null;
  note?: string | null;
  status?: CnBatchStatus;
}

export interface CnBatchUpdateInput extends CnBatchCreateInput {}

export interface CnPackage {
  id: string;
  warehouse_id: string;
  order_tracking_id?: string | null;
  order_id?: string | null;
  receiver_name?: string | null;
  tracking_number?: string | null;
  declared_value?: number | null;
  carrier?: string | null;
  weight?: number | null;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
  volume?: number | null;
  volumetric_weight?: number | null;
  chargeable_weight?: number | null;
  note?: string | null;
  status: string;
  package_condition?: string | null;
  created_by?: string | null;
  received_at?: string | null;
  created_at?: string | null;
  warehouse: CnWarehouse;
  order?: Pick<OrderSummary, "id" | "order_code" | "status"> & {
    customer?: Pick<Customer, "id" | "name" | "phone" | "email" | "address">;
    items?: OrderItem[];
  };
  order_tracking?: OrderTracking | null;
  current_batch_package?: CnBatchPackage | null;
  package_items?: CnPackageItem[];
}

export interface OrderTracking {
  id: string;
  order_id: string;
  tracking_number: string;
  carrier?: string | null;
  declared_value?: number | null;
  dispatched_at?: string | null;
  note?: string | null;
  status: string;
  tracking_items?: OrderTrackingItem[];
}

export interface OrderTrackingItem {
  id: string;
  order_tracking_id: string;
  order_item_id: string;
  quantity: number;
  order_item: OrderItem;
}

export interface CnPackageCreateInput {
  warehouse_id?: string;
  warehouse_code?: string;
  warehouse_name: string;
  receiver_name: string;
  tracking_number: string;
  declared_value?: number | null;
  carrier?: string | null;
  weight: number;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
  volume?: number | null;
  volumetric_weight?: number | null;
  chargeable_weight?: number | null;
  note?: string | null;
  status: string;
  package_condition?: string | null;
  received_at: string | null;
}

export interface CnPackageUpdateInput {
  warehouse_id?: string;
  warehouse_code?: string;
  warehouse_name?: string;
  receiver_name?: string;
  tracking_number?: string;
  declared_value?: number | null;
  carrier?: string | null;
  weight?: number;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
  volume?: number | null;
  volumetric_weight?: number | null;
  chargeable_weight?: number | null;
  note?: string | null;
  status?: string;
  package_condition?: string | null;
  received_at?: string | null;
}

export interface OrderDepositTransaction {
  id: string;
  transaction_code: string;
  amount: number;
  payment_method: string;
  bank_name?: string | null;
  bank_transaction_code?: string | null;
  received_at?: string | null;
  confirmed_by?: string | null;
  status: string;
  note?: string | null;
  created_at?: string | null;
}

export interface OrderDepositVoucher {
  id: string;
  voucher_code: string;
  voucher_type: string;
  status: string;
  currency: string;
  base_amount_cny?: number | null;
  exchange_rate?: number | null;
  base_amount_vnd?: number | null;
  deposit_percent?: number | null;
  total_amount?: number | null;
  paid_amount?: number | null;
  remaining_amount?: number | null;
  bank_name_snapshot?: string | null;
  bank_account_number_snapshot?: string | null;
  bank_account_holder_snapshot?: string | null;
  bank_branch_name_snapshot?: string | null;
  transfer_content?: string | null;
  created_at?: string | null;
  transactions?: OrderDepositTransaction[];
  invoice?: {
    id: string;
    invoice_code: string;
    invoice_type: string;
    status: string;
    total_amount: number;
    paid_amount: number;
    issued_at?: string | null;
  } | null;
}
export interface OrderSummary {
  id: string;
  order_code: string;
  customer_id?: string;
  customer: Pick<Customer, "id" | "name" | "email" | "phone" | "address" | "avatar">;
  creator: Pick<User, "id" | "name">;
  status: OrderStatus | string;
  total_amount: number;
  exchange_rate?: number | null;
  product_total_cny?: number | null;
  product_total_vnd?: number | null;
  currency?: string | null;
  exchange_rate_locked_at?: string | null;
  deposit_percent?: number | null;
  deposit_amount_vnd?: number | null;
  deposit_paid_amount_vnd?: number | null;
  deposit_remaining_amount_vnd?: number | null;
  deposit_status?: string | null;
  deposit_transfer_content?: string | null;
  deposit_requested_at?: string | null;
  deposit_paid_at?: string | null;
  depositVoucher?: OrderDepositVoucher | null;
  note?: string | null;
  created_at: string;
  items: OrderItem[];
  order_trackings?: OrderTracking[];
  cn_packages?: CnPackage[];
}

export interface Order extends OrderSummary {
  customer: Customer;
  creator: Pick<User, "id" | "name">;
  items: OrderItem[];
}

export interface OrderCreateInput {
  customer_id: string;
  note?: string | null;
  items: OrderItemInput[];
}

export interface OrderUpdateInput {
  customer_id?: string;
  account_manager_id?: string;
  items?: OrderItemInput[];
  packages?: OrderPackageInput[];
  status?: OrderStatus | string;
  deposit_percent?: number;
  note?: string | null;
}

export interface OrderPackageItemInput {
  order_item_id: string;
  quantity: number;
}

export interface OrderPackageInput {
  id?: string;
  tracking_number?: string | null;
  declared_value?: number | null;
  carrier?: string | null;
  dispatched_at?: string | null;
  note?: string | null;
  package_items?: OrderPackageItemInput[];
  tracking_items?: OrderPackageItemInput[];
}
