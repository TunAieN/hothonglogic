export const customerPortalCapabilities = Object.freeze({
  authentication: "ready",
  overview: "account-only",
  orders: "ready",
  orderDetail: "ready",
  consignments: "needs-backend",
  wallet: "ready",
  transactions: "ready",
  addresses: "blocked",
  notifications: "needs-backend",
  profile: "read-only",
  password: "ready",
  socialConnections: "needs-backend",
  support: "needs-backend",
  pricing: "ready",
});

const allowedDemoStates = new Set(["ready", "loading", "error", "empty"]);
const requestedState = import.meta.env.VITE_CUSTOMER_PORTAL_DEMO_STATE || "ready";

export const customerPortalRuntime = Object.freeze({
  demoEnabled: import.meta.env.DEV && import.meta.env.VITE_ENABLE_CUSTOMER_PORTAL_DEMO === "true",
  demoState: import.meta.env.DEV && allowedDemoStates.has(requestedState) ? requestedState : "ready",
});

export const portalRoutes = Object.freeze({
  overview: "/tai-khoan",
  createOrder: "/tai-khoan/tao-don",
  cart: "/tai-khoan/gio-hang",
  orders: "/tai-khoan/don-mua-ho",
  orderHistory: "/tai-khoan/lich-su-don",
  orderPayments: "/tai-khoan/thanh-toan-don",
  orderDetail: "/tai-khoan/don-mua-ho/chi-tiet",
  consignmentCreate: "/tai-khoan/ky-gui/tao-moi",
  consignments: "/tai-khoan/ky-gui",
  tracking: "/tai-khoan/tra-cuu",
  wallet: "/tai-khoan/vi",
  pricing: "/tai-khoan/bang-gia",
  addresses: "/tai-khoan/dia-chi",
  notifications: "/tai-khoan/thong-bao",
  settings: "/tai-khoan/cai-dat",
  support: "/tai-khoan/ho-tro",
});

export const customerPortalDemoPrefix = "/tai-khoan/demo";

export const customerPortalDemoRoutes = Object.freeze({
  overview: customerPortalDemoPrefix,
  createOrder: `${customerPortalDemoPrefix}/tao-don`,
  cart: `${customerPortalDemoPrefix}/gio-hang`,
  orders: `${customerPortalDemoPrefix}/don-mua-ho`,
  orderHistory: `${customerPortalDemoPrefix}/lich-su-don`,
  orderPayments: `${customerPortalDemoPrefix}/thanh-toan-don`,
  orderDetail: `${customerPortalDemoPrefix}/don-mua-ho/chi-tiet`,
  consignmentCreate: `${customerPortalDemoPrefix}/ky-gui/tao-moi`,
  consignments: `${customerPortalDemoPrefix}/ky-gui`,
  tracking: `${customerPortalDemoPrefix}/tra-cuu`,
  wallet: `${customerPortalDemoPrefix}/vi`,
  pricing: `${customerPortalDemoPrefix}/bang-gia`,
  addresses: `${customerPortalDemoPrefix}/dia-chi`,
  notifications: `${customerPortalDemoPrefix}/thong-bao`,
  settings: `${customerPortalDemoPrefix}/cai-dat`,
  support: `${customerPortalDemoPrefix}/ho-tro`,
});

export function isCustomerPortalDemoPath(pathname) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return normalizedPath === customerPortalDemoPrefix
    || normalizedPath.startsWith(`${customerPortalDemoPrefix}/`);
}

export function getPortalRoutes(pathname = window.location.pathname) {
  return isCustomerPortalDemoPath(pathname) ? customerPortalDemoRoutes : portalRoutes;
}
