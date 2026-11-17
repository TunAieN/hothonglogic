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
export const getPurchaseWorkspace = () => request("workspace");
export const createPurchaseDraft = (input) => request("drafts", json("POST", input));
export const updatePurchaseDraft = (id, input) => request(`drafts/${id}`, json("PATCH", input));
export const deletePurchaseDraft = (id) => request(`drafts/${id}`, json("DELETE"));
export const submitPurchaseDraft = (id) => request(`drafts/${id}/submit`, json("POST"));
export const addPurchaseCartItem = (input) => request("cart/items", json("POST", input));
export const updatePurchaseCartItem = (id, input) => request(`cart/items/${id}`, json("PATCH", input));
export const deletePurchaseCartItem = (id) => request(`cart/items/${id}`, json("DELETE"));
export const submitPurchaseCart = () => request("cart/submit", json("POST"));
export const savePurchaseCartAsDraft = (input = {}) => request("cart/save-draft", json("POST", input));
export const getCustomerOrders = (params = {}) => request(`orders?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value != null))}`);
export const getCustomerOrder = (id) => request(`orders/${encodeURIComponent(id)}`);
export const getProductLookupRequests = () => request("product-lookups");
export const getProductLookupRequest = (id) => request(`product-lookups/${encodeURIComponent(id)}`);
export const createProductLookupRequest = (url) => request("product-lookups", json("POST", { url }));
