import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_CUSTOMER_EXTENSION_IDS", "extension-qa-id");

describe("customer extension bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("detects the configured extension with the versioned protocol", async () => {
    globalThis.chrome = { runtime: { sendMessage: vi.fn((_id, message, callback) => callback({ ok: true, protocol_version: message.protocol_version, capabilities: ["Taobao"] })) } };
    const { detectCustomerExtension } = await import("./customerExtension.js");
    await expect(detectCustomerExtension({ origin: "http://localhost:5173" })).resolves.toMatchObject({ connected: true, extensionId: "extension-qa-id" });
  });

  it("rejects a local port that is not allowlisted without messaging the extension", async () => {
    const sendMessage = vi.fn();
    globalThis.chrome = { runtime: { sendMessage } };
    const { detectCustomerExtension } = await import("./customerExtension.js");

    await expect(detectCustomerExtension({ origin: "http://localhost:5174" })).resolves.toMatchObject({
      connected: false,
      reason: "unsupported_origin",
      expectedOrigin: "http://localhost:5173",
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("reports an exact-origin rejection returned by the extension", async () => {
    globalThis.chrome = { runtime: { sendMessage: vi.fn((_id, _message, callback) => callback({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED" } })) } };
    const { detectCustomerExtension } = await import("./customerExtension.js");

    await expect(detectCustomerExtension({ origin: "http://localhost:5173" })).resolves.toMatchObject({ connected: false, reason: "origin_rejected" });
  });

  it("maps nullable contract fields without inventing price or SKU data", async () => {
    const { mapExtensionProduct } = await import("./customerExtension.js");
    const result = mapExtensionProduct({ extraction_status: "partial", platform: "1688", normalized_url: "https://detail.1688.com/offer/123.html", title: "Sản phẩm", main_image: null, images: [], price_cny: null, min_price_cny: null, skus: [], missing_fields: ["price_cny", "skus"] });
    expect(result).toMatchObject({ status: "partial", source: "1688", price_cny: null, skus: [] });
  });

  it("preserves generic attribute groups and verified combinations", async () => {
    const { mapExtensionProduct } = await import("./customerExtension.js");
    const result = mapExtensionProduct({ extraction_status: "success", platform: "Tmall", attribute_groups: [{ group_id: "3", name: "净含量", values: [{ value_id: "31", label: "500ml" }] }], skus: [{ sku_id: "volume-500", attributes: [{ group_id: "3", value_id: "31", name: "净含量", value: "500ml" }] }], has_variants: true, sku_extraction_complete: true });
    expect(result.attribute_groups[0].name).toBe("净含量");
    expect(result.skus[0].sku_id).toBe("volume-500");
    expect(result.sku_extraction_complete).toBe(true);
  });
});
