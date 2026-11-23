import { detectProductSource, validateProductUrl } from "./productMetadata.js";

export const PRODUCT_PROTOCOL_VERSION = "1.0";
const extensionIds = String(import.meta.env.VITE_CUSTOMER_EXTENSION_IDS || import.meta.env.VITE_CUSTOMER_EXTENSION_ID || "")
  .split(",").map((value) => value.trim()).filter(Boolean);
export const CUSTOMER_EXTENSION_LOCAL_ORIGINS = Object.freeze(
  String(import.meta.env.VITE_CUSTOMER_EXTENSION_LOCAL_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((value) => value.trim()).filter(Boolean),
);

const localHostname = (hostname) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);

export function getCustomerExtensionOriginState(origin = globalThis.location?.origin) {
  if (!origin) return { supported: true };
  try {
    const url = new URL(origin);
    if (!localHostname(url.hostname)) return { supported: true };
    const supported = CUSTOMER_EXTENSION_LOCAL_ORIGINS.includes(url.origin);
    return { supported, origin: url.origin, expectedOrigin: CUSTOMER_EXTENSION_LOCAL_ORIGINS[0] };
  } catch {
    return { supported: false, origin: String(origin), expectedOrigin: CUSTOMER_EXTENSION_LOCAL_ORIGINS[0] };
  }
}

function runtime() {
  return globalThis.chrome?.runtime?.sendMessage ? globalThis.chrome.runtime : null;
}

function send(extensionId, message) {
  return new Promise((resolve, reject) => {
    const api = runtime();
    if (!api) return reject(new Error("EXTENSION_API_UNAVAILABLE"));
    try {
      api.sendMessage(extensionId, message, (response) => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) reject(new Error("EXTENSION_NOT_CONNECTED"));
        else resolve(response);
      });
    } catch { reject(new Error("EXTENSION_NOT_CONNECTED")); }
  });
}

export async function detectCustomerExtension({ origin } = {}) {
  const originState = getCustomerExtensionOriginState(origin);
  if (!originState.supported) return { connected: false, reason: "unsupported_origin", ...originState };
  for (const extensionId of extensionIds) {
    try {
      const response = await send(extensionId, { type: "PRODUCT_EXTRACT_PING", protocol_version: PRODUCT_PROTOCOL_VERSION });
      if (response?.ok) return { connected: true, extensionId, capabilities: response.capabilities || [] };
      if (response?.error?.code === "ORIGIN_NOT_ALLOWED") {
        return { connected: false, reason: "origin_rejected", error: response.error };
      }
    } catch { /* try the next configured extension ID */ }
  }
  return { connected: false, reason: extensionIds.length ? "not_connected" : "not_configured" };
}

const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, milliseconds);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});

export async function extractProductWithExtension(productUrl, { signal, onStatus, onConnection, timeoutMs = 50_000 } = {}) {
  const validation = validateProductUrl(productUrl);
  if (!validation.valid) throw new Error("INVALID_PRODUCT_URL");
  const connection = await detectCustomerExtension();
  onConnection?.(connection);
  if (!connection.connected) return { status: "extension_unavailable", connection };
  const requestId = crypto.randomUUID().replaceAll("-", "");
  const base = { request_id: requestId, protocol_version: PRODUCT_PROTOCOL_VERSION };
  const accepted = await send(connection.extensionId, {
    ...base, type: "PRODUCT_EXTRACT_REQUEST", product_url: validation.sourceUrl,
    platform: detectProductSource(validation.sourceUrl), requested_at: new Date().toISOString(),
  });
  if (!accepted?.ok) throw new Error(accepted?.error?.code || "EXTENSION_REQUEST_REJECTED");
  const started = Date.now();
  try {
    while (Date.now() - started < timeoutMs) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await delay(500, signal);
      const response = await send(connection.extensionId, { ...base, type: "PRODUCT_EXTRACT_STATUS" });
      const request = response?.request;
      if (!response?.ok || !request) throw new Error("EXTENSION_REQUEST_LOST");
      onStatus?.(request.status);
      if (request.status === "completed") return { status: request.result?.extraction_status || "success", product: request.result, connection };
      if (request.status === "needs_user_action") return { status: "needs_user_action", product: request.result, error: request.error, tabId: request.tab_id, connection };
      if (request.status === "cancelled") throw new DOMException("Aborted", "AbortError");
    }
    throw new Error("EXTENSION_TIMEOUT");
  } catch (error) {
    await send(connection.extensionId, { ...base, type: "PRODUCT_EXTRACT_CANCEL" }).catch(() => {});
    throw error;
  }
}

export function mapExtensionProduct(product) {
  return {
    status: product.extraction_status,
    source: product.platform,
    normalized_url: product.normalized_url,
    title: product.title,
    seller_name: product.seller_name,
    seller_url: product.seller_url,
    image: product.main_image,
    images: product.images || [],
    price_cny: product.price_cny ?? product.min_price_cny ?? null,
    skus: product.skus || [],
    attribute_groups: product.attribute_groups || [],
    valid_sku_combinations: product.valid_sku_combinations || [],
    has_variants: product.has_variants === true,
    sku_extraction_complete: product.sku_extraction_complete === true,
    selected_sku_id: product.selected_sku_id || null,
    variant_price_cny: product.variant_price_cny ?? null,
    quantity_price_tiers: product.quantity_price_tiers || [],
    missing_fields: product.missing_fields || [],
    extraction_source: product.extraction_source,
  };
}
