const apiBase = (import.meta.env.VITE_CUSTOMER_API_URL || "").replace(/\/$/, "");

export const customerAuthCapabilities = Object.freeze({ login: true, rememberSession: true, passwordRecovery: true, registration: true, socialProviders: [] });

export class CustomerAuthError extends Error {
  constructor(code, message, errors = {}) {
    super(message);
    this.name = "CustomerAuthError";
    this.code = code;
    this.errors = errors;
  }
}

function cookie(name) {
  const value = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`))?.split("=").slice(1).join("=");
  return value ? decodeURIComponent(value) : "";
}

async function csrf() {
  await fetch(`${apiBase}/sanctum/csrf-cookie`, { credentials: "include", headers: { Accept: "application/json" } });
}

async function request(path, options = {}) {
  const method = options.method || "GET";
  if (method !== "GET") await csrf();
  const response = await fetch(`${apiBase}/customer-auth/${path}`, { ...options, method, credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json", "X-XSRF-TOKEN": cookie("XSRF-TOKEN"), ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new CustomerAuthError(body.code || (response.status === 401 ? "UNAUTHENTICATED" : "REQUEST_FAILED"), body.message || "Yêu cầu không thành công.", body.errors);
  return body;
}

export const loginCustomer = (input) => request("login", { method: "POST", body: JSON.stringify(input) });
export const registerCustomer = (input) => request("register", { method: "POST", body: JSON.stringify(input) });
export const getCustomerSession = () => request("me");
export const logoutCustomer = () => request("logout", { method: "POST", body: "{}" });
export const resendCustomerVerification = (email) => request("resend-verification", { method: "POST", body: JSON.stringify({ email }) });
export const forgotCustomerPassword = (email) => request("forgot-password", { method: "POST", body: JSON.stringify({ email }) });
export const resetCustomerPassword = (input) => request("reset-password", { method: "POST", body: JSON.stringify(input) });
export const changeCustomerPassword = (input) => request("change-password", { method: "POST", body: JSON.stringify(input) });
