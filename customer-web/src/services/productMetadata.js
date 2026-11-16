const apiBase = (import.meta.env.VITE_CUSTOMER_API_URL || "").replace(/\/$/, "");

export const productMetadataConfig = Object.freeze({ enabled: true, supportedSources: ["Taobao", "Tmall", "1688"] });

export function validateProductUrl(value) {
  const sourceUrl = String(value || "").trim();
  if (!sourceUrl) return { valid: false, message: "Vui lòng nhập link sản phẩm." };
  try {
    const parsed = new URL(sourceUrl);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("unsupported URL");
    const source = detectProductSource(parsed.toString());
    if (source === "Nguồn khác") return { valid: false, message: "Chỉ hỗ trợ link Taobao, Tmall và 1688." };
    parsed.hash = "";
    return { valid: true, sourceUrl: parsed.toString(), source };
  } catch {
    return { valid: false, message: "Link sản phẩm phải là URL Taobao, Tmall hoặc 1688 hợp lệ." };
  }
}

export function detectProductSource(sourceUrl) {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase().replace(/\.$/, "");
    if (hostname === "1688.com" || hostname.endsWith(".1688.com")) return "1688";
    if (hostname === "taobao.com" || hostname.endsWith(".taobao.com")) return "Taobao";
    if (hostname === "tmall.com" || hostname.endsWith(".tmall.com")) return "Tmall";
  } catch { return "Nguồn khác"; }
  return "Nguồn khác";
}

export async function getProductMetadata(sourceUrl) {
  const validation = validateProductUrl(sourceUrl);
  if (!validation.valid) return { status: "error", message: validation.message };
  try {
    const response = await fetch(`${apiBase}/customer-portal/product-metadata?${new URLSearchParams({ url: validation.sourceUrl })}`, { credentials: "include", headers: { Accept: "application/json" } });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      window.location.replace(`/dang-nhap?redirect=${redirect}`);
      return { status: "error", message: "Phiên đăng nhập đã hết hạn." };
    }
    if (!response.ok) return { status: "error", message: body.message || (response.status === 504 ? "Nguồn hàng phản hồi quá chậm." : "Không thể lấy thông tin sản phẩm từ nguồn hàng.") };
    return body.product;
  } catch {
    return { status: "error", message: "Không thể kết nối dịch vụ lấy thông tin sản phẩm." };
  }
}
