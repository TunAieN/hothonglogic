export const CUSTOMER_WEB_DEV_SERVER = Object.freeze({
  // Bind IPv4 explicitly so both localhost and 127.0.0.1 work consistently on Windows.
  host: "0.0.0.0",
  port: 5173,
  strictPort: true,
});

export const ADMIN_PANEL_DEV_SERVER = Object.freeze({
  host: "0.0.0.0",
  port: 5174,
  strictPort: true,
});

export const CUSTOMER_EXTENSION_LOCAL_ORIGINS = Object.freeze([
  `http://localhost:${CUSTOMER_WEB_DEV_SERVER.port}`,
  `http://127.0.0.1:${CUSTOMER_WEB_DEV_SERVER.port}`,
]);

export function parseExplicitOrigins(value, fallback = CUSTOMER_EXTENSION_LOCAL_ORIGINS) {
  const candidates = String(value || "").trim() ? String(value).split(",") : fallback;
  const origins = candidates.map((candidate) => new URL(String(candidate).trim()).origin);

  if (!origins.length || origins.some((origin) => origin.includes("*"))) {
    throw new Error("Customer website origins must be explicit origins.");
  }

  return [...new Set(origins)];
}
