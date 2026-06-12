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
  quantity: number;
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
  volume?: number | null;
  note?: string | null;
  status: string;
  created_by?: string | null;
  received_at?: string | null;
  created_at?: string | null;
  warehouse: CnWarehouse;
  order?: Pick<OrderSummary, "id" | "order_code" | "status"> & {
    customer?: Pick<Customer, "id" | "name" | "phone" | "email" | "address">;
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
  volume?: number | null;
  note?: string | null;
  status: string;
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
  volume?: number | null;
  note?: string | null;
  status?: string;
  received_at?: string | null;
}

export interface OrderSummary {
  id: string;
  order_code: string;
  customer_id?: string;
  customer: Pick<Customer, "id" | "name" | "email" | "phone" | "address" | "avatar">;
  creator: Pick<User, "id" | "name">;
  status: OrderStatus | string;
  total_amount: number;
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
  total_amount?: number;
  items?: OrderItemInput[];
  packages?: OrderPackageInput[];
  status?: OrderStatus | string;
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
