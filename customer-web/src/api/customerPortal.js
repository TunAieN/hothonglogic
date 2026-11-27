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
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfter = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : null;
    const fallback = {
      403: "Bạn không có quyền thực hiện yêu cầu này.",
      404: "Không tìm thấy dữ liệu được yêu cầu.",
      422: "Dữ liệu gửi lên chưa hợp lệ.",
      423: "Chức năng ghi nghiệp vụ hiện đang bị khóa.",
      429: retryAfter ? `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfter} giây.` : "Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại.",
      500: "Máy chủ chưa thể xử lý yêu cầu. Vui lòng thử lại sau.",
      503: "Chức năng đang tạm thời chưa sẵn sàng.",
    }[response.status] || "Yêu cầu không thành công.";
    const error = new CustomerAuthError(body.code || "REQUEST_FAILED", response.status === 429 ? fallback : (body.message || fallback), body.errors);
    error.status = response.status;
    error.retryAfter = retryAfter;
    throw error;
  }
  return body;
}

const json = (method, body = {}) => ({ method, body: JSON.stringify(body) });
export const submitCustomerPurchaseRequest = (input) => request("purchase-requests", json("POST", input));
export const getCustomerAddresses = () => request("addresses");
export const createCustomerAddress = (input) => request("addresses", json("POST", input));
export const updateCustomerAddress = (id, input) => request(`addresses/${encodeURIComponent(id)}`, json("PUT", input));
export const deleteCustomerAddress = (id) => request(`addresses/${encodeURIComponent(id)}`, json("DELETE"));
export const setDefaultCustomerAddress = (id) => request(`addresses/${encodeURIComponent(id)}/default`, json("POST"));
export const getAddressProvinces = () => request("address-locations/provinces");
export const getAddressDistricts = (provinceId) => request(`address-locations/districts?${new URLSearchParams({ province_id: provinceId })}`);
export const getAddressWards = (districtId) => request(`address-locations/wards?${new URLSearchParams({ district_id: districtId })}`);
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
export const getCustomerPaymentIntents = (params = {}) => request(`finance/payment-intents?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value != null))}`);
export const getCustomerNotifications = (params = {}) => request(`notifications?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value != null))}`);
export const markCustomerNotificationRead = (id) => request(`notifications/${encodeURIComponent(id)}/read`, json("POST"));
export const markAllCustomerNotificationsRead = () => request("notifications/read-all", json("POST"));
export const createCustomerTopupIntent = (input) => request("finance/top-up-intents", json("POST", input));
export const getCustomerPaymentIntent = (reference, options = {}) => request(`finance/payment-intents/${encodeURIComponent(reference)}`, options);
export const createVoucherSepayIntent = (voucherId, input) => request(`finance/payment-vouchers/${encodeURIComponent(voucherId)}/sepay-intents`, json("POST", input));
export const payVoucherFromWallet = (voucherId, input) => request(`finance/payment-vouchers/${encodeURIComponent(voucherId)}/wallet-payments`, json("POST", input));
export const payVouchersFromWallet = (input) => request("finance/payment-vouchers/wallet-checkout", json("POST", input));
export const getCustomerPricing = () => request("pricing");
export const estimateCustomerPricing = (input) => request("pricing/estimate", json("POST", input));
