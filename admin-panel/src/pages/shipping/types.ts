export type ShippingPackage = {
  id: string;
  tracking_number?: string | null;
  order_id?: string | null;
  order_code?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  length: number;
  width: number;
  height: number;
  weight: number;
  value?: number | null;
};

export type ShippingQueueOrder = {
  id: string;
  order_code: string;
  tracking_numbers: string[];
  customer_name: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  carrier?: string | null;
  payment_date?: string | null;
  package_count: number;
  total_weight: number;
  settled_value: number;
  total_value: number;
  status: string;
  packages: ShippingPackage[];
};

export type ShippingQueueStats = {
  total_orders: number;
  total_packages: number;
  total_weight: number;
  total_value: number;
};

export type ShippingPaginatorInfo = {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  firstItem?: number | null;
  lastItem?: number | null;
};

export type ShippingQueuePage = {
  data: ShippingQueueOrder[];
  stats: ShippingQueueStats;
  paginatorInfo: ShippingPaginatorInfo;
};

export type ShippingQueueFilter = {
  search?: string;
  status?: string;
  carrier?: string;
  date_from?: string;
  date_to?: string;
};

export type ShippingTaskOptions = {
  deliveryStaff: Array<{ id: string; name: string; phone?: string | null }>;
  warehouses: Array<{ id: string; name: string; address?: string | null }>;
  carriers: Array<{ code: string; name: string }>;
};

export type CreateShippingTaskInput = {
  order_ids: string[];
  delivery_staff_id: string;
  carrier_code: string;
  carrier_name?: string;
  scheduled_delivery_date: string;
  vn_warehouse_id: string;
  note?: string;
  service_type?: string;
  ghn_service_id?: number;
  ghn_service_type_id?: number;
  delivery_method?: string;
  estimated_shipping_fee?: number;
  cod_amount?: number;
  transport_note?: string;
};

export type ShippingTaskGhnPreview = {
  mode: "preview" | "test" | "production";
  validation_status: string;
  carrier_code: "ghn";
  carrier_name: string;
  services: Array<{ service_id: number; service_type_id: number; service_name: string }>;
  service_id: number;
  service_type_id: number;
  service_name: string;
  warehouse: { id: string; name: string; address?: string | null };
  delivery_request_id: string;
  address: {
    receiver_name: string;
    receiver_phone: string;
    province_code?: string | null;
    province_name?: string | null;
    district_code: string;
    district_name?: string | null;
    ward_code: string;
    ward_name?: string | null;
    address_line: string;
    full_address?: string | null;
  };
  package_count: number;
  total_weight: number;
  length: number;
  width: number;
  height: number;
  settled_value: number;
  collected_fee: number;
  current_fee: number;
  fee_difference: number;
  fee_status: "matched" | "increased" | "decreased";
  cod_amount: number;
  estimated_delivery_at: string;
};

export type ShippingTask = {
  id: string;
  task_code: string;
  export_slip_id?: string | null;
  export_code?: string | null;
  delivery_staff_id?: string | null;
  delivery_staff_name?: string | null;
  delivery_staff_phone?: string | null;
  carrier_code?: string | null;
  carrier_name: string;
  warehouse_name?: string | null;
  order_count: number;
  total_packages: number;
  total_weight: number;
  total_value: number;
  created_at?: string | null;
  scheduled_delivery_date?: string | null;
  status: string;
  note?: string | null;
  service_type?: string | null;
  delivery_method?: string | null;
  estimated_shipping_fee: number;
  cod_amount?: number | null;
  transport_note?: string | null;
  financials?: {
    product_total: number;
    weight_shipping_total: number;
    domestic_shipping_total: number;
    surcharge_total: number;
    settled_total: number;
    cod_amount: number;
    remaining_amount: number;
    status: "paid" | "unpaid";
  } | null;
  delivery_address?: ShippingTaskGhnPreview["address"] | null;
  ghn?: {
    mode: "preview" | "test" | "production";
    service_name?: string | null;
    collected_fee: number;
    current_fee: number;
    fee_difference: number;
    fee_status: "matched" | "increased" | "decreased";
  } | null;
  shipment?: {
    exists: boolean;
    carrier_order_id?: string | null;
    tracking_number?: string | null;
    status?: string | null;
  } | null;
  orders: Array<{
    id: string;
    order_code?: string | null;
    customer_name?: string | null;
    package_count: number;
    total_weight: number;
    total_value: number;
    settled_total?: number | null;
  }>;
};

