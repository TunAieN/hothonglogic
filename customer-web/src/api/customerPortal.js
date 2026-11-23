import { CustomerAuthError } from "./customerAuth.js";

const apiBase = (import.meta.env.VITE_CUSTOMER_API_URL || "").replace(/\/$/, "");

function cookie(name) {
  const value = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`))?.split("=").slice(1).join("=");
  return value ? decodeURIComponent(value) : "";
}

async function request(path, options = {}) {
  const method = options.method || "GET";
  if (method !== "GET") await fetch(`${apiBase}/sanctum/csrf-cookie`, { credentials: "include", headers: { Accept: "application/json" } });
  const response = await fetch(`${apiBase}/customer-portal/${path}`, {
    ...options, method, credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-XSRF-TOKEN": cookie("XSRF-TOKEN"), ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.replace(`/dang-nhap?redirect=${redirect}`);
    throw new CustomerAuthError("UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn.", body.errors);
  }
  if (!response.ok) {
    const fallback = {
      403: "Bạn không có quyền thực hiện yêu cầu này.",
      404: "Không tìm thấy dữ liệu được yêu cầu.",
      422: "Dữ liệu gửi lên chưa hợp lệ.",
      423: "Chức năng ghi nghiệp vụ hiện đang bị khóa.",
      500: "Máy chủ chưa thể xử lý yêu cầu. Vui lòng thử lại sau.",
      503: "Chức năng đang tạm thời chưa sẵn sàng.",
    }[response.status] || "Yêu cầu không thành công.";
    throw new CustomerAuthError(body.code || "REQUEST_FAILED", body.message || fallback, body.errors);
  }
  return body;
}

const json = (method, body = {}) => ({ method, body: JSON.stringify(body) });
export const submitCustomerPurchaseRequest = (input) => request("purchase-requests", json("POST", input));
export const getCustomerOrders = (params = {}) => request(`orders?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value != null))}`);
export const getCustomerDashboardAnalytics = (months = 6) => request(`dashboard-analytics?${new URLSearchParams({ months })}`);
export const getCustomerWarehousePackages = (params = {}) => request(`warehouse-packages?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value != null))}`);
export const getCustomerWarehousePackage = (id) => request(`warehouse-packages/${encodeURIComponent(id)}`);
export const searchCustomerTracking = (code, options = {}) => request(`tracking?${new URLSearchParams({ code })}`, options);
export const getCustomerOrderShipments = (id) => request(`orders/${encodeURIComponent(id)}/shipments`);
export const getCustomerOrder = (id) => request(`orders/${encodeURIComponent(id)}`);
export const getProductLookupRequests = () => request("product-lookups");
export const getProductLookupRequest = (id) => request(`product-lookups/${encodeURIComponent(id)}`);
export const createProductLookupRequest = (url) => request("product-lookups", json("POST", { url }));
export const getCustomerFinanceSummary = () => request("finance/summary");
export const getCustomerLedger = (params = {}) => request(`finance/ledger?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value != null))}`);
export const getCustomerPaymentVouchers = (params = {}) => request(`finance/payment-vouchers?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value != null))}`);
export const createCustomerTopupIntent = (input) => request("finance/top-up-intents", json("POST", input));
export const getCustomerPaymentIntent = (reference) => request(`finance/payment-intents/${encodeURIComponent(reference)}`);
export const createVoucherSepayIntent = (voucherId, input) => request(`finance/payment-vouchers/${encodeURIComponent(voucherId)}/sepay-intents`, json("POST", input));
export const payVoucherFromWallet = (voucherId, input) => request(`finance/payment-vouchers/${encodeURIComponent(voucherId)}/wallet-payments`, json("POST", input));
export const getCustomerPricing = () => request("pricing");
export const estimateCustomerPricing = (input) => request("pricing/estimate", json("POST", input));
