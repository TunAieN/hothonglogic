import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import type { Invoice, InvoiceStatus, PaymentMethod } from "./types";

const INVOICE_FIELDS = `
  id
  payment_voucher_id
  invoice_type
  order_id
  payment_transaction_id
  invoice_code
  customer_id
  issued_by
  issued_at
  total_amount
  paid_amount
  status
  note
  created_at
  customer { id code name phone email address }
  issuer { id name }
  creator { id name }
  confirmer { id name }
  order { id order_code created_at }
  voucher {
    id
    voucher_code
    voucher_type
    order_id
    payment_method_expected
    total_amount
    paid_amount
    remaining_amount
    created_at
    transactions { id transaction_code amount payment_method bank_name bank_transaction_code received_at status note confirmed_by }
    packages { id order_id order { id order_code created_at } }
  }
  items { id item_type description quantity unit_price amount created_at }
`;

type BackendInvoiceItem = {
  id: string;
  item_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  created_at?: string | null;
};

type BackendPaymentTransaction = {
  id: string;
  transaction_code: string;
  amount: number;
  payment_method: string;
  bank_name?: string | null;
  bank_transaction_code?: string | null;
  received_at?: string | null;
  status: string;
  note?: string | null;
  confirmed_by?: string | null;
};

type BackendInvoice = {
  id: string;
  payment_voucher_id?: string | null;
  invoice_type: string;
  order_id?: string | null;
  payment_transaction_id?: string | null;
  invoice_code: string;
  customer_id: string;
  issued_by?: string | null;
  issued_at?: string | null;
  total_amount: number;
  paid_amount: number;
  status: string;
  note?: string | null;
  created_at?: string | null;
  customer?: {
    id: string;
    code?: string | null;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
  issuer?: { id: string; name: string } | null;
  creator?: { id: string; name: string } | null;
  confirmer?: { id: string; name: string } | null;
  order?: { id: string; order_code: string; created_at?: string | null } | null;
  voucher?: {
    id: string;
    voucher_code: string;
    voucher_type: string;
    order_id?: string | null;
    payment_method_expected?: string | null;
    total_amount: number;
    paid_amount: number;
    remaining_amount: number;
    created_at?: string | null;
    transactions?: BackendPaymentTransaction[] | null;
    packages?: Array<{
      id: string;
      order_id?: string | null;
      order?: { id: string; order_code: string; created_at?: string | null } | null;
    }> | null;
  } | null;
  items?: BackendInvoiceItem[] | null;
};

type PaginatedInvoices = {
  invoices: {
    data: BackendInvoice[];
    paginatorInfo: { total: number };
  };
};

type InvoiceResponse = {
  invoice: BackendInvoice | null;
};

export type InvoiceStatistics = {
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  totalRevenue: number;
};

type InvoiceStatisticsResponse = {
  invoiceStatistics: InvoiceStatistics;
};

const statusMap: Record<string, InvoiceStatus> = {
  draft: "draft",
  pending: "pending",
  confirmed: "partially_paid",
  issued: "paid",
  paid: "paid",
  cancelled: "cancelled",
  voided: "cancelled",
};

const paymentMethodMap: Record<string, PaymentMethod> = {
  cash: "cash",
  bank_transfer: "bank_transfer",
  e_wallet: "e_wallet",
  mixed: "other",
  other: "other",
};

const mapInvoiceStatus = (status?: string | null): InvoiceStatus => statusMap[String(status ?? "").toLowerCase()] ?? "pending";

const mapPaymentMethod = (method?: string | null): PaymentMethod => paymentMethodMap[String(method ?? "").toLowerCase()] ?? "other";

const getOrderFromInvoice = (invoice: BackendInvoice) => {
  const packageWithOrder = invoice.voucher?.packages?.find((item) => item.order);
  return packageWithOrder?.order ?? null;
};

export const mapBackendInvoice = (invoice: BackendInvoice): Invoice => {
  const totalAmount = Number(invoice.total_amount ?? 0);
  const paidAmount = Number(invoice.paid_amount ?? 0);
  const remainingAmount = Math.max(totalAmount - paidAmount, 0);
  const order = invoice.order ?? getOrderFromInvoice(invoice);
  const paymentMethod = mapPaymentMethod(invoice.voucher?.payment_method_expected);
  const issuedAt = invoice.issued_at ?? invoice.created_at ?? "";

  return {
    id: invoice.id,
    invoice_code: invoice.invoice_code,
    payment_voucher_id: invoice.payment_voucher_id ?? null,
    order_id: invoice.order_id ?? order?.id ?? invoice.voucher?.order_id ?? null,
    order_code: order?.order_code ?? null,
    customer: {
      id: invoice.customer?.id ?? invoice.customer_id,
      customer_code: invoice.customer?.code ?? invoice.customer_id,
      name: invoice.customer?.name ?? "—",
      phone: invoice.customer?.phone ?? null,
      email: invoice.customer?.email ?? null,
      address: invoice.customer?.address ?? null,
      company_name: null,
      tax_code: null,
    },
    invoice_type: (invoice.invoice_type || (invoice.voucher?.voucher_type === "deposit" ? "deposit" : "shipping")) as Invoice["invoice_type"],
    issued_at: issuedAt,
    due_at: null,
    subtotal: invoice.items?.reduce((sum, item) => sum + Number(item.amount ?? 0), 0) ?? totalAmount,
    discount_amount: 0,
    tax_amount: 0,
    total_amount: totalAmount,
    paid_amount: paidAmount,
    remaining_amount: remainingAmount,
    status: mapInvoiceStatus(invoice.status),
    backend_status: invoice.status,
    payment_method: paymentMethod,
    items: (invoice.items ?? []).map((item) => ({
      id: item.id,
      item_type: item.item_type,
      description: item.description,
      quantity: Number(item.quantity ?? 0),
      unit_price: Number(item.unit_price ?? 0),
      amount: Number(item.amount ?? 0),
      total_amount: Number(item.amount ?? 0),
    })),
    payments: (invoice.voucher?.transactions ?? []).map((transaction) => ({
      id: transaction.id,
      voucher_code: invoice.voucher?.voucher_code ?? "—",
      paid_at: transaction.received_at ?? "",
      payment_method: mapPaymentMethod(transaction.payment_method),
      amount: Number(transaction.amount ?? 0),
      transaction_code: transaction.bank_transaction_code ?? transaction.transaction_code,
      status: transaction.status === "confirmed" ? "success" : transaction.status === "cancelled" ? "failed" : "pending",
      confirmed_by: transaction.confirmed_by ?? null,
    })),
    activities: [
      {
        id: `${invoice.id}-created`,
        title: "Hóa đơn được tạo",
        actor: invoice.issuer?.name ?? "Hệ thống",
        occurred_at: invoice.created_at ?? issuedAt,
        tone: "blue",
      },
      ...(invoice.issued_at ? [{
        id: `${invoice.id}-issued`,
        title: "Hóa đơn được phát hành",
        actor: invoice.issuer?.name ?? "Hệ thống",
        occurred_at: invoice.issued_at,
        tone: "green" as const,
      }] : []),
    ],
    note: invoice.note ?? null,
    created_by: invoice.creator?.name ?? invoice.issuer?.name ?? "Hệ thống",
    created_at: invoice.created_at ?? issuedAt,
  };
};

const requestGraphql = async <TResult, TVariables extends Record<string, unknown>>(query: string, variables: TVariables) => {
  syncGraphqlAuthToken();
  return client.request<TResult>(query, variables, getGraphqlAuthHeaders());
};

export const fetchInvoices = async (variables: { page: number; first: number; filter?: Record<string, unknown> }) => {
  const query = `
    query Invoices($page: Int!, $first: Int!, $filter: InvoiceFilterInput) {
      invoices(page: $page, first: $first, filter: $filter) {
        data { ${INVOICE_FIELDS} }
        paginatorInfo { total }
      }
    }
  `;
  const response = await requestGraphql<PaginatedInvoices, typeof variables>(query, variables);

  return {
    data: response.invoices.data.map(mapBackendInvoice),
    total: response.invoices.paginatorInfo.total,
  };
};

export const fetchInvoiceStatistics = async () => {
  const query = `
    query InvoiceStatistics {
      invoiceStatistics {
        totalInvoices
        paidInvoices
        unpaidInvoices
        totalRevenue
      }
    }
  `;
  const response = await requestGraphql<InvoiceStatisticsResponse, Record<string, never>>(query, {});

  return response.invoiceStatistics;
};

export const fetchInvoice = async (id: string) => {
  const query = `
    query Invoice($id: ID!) {
      invoice(id: $id) { ${INVOICE_FIELDS} }
    }
  `;
  const response = await requestGraphql<InvoiceResponse, { id: string }>(query, { id });

  return response.invoice ? mapBackendInvoice(response.invoice) : null;
};
