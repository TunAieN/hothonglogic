export type PaymentCustomer = {
  id: string;
  code?: string | null;
  name: string;
  phone?: string | null;
  address?: string | null;
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
      customer: PaymentCustomer;
    } | null;
  } | null;
  receipt?: {
    warehouse?: {
      id: string;
      name: string;
    } | null;
  } | null;
};

export type VoucherSurchargeInput = {
  vn_package_id?: string;
  surcharge_type: string;
  amount: number;
  note?: string;
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
  domestic_shipping_fee: number;
  surcharge_amount: number;
  total_amount: number;
};

export type VoucherPreview = {
  customer: PaymentCustomer;
  packages: VoucherPreviewPackage[];
  shipping_fee_total: number;
  domestic_shipping_fee: number;
  surcharge_total: number;
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

export type PaymentVoucher = {
  id: string;
  voucher_code: string;
  customer: PaymentCustomer;
  warehouse?: { id: string; name: string } | null;
  creator?: { id: string; name: string } | null;
  receiver_type: string;
  delivery_address?: string | null;
  payment_method_expected: string;
  payment_account_id?: string | null;
  bank_name_snapshot?: string | null;
  bank_code_snapshot?: string | null;
  bank_account_number_snapshot?: string | null;
  bank_account_holder_snapshot?: string | null;
  bank_branch_name_snapshot?: string | null;
  transfer_content?: string | null;
  paymentAccount?: PaymentAccount | null;
  status: string;
  shipping_fee_total: number;
  domestic_shipping_fee: number;
  surcharge_total: number;
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
    surcharge_amount: number;
    total_amount: number;
    vnPackage: EligiblePaymentPackage;
  }>;
  surcharges: Array<{ id: string; surcharge_type: string; amount: number; note?: string | null }>;
  transactions: PaymentTransaction[];
  invoice?: Invoice | null;
};

