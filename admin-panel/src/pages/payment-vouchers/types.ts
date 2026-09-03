export type PaymentCustomer = {
  id: string;
  code?: string | null;
  name: string;
  phone?: string | null;
  address?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  email?: string | null;
};

export type EligiblePaymentPackage = {
  id: string;
  tracking_number_snapshot?: string | null;
  actual_weight?: number | null;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
  actual_volume?: number | null;
  inspection_status: string;
  customer_name_snapshot?: string | null;
  order_code_snapshot?: string | null;
  payment_status?: string | null;
  delivery_status?: string | null;
  received_at?: string | null;
  cn_package?: {
    order?: {
      id: string;
      order_code: string;
      total_amount?: number | null;
      product_total_vnd?: number | null;
      deposit_percent?: number | null;
      deposit_amount_vnd?: number | null;
      deposit_paid_amount_vnd?: number | null;
      deposit_remaining_amount_vnd?: number | null;
      customer: PaymentCustomer;
    } | null;
  } | null;
  receipt?: {
    warehouse?: {
      id: string;
      name: string;
      address?: string | null;
    } | null;
  } | null;
};

export type VoucherSurchargeInput = {
  vn_package_id?: string;
  surcharge_type: string;
  amount: number;
  note?: string;
};

export type GhnProvince = { province_id: number; name: string };
export type GhnDistrict = { district_id: number; province_id: number; name: string };
export type GhnWard = { ward_code: string; district_id: number; name: string };
export type GhnShippingQuote = {
  total: number;
  service_fee: number;
  insurance_fee: number;
  service_id: number;
  service_type_id: number;
  service_name: string;
};

export type CustomerAddress = {
  id?: string;
  customer_id?: string;
  label?: string | null;
  receiver_name: string;
  receiver_phone: string;
  province_code: string;
  province_name: string;
  district_code: string;
  district_name: string;
  ward_code: string;
  ward_name: string;
  address_line: string;
  full_address: string;
  is_default: boolean;
};

export type PaymentAccount = {
  id: string;
  bank_name: string;
  bank_code?: string | null;
  account_number: string;
  account_holder: string;
  branch_name?: string | null;
  is_default: boolean;
  is_active: boolean;
  note?: string | null;
};

export type VoucherPreviewPackage = {
  id: string;
  tracking_number?: string | null;
  order_id?: string | null;
  order_code?: string | null;
  customer_name?: string | null;
  actual_weight: number;
  volumetric_weight: number;
  chargeable_weight: number;
  price_per_kg: number;
  shipping_rate_id?: string | null;
  shipping_rate_detail_id?: string | null;
  unit_price?: number | null;
  price_type?: string | null;
  rate_description?: string | null;
  shipping_fee: number;
  additional_charge_amount: number;
  total_amount: number;
};

export type VoucherPreview = {
  customer: PaymentCustomer;
  packages: VoucherPreviewPackage[];
  order_total: number;
  product_total: number;
  weight_shipping_total: number;
  delivery_fee_total: number;
  additional_charge_total: number;
  gross_total: number;
  deposit_applied: number;
  customer_credit_available: number;
  customer_credit_applied: number;
  total_amount: number;
  remaining_amount: number;
  payment_account?: PaymentAccount | null;
  transfer_content?: string | null;
};

export type PaymentTransaction = {
  id: string;
  transaction_code: string;
  amount: number;
  payment_method: string;
  bank_name?: string | null;
  bank_transaction_code?: string | null;
  received_at: string;
  status: string;
  note?: string | null;
};

export type Invoice = {
  id: string;
  invoice_code: string;
  issued_at?: string | null;
  total_amount: number;
  paid_amount: number;
  status: string;
  items?: Array<{ id: string; item_type: string; description: string; quantity: number; unit_price: number; amount: number }>;
};

export type PaymentVoucherRelatedOrder = {
  id: string;
  order_code: string;
  status: string;
  total_amount?: number | null;
  product_total_vnd?: number | null;
  deposit_percent?: number | null;
  deposit_amount_vnd?: number | null;
  deposit_paid_amount_vnd?: number | null;
  deposit_remaining_amount_vnd?: number | null;
  created_at?: string | null;
};

export type PaymentVoucher = {
  id: string;
  voucher_code: string;
  voucher_type: string;
  order_id?: string | null;
  customer: PaymentCustomer;
  warehouse?: { id: string; name: string } | null;
  creator?: { id: string; name: string } | null;
  payment_method_expected: string;
  payment_account_id?: string | null;
  bank_name_snapshot?: string | null;
  bank_code_snapshot?: string | null;
  bank_account_number_snapshot?: string | null;
  bank_account_holder_snapshot?: string | null;
  bank_branch_name_snapshot?: string | null;
  transfer_content?: string | null;
  paymentAccount?: PaymentAccount | null;
  base_amount_cny?: number | null;
  exchange_rate?: number | null;
  base_amount_vnd?: number | null;
  deposit_percent?: number | null;
  currency?: string | null;
  status: string;
  subtotal: number;
  discount_amount: number;
  payment_method?: string | null;
  paid_at?: string | null;
  total_amount: number;
  deposit_applied: number;
  customer_credit_applied: number;
  paid_amount: number;
  remaining_amount: number;
  note?: string | null;
  cancelled_reason?: string | null;
  created_at: string;
  packages: Array<{
    id: string;
    actual_weight: number;
    volumetric_weight: number;
    chargeable_weight: number;
    price_per_kg: number;
    shipping_rate_id?: string | null;
    shipping_rate_detail_id?: string | null;
    unit_price?: number | null;
    price_type?: string | null;
    rate_description?: string | null;
    shipping_fee: number;
    total_amount: number;
    vnPackage: EligiblePaymentPackage;
  }>;
  items: Array<{
    id: string;
    item_type: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    reference_type?: string | null;
    reference_id?: string | null;
    created_at: string;
  }>;
  deliveryRequest?: {
    id: string;
    delivery_method: "pickup_at_warehouse" | "delivery";
    preferred_carrier?: string | null;
    delivery_note?: string | null;
    status: string;
    shipping_task_id?: string | null;
    address?: {
      id: string;
      receiver_name: string;
      receiver_phone: string;
      province_code?: string | null;
      province_name?: string | null;
      district_code?: string | null;
      district_name?: string | null;
      ward_code?: string | null;
      ward_name?: string | null;
      address_line?: string | null;
      full_address?: string | null;
    } | null;
    shipments: Array<{ id: string; carrier_code: string; service_code?: string | null; carrier_order_id?: string | null; tracking_number?: string | null; shipping_fee: number; cod_amount: number; status: string; label_url?: string | null }>;
  } | null;
  transactions: PaymentTransaction[];
  invoice?: Invoice | null;
  order?: PaymentVoucherRelatedOrder | null;
};