export type ShippingTaskStats = {
  total_tasks: number;
  preparing: number;
  in_transit: number;
  completed: number;
  cancelled: number;
};

export type ShippingTaskFilter = {
  search?: string;
  status?: string;
  carrier_code?: string;
  delivery_staff_id?: string;
  date_from?: string;
  date_to?: string;
  sort_field?: "task_code" | "created_at" | "scheduled_delivery_date";
  sort_direction?: "asc" | "desc";
};

export type ShippingTaskPage = ShippingListPage<ShippingTask> & {
  stats: ShippingTaskStats;
};

export type ExportSlipCustomer = {
  order_code?: string | null;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type ExportSlip = {
  id: string;
  export_code: string;
  task_id?: string | null;
  task_code?: string | null;
  status: string;
  created_at?: string | null;
  scheduled_delivery_date?: string | null;
  creator_name?: string | null;
  delivery_staff_name?: string | null;
  delivery_staff_phone?: string | null;
  carrier_code?: string | null;
  carrier_name?: string | null;
  warehouse_name?: string | null;
  warehouse_address?: string | null;
  note?: string | null;
  service_type?: string | null;
  delivery_method?: string | null;
  transport_note?: string | null;
  order_count: number;
  total_packages: number;
  total_weight: number;
  total_value: number;
  customers?: ExportSlipCustomer[] | null;
  orders?: Array<{
    id: string;
    order_code?: string | null;
    customer_name?: string | null;
    package_count: number;
    total_weight: number;
    total_value: number;
  }> | null;
  packages?: ShippingPackage[] | null;
  payment?: {
    status: "paid" | "partial" | "unpaid";
    paid_package_count: number;
    total_package_count: number;
    paid_at?: string | null;
    payment_method?: string | null;
    transaction_code?: string | null;
    bank_name?: string | null;
    confirmed_by?: string | null;
    paid_amount: number;
    voucher_codes: string[];
    settled_total: number;
    remaining_amount: number;
  } | null;
  financials?: {
    product_total: number;
    weight_shipping_total: number;
    domestic_shipping_total: number;
    surcharge_total: number;
    settled_total: number;
    deposit_applied: number;
    customer_credit_applied: number;
    payment_after_deposit: number;
    paid_amount: number;
    cod_amount: number;
    remaining_amount: number;
    status: "paid" | "unpaid";
  } | null;
  delivery_address?: ShippingTaskGhnPreview["address"] | null;
  ghn?: {
    mode: "preview" | "test" | "production";
    service_id?: number | null;
    service_name?: string | null;
    package_count: number;
    total_weight: number;
    length: number;
    width: number;
    height: number;
    collected_fee: number;
    current_fee: number;
    fee_difference: number;
    fee_status: "matched" | "increased" | "decreased";
  } | null;
  shipment?: ShippingTask["shipment"];
  history?: Array<{
    id: string;
    action: string;
    from_status?: string | null;
    to_status?: string | null;
    actor_name?: string | null;
    created_at?: string | null;
  }> | null;
};

export type ExportSlipStats = {
  total_slips: number;
  total_packages: number;
  total_weight: number;
  total_value: number;
};

export type ExportSlipFilter = {
  search?: string;
  status?: string;
  carrier_code?: string;
  delivery_staff_id?: string;
  date_from?: string;
  date_to?: string;
  sort_direction?: "asc" | "desc";
};

export type ExportSlipPage = ShippingListPage<ExportSlip> & { stats: ExportSlipStats };

export type ShippingListPage<T> = {
  data: T[];
  paginatorInfo: ShippingPaginatorInfo;
};
