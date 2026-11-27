import type { Role, User } from "./common";
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
  packaging_type?: "bag" | "carton" | "cardboard" | "wood" | null;
  transport_container_count?: number | null;
  departed_at?: string | null;
  expected_arrival_at?: string | null;
  arrived_at?: string | null;
  total_weight?: number | null;
  actual_batch_weight?: number | null;
  package_material_weight?: number | null;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
  actual_volume?: number | null;
  carrier_name?: string | null;
  transport_code?: string | null;
  route_name?: string | null;
  vehicle_plate?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  freight_cost?: number | null;
  handed_over_by?: string | null;
  handed_over_at?: string | null;
  dispatch_note?: string | null;
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

export interface CnBatchPackageUpdateInput {
  id?: string;
  tracking_number: string;
  weight: number;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
}

export interface CnBatchUpdateInput extends CnBatchCreateInput {
  freight_cost?: number | null;
  packages?: CnBatchPackageUpdateInput[];
}

export interface CnPackage {
  id: string;
  warehouse_id: string;
  order_tracking_id?: string | null;
  order_id?: string | null;
  receiver_name?: string | null;
  receiver_user_id?: string | null;
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
  receiver?: Pick<User, "id" | "name" | "email"> & { phone?: string | null; role?: Role | null };
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
  taobao_purchase_orders?: Array<{ id: string; external_order_code: string; shop_name?: string | null }>;
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
  warehouse_name?: string;
  receiver_name?: string;
  receiver_user_id: string;
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
  receiver_user_id?: string;
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
  confirmation_source?: string | null;
  provider?: string | null;
  provider_transaction_id?: string | null;
}

export interface DepositPaymentAutomation {
  enabled: boolean;
  intent?: {
    reference: string; amount_vnd: number; status: string; display_status: string;
    expires_at?: string | null; created_at?: string | null; completed_at?: string | null;
    qr_url?: string | null; bank_name?: string | null; bank_code?: string | null;
    account_number?: string | null; account_holder?: string | null;
  } | null;
  latest_event?: {
    provider_transaction_id: string; status: string; reconciliation_reason?: string | null;
    amount_vnd?: number | null; occurred_at?: string | null; processed_at?: string | null;
  } | null;
  notifications: Array<{
    id: string; type: string; channel: string; status: string; title: string; body: string;
    sent_by?: string | null; sent_at?: string | null; read_at?: string | null; created_at?: string | null;
  }>;
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
  paymentAutomation?: DepositPaymentAutomation | null;
}
export interface OrderSummary {
  id: string;
  order_code: string;
  customer_id?: string;
  customer: Pick<Customer, "id" | "name" | "email" | "phone" | "address" | "avatar" | "vip_group" | "vipTier">;
  creator?: Pick<User, "id" | "name"> | null;
  accountManager?: Pick<User, "id" | "name"> | null;
  creation_source?: "legacy" | "admin_portal" | "customer_portal" | string;
  submitted_at?: string | null;
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
  depositPolicySnapshot?: {
    id: string; vip_code?: string | null; vip_name?: string | null; qualified_spend_vnd: number;
    vip_deposit_percent?: number | null; risk_code: string; risk_name: string; risk_reason: string;
    risk_minimum_percent?: number | null; capital_minimum_percent?: number | null; base_amount_vnd: number;
    recommended_percent: number; final_percent: number; deposit_waived: boolean; is_exception: boolean;
    exception_reason?: string | null; assessed_by: string; approved_by?: string | null; assessed_at: string;
    approved_at?: string | null; voucher_issued_at?: string | null;
  } | null;
  deliveryRequest?: {
    id: string;
    delivery_note?: string | null;
    address?: {
      source_customer_address_id?: string | null;
      receiver_name: string;
      receiver_phone: string;
      country_code?: string | null;
      country_name?: string | null;
      province_code?: string | null;
      province_name?: string | null;
      district_code?: string | null;
      district_name?: string | null;
      ward_code?: string | null;
      ward_name?: string | null;
      address_line?: string | null;
      full_address?: string | null;
    } | null;
  } | null;
  note?: string | null;
  created_at: string;
  items: OrderItem[];
  order_trackings?: OrderTracking[];
  cn_packages?: CnPackage[];
}

export interface Order extends OrderSummary {
  customer: Customer;
  creator?: Pick<User, "id" | "name"> | null;
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
  risk_level?: string;
  risk_reason?: string;
  risk_evidence?: {
    seller_checked: boolean;
    product_checked: boolean;
    returns_checked: boolean;
    anomaly_checked: boolean;
  };
  waive_deposit?: boolean;
  exception_reason?: string;
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
  taobao_purchase_order_ids?: string[];
}
