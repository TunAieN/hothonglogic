import dayjs from "dayjs";
import type { Invoice, InvoiceFilters, InvoiceStatus, InvoiceType, PaymentMethod } from "./types";

export const money = (value?: number | null) => `${Number(value ?? 0).toLocaleString("vi-VN")} đ`;

export const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = dayjs(value);
  return date.isValid() ? date.format("DD/MM/YYYY") : "—";
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = dayjs(value);
  return date.isValid() ? date.format("DD/MM/YYYY HH:mm") : "—";
};

export const safeText = (value?: string | number | null, fallback = "—") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

export const invoiceStatusConfig: Record<InvoiceStatus, { label: string; color: string; className: string }> = {
  draft: { label: "Nháp", color: "default", className: "invoice-status--draft" },
  pending: { label: "Chờ thanh toán", color: "orange", className: "invoice-status--pending" },
  partially_paid: { label: "Thanh toán một phần", color: "blue", className: "invoice-status--partial" },
  paid: { label: "Đã thanh toán", color: "green", className: "invoice-status--paid" },
  overdue: { label: "Quá hạn", color: "red", className: "invoice-status--overdue" },
  cancelled: { label: "Đã hủy", color: "default", className: "invoice-status--cancelled" },
};

export const backendStatusLabels: Record<string, string> = {
  issued: "Đã phát hành",
  confirmed: "Đã xác nhận",
  pending: "Chờ thanh toán",
  cancelled: "Đã hủy",
  voided: "Đã hủy",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  e_wallet: "Ví điện tử",
  other: "Khác",
};

export const invoiceTypeLabels: Record<InvoiceType, string> = {
  deposit: "Hóa đơn đặt cọc",
  order: "Hóa đơn đơn hàng",
  shipping: "Hóa đơn vận chuyển",
  service: "Hóa đơn dịch vụ",
  adjustment: "Hóa đơn điều chỉnh",
};

export const getOverdueDays = (invoice: Invoice) => {
  if (invoice.status !== "overdue" || !invoice.due_at) return 0;
  const days = dayjs().diff(dayjs(invoice.due_at), "day");
  return Math.max(days, 1);
};

export const filterInvoices = (invoices: Invoice[], filters: InvoiceFilters) => {
  const keyword = filters.search.trim().toLowerCase();

  return invoices.filter((invoice) => {
    const matchesSearch = keyword
      ? [invoice.invoice_code, invoice.order_code, invoice.customer.name, invoice.customer.customer_code]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      : true;
    const matchesStatus = filters.status === "all" || invoice.status === filters.status;
    const matchesPaymentMethod = filters.paymentMethod === "all" || invoice.payment_method === filters.paymentMethod;
    const matchesDate = filters.dateRange
      ? dayjs(invoice.issued_at).isAfter(dayjs(filters.dateRange[0]).startOf("day").subtract(1, "millisecond")) &&
        dayjs(invoice.issued_at).isBefore(dayjs(filters.dateRange[1]).endOf("day").add(1, "millisecond"))
      : true;

    return matchesSearch && matchesStatus && matchesPaymentMethod && matchesDate;
  });
};

export const buildInvoiceTotals = (items: Array<{ quantity?: number | null; unit_price?: number | null }>, discount = 0, vat = 0, paid = 0) => {
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unit_price ?? 0), 0);
  const discountAmount = Number(discount ?? 0);
  const taxAmount = Number(vat ?? 0);
  const paidAmount = Number(paid ?? 0);
  const total = Math.max(subtotal - discountAmount + taxAmount, 0);
  const remaining = Math.max(total - paidAmount, 0);

  return { subtotal, discountAmount, taxAmount, total, paidAmount, remaining };
};
