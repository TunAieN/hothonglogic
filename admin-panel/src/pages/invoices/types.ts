export type InvoiceStatus = "draft" | "pending" | "partially_paid" | "paid" | "overdue" | "cancelled";

export type PaymentMethod = "cash" | "bank_transfer" | "e_wallet" | "other";

export type InvoiceType = "deposit" | "order" | "shipping" | "service" | "adjustment";

export type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  amount?: number;
  item_type?: string | null;
};

export type InvoiceCustomer = {
  id: string;
  customer_code: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  company_name?: string | null;
  tax_code?: string | null;
};

export type InvoicePayment = {
  id: string;
  voucher_code: string;
  paid_at: string;
  payment_method: PaymentMethod;
  amount: number;
  transaction_code?: string | null;
  status: "success" | "pending" | "failed";
  confirmed_by?: string | null;
};

export type InvoiceActivity = {
  id: string;
  title: string;
  actor: string;
  occurred_at: string;
  tone: "blue" | "green" | "orange" | "red";
};

export type Invoice = {
  id: string;
  invoice_code: string;
  payment_voucher_id?: string | null;
  order_id?: string | null;
  order_code?: string | null;
  customer: InvoiceCustomer;
  invoice_type: InvoiceType;
  issued_at: string;
  due_at?: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: InvoiceStatus;
  backend_status?: string | null;
  payment_method?: PaymentMethod | null;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  activities: InvoiceActivity[];
  note?: string | null;
  created_by: string;
  created_at: string;
};

export type InvoiceOrderOption = {
  id: string;
  order_code: string;
  customer_id: string;
  created_at: string;
  total_amount: number;
  status: string;
};

export type InvoiceFilters = {
  search: string;
  status: InvoiceStatus | "all";
  paymentMethod: PaymentMethod | "all";
  dateRange: [string, string] | null;
};

export type InvoiceListFilter = {
  invoice_code?: string;
  customer_id?: string;
  status?: string;
  issued_from?: string;
  issued_to?: string;
};
