import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Box, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, Coins, Copy, CreditCard, Database, ExternalLink, Eye, FileClock, FileText, Filter, Headphones, Layers3, Link2, Mail, Package, PackageCheck, Pencil, Phone, Search, Send, ShoppingBag, ShoppingCart, Trash2, UserRound, X } from "lucide-react";
import {
  createProductLookupRequest, getProductLookupRequest,
  getCustomerOrder, getCustomerOrders, submitCustomerPurchaseRequest,
} from "../../api/customerPortal.js";
import { EmptyState, LoadingState, PageHeader, StatusBadge } from "../../components/customer/PortalComponents.jsx";
import ProductThumbnail from "../../components/customer/ProductThumbnail.jsx";
import { OrderShipmentPanel } from "./RealCustomerLogisticsPages.jsx";
import ProductPreviewPanel from "../../components/customer/ProductPreviewPanel.jsx";
import ProductVariantSelector from "../../components/customer/ProductVariantSelector.jsx";
import { formatDateTime, formatVnd } from "../../utils/customerFormatters.js";
import { detectProductSource, getProductMetadata, validateProductUrl } from "../../services/productMetadata.js";
import { detectCustomerExtension, extractProductWithExtension, mapExtensionProduct } from "../../services/customerExtension.js";
import { priceForQuantity, semanticValue, variantLabel } from "../../services/skuSelection.js";
import useCustomerCart from "../../hooks/useCustomerCart.js";
import { getTotals as getCartTotals } from "../../services/customerLocalCart.js";
import styles from "../../components/customer/CustomerPortal.module.css";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

const blank = { source: "Taobao", product_link: "", product_name: "", variant: "", color: "", size: "", quantity: 1, price_cny: "", note: "", product_image: "", seller: "", shop_name: "", images: [], skus: [], attribute_groups: [], selectedAttributes: {}, selected_sku_id: null, has_variants: false, sku_extraction_complete: true, quantity_price_tiers: [], metadataStatus: "idle", metadataSource: "manual" };
const errorText = (error) => error?.message || "Không thể thực hiện yêu cầu.";
const submitDebug = (stage, details = {}) => {
  if (!import.meta.env.DEV) return;
  const safeDetails = { stage, ...details };
  window.dispatchEvent(new CustomEvent("viettrung:cart-submit-debug", { detail: safeDetails }));
  if (import.meta.env.MODE !== "test") console.debug("[customer-cart-submit]", safeDetails);
};
const missingFieldLabel = (field) => ({ skus: "phân loại/SKU", price_cny: "giá", images: "ảnh", title: "tên sản phẩm" })[field] || field;
const extensionConnectionNotice = (connection) => {
  if (connection?.connected) return { tone: "success", title: "Customer Extension đã kết nối", message: "Sẵn sàng lấy dữ liệu sản phẩm và SKU." };
  if (connection?.reason === "unsupported_origin") return {
    tone: "warning",
    title: "Website đang ở origin không được hỗ trợ",
    message: `Website đang chạy tại ${connection.origin}, nhưng Customer Extension được cấu hình cho ${connection.expectedOrigin}. Vui lòng mở Customer Web tại ${connection.expectedOrigin}.`,
  };
  if (connection?.reason === "origin_rejected") return { tone: "warning", title: "Customer Extension đã từ chối origin hiện tại", message: "Hãy mở đúng Customer Web rồi tải lại trang." };
  return { tone: "warning", title: "Không kết nối được Customer Extension", message: "Vui lòng kiểm tra Extension đã được bật và tải lại trang." };
};
const extensionFailureNotice = (reason) => {
  const code = reason?.message || "EXTENSION_ERROR";
  if (code === "EXTENSION_TIMEOUT") return { tone: "warning", title: "Customer Extension đã kết nối nhưng hết thời gian chờ", message: "Trang nguồn phản hồi quá chậm. Vui lòng thử lại." };
  if (["PAGE_LOAD_TIMEOUT", "TAB_CLOSED"].includes(code)) return { tone: "warning", title: "Extension không đọc được trang sản phẩm", message: "Trang nguồn chưa tải xong hoặc đã bị đóng. Vui lòng mở lại và thử lại." };
  if (["EXTENSION_REQUEST_LOST", "EXTENSION_NOT_CONNECTED"].includes(code)) return { tone: "warning", title: "Mất kết nối với Customer Extension", message: "Vui lòng kiểm tra Extension vẫn đang bật và tải lại trang." };
  return { tone: "warning", title: "Customer Extension không lấy được dữ liệu", message: `Lỗi scraper: ${code}. Bạn vẫn có thể dùng metadata dự phòng hoặc nhập thủ công.` };
};
const selectedAttributeLabels = (form) => Object.fromEntries((form.attribute_groups || []).map((group) => {
  const valueId = form.selectedAttributes?.[group.group_id];
  const option = (group.values || []).find((entry) => entry.value_id === valueId);
  return [group.name || group.group_id, option?.label || valueId];
}).filter(([, value]) => value));
const localCartPayload = (form) => ({
  product_url: form.product_link,
  platform: form.source,
  title: form.product_name,
  main_image: form.product_image || null,
  sku_id: form.selected_sku_id || null,
  selected_attributes: selectedAttributeLabels(form),
  variant_label: form.variant || null,
  color: form.color || null,
  size: form.size || null,
  quantity: Number(form.quantity),
  reference_price_cny: form.price_cny === "" || form.price_cny == null ? null : Number(form.price_cny),
  product_note: form.note || null,
  seller: form.seller || null,
  shop_name: form.shop_name || null,
  sku_required: Boolean(form.has_variants && form.sku_extraction_complete && form.attribute_groups.length),
});

export function RealCreateOrderPage({ routes, customerId }) {
  const [form, setForm] = useState(blank);
  const cart = useCustomerCart(customerId);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState("");
  const [extensionNotice, setExtensionNotice] = useState(null);
  const [lookupRequest, setLookupRequest] = useState(null);
  const dirtyFields = useRef(new Set());
  const extraction = useRef({ sequence: 0, controller: null });
  const activeProductUrl = useRef("");
  const addingToCart = useRef(false);

  useEffect(() => () => extraction.current.controller?.abort(), []);
  useEffect(() => {
    let active = true;
    void detectCustomerExtension().then((connection) => {
      if (active) setExtensionNotice(extensionConnectionNotice(connection));
    });
    return () => { active = false; };
  }, []);
  const update = (key, event) => {
    dirtyFields.current.add(key);
    setForm((value) => ({ ...value, [key]: event.target.value }));
  };
  const applyMetadata = useCallback((result, validation, source) => {
    activeProductUrl.current = result.normalized_url || validation.sourceUrl;
    setForm((value) => {
      const groups = result.attribute_groups || [];
      const skus = result.skus || [];
      const autoSku = skus.find((sku) => sku.sku_id === result.selected_sku_id) || (result.sku_extraction_complete && skus.length === 1 ? skus[0] : null);
      const autoSelection = autoSku ? Object.fromEntries((autoSku.attributes || []).map((attribute) => [attribute.group_id, attribute.value_id]).filter((entry) => entry[0] && entry[1])) : {};
      const autoVariant = autoSku ? variantLabel(groups, autoSelection) || autoSku.label : "";
      return ({
      ...value,
      metadataStatus: result.status || "error", metadataSource: source,
      product_link: result.normalized_url || validation.sourceUrl,
      source: result.source || detectProductSource(validation.sourceUrl),
      product_name: dirtyFields.current.has("product_name") ? value.product_name : (result.title || value.product_name),
      product_image: dirtyFields.current.has("product_image") ? value.product_image : (result.image || value.product_image),
      seller: dirtyFields.current.has("seller") ? value.seller : (result.seller_name || value.seller),
      shop_name: dirtyFields.current.has("shop_name") ? value.shop_name : (result.seller_name || value.shop_name),
      images: result.images || [], skus, attribute_groups: groups,
      has_variants: result.has_variants === true, sku_extraction_complete: result.sku_extraction_complete === true,
      quantity_price_tiers: result.quantity_price_tiers || [],
      selectedAttributes: autoSku ? autoSelection : {}, selected_sku_id: autoSku?.sku_id || null,
      variant: dirtyFields.current.has("variant") ? value.variant : (autoVariant || value.variant),
      color: dirtyFields.current.has("color") ? value.color : (autoSku?.color || semanticValue(groups, autoSelection, "color") || value.color),
      size: dirtyFields.current.has("size") ? value.size : (autoSku?.size || semanticValue(groups, autoSelection, "size") || value.size),
      price_cny: dirtyFields.current.has("price_cny") ? value.price_cny : (priceForQuantity({ sku: autoSku, productTiers: result.quantity_price_tiers, quantity: value.quantity, fallbackPrice: result.price_cny }) ?? value.price_cny),
    });
    });
  }, []);
  const changeProductLink = (event) => {
    const nextUrl = event.target.value;
    extraction.current.controller?.abort();
    extraction.current.sequence += 1;
    setLookupRequest(null); setMetadataMessage(""); setMessage(""); setError("");
    if (activeProductUrl.current && nextUrl.trim() !== activeProductUrl.current) {
      activeProductUrl.current = "";
      dirtyFields.current.clear();
      const detectedSource = detectProductSource(nextUrl);
      setForm({ ...blank, product_link: nextUrl, source: detectedSource === "Nguồn khác" ? blank.source : detectedSource });
      return;
    }
    setForm((value) => ({ ...value, product_link: nextUrl, metadataStatus: "idle" }));
  };
  const clearProductLink = () => {
    extraction.current.controller?.abort(); extraction.current.sequence += 1;
    activeProductUrl.current = ""; dirtyFields.current.clear();
    setLookupRequest(null); setMetadataMessage(""); setMessage(""); setError(""); setForm(blank);
  };
  useEffect(() => {
    if (!lookupRequest || lookupRequest.status === "completed") return undefined;
    const timer = setInterval(async () => {
      try {
        const { request } = await getProductLookupRequest(lookupRequest.id);
        setLookupRequest(request);
        if (request.status === "completed" && request.product_data) {
          const validation = validateProductUrl(request.source_url);
          if (validation.valid) applyMetadata(mapExtensionProduct(request.product_data), validation, "staff");
          setMetadataMessage(request.staff_note || "Nhân viên đã trả kết quả tra cứu sản phẩm.");
          setMessage(`Yêu cầu #${request.id} đã hoàn tất. Hãy kiểm tra phân loại trước khi thêm giỏ.`);
        }
      } catch { /* keep the form usable; the next poll may recover */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [applyMetadata, lookupRequest]);
  const loadMetadata = useCallback(async (requestedUrl, backendOnly = false) => {
    const sourceUrl = typeof requestedUrl === "string" ? requestedUrl : form.product_link;
    const validation = validateProductUrl(sourceUrl);
    if (!validation.valid) { setMetadataMessage(validation.message); setForm((value) => ({ ...value, metadataStatus: "error" })); return; }
    const sequence = ++extraction.current.sequence;
    extraction.current.controller?.abort();
    const controller = new AbortController();
    extraction.current.controller = controller;
    setMetadataMessage(backendOnly ? "Đang thử phương án dự phòng..." : "Đang kiểm tra VietTrung Extension...");
    setForm((value) => ({ ...value, metadataStatus: "loading", source: validation.source }));
    if (!backendOnly) {
      let extensionConnected = false;
      try {
        const extensionResult = await extractProductWithExtension(validation.sourceUrl, { signal: controller.signal, onStatus: (status) => {
          if (sequence === extraction.current.sequence) setMetadataMessage(status === "loading" ? "Extension đang đọc trang sản phẩm..." : "Extension đã nhận yêu cầu...");
        }, onConnection: (connection) => {
          extensionConnected = connection.connected;
          if (sequence === extraction.current.sequence) setExtensionNotice(extensionConnectionNotice(connection));
        } });
        if (sequence !== extraction.current.sequence) return;
        if (extensionResult.product) {
          const mapped = mapExtensionProduct(extensionResult.product);
          applyMetadata(mapped, validation, "extension");
          setMetadataMessage(mapped.status === "partial" ? `Đã lấy một phần thông tin. Còn thiếu: ${(mapped.missing_fields || []).map(missingFieldLabel).join(", ") || "một số thuộc tính"}.` : "Đã lấy thông tin tự động bằng VietTrung Extension.");
          if (extensionResult.status !== "needs_user_action") return;
        }
        if (extensionResult.status === "needs_user_action") {
          setForm((value) => ({ ...value, metadataStatus: extensionResult.product ? "partial" : "unavailable" }));
          setMetadataMessage("Trang yêu cầu đăng nhập hoặc xác minh. Hãy mở tab sản phẩm do Extension tạo, hoàn tất xác minh rồi thử lại.");
          setExtensionNotice({ tone: "warning", title: "Customer Extension cần bạn xác minh", message: "Hãy đăng nhập marketplace hoặc hoàn tất xác minh trên tab sản phẩm rồi thử lại." });
          return;
        }
      } catch (reason) {
        if (reason?.name === "AbortError" || sequence !== extraction.current.sequence) return;
        if (extensionConnected) setExtensionNotice(extensionFailureNotice(reason));
      }
    }
    if (sequence !== extraction.current.sequence) return;
    setMetadataMessage("Không có Extension hoặc Extension không phản hồi. Đang thử lấy metadata công khai...");
    const result = await getProductMetadata(validation.sourceUrl);
    if (sequence !== extraction.current.sequence) return;
    setMetadataMessage(result.message || (result.status === "error" ? "Bạn vẫn có thể nhập thủ công hoặc nhờ nhân viên hỗ trợ." : "Đã chuyển sang phương án dự phòng."));
    applyMetadata(result, validation, "remote");
  }, [applyMetadata, form.product_link]);

  useEffect(() => {
    if (form.metadataStatus !== "idle") return;
    const validation = validateProductUrl(form.product_link);
    if (!validation.valid) return;
    const timer = setTimeout(() => void loadMetadata(validation.sourceUrl), 550);
    return () => clearTimeout(timer);
  }, [form.product_link, form.metadataStatus, loadMetadata]);
  const selectVariant = (selection, sku) => {
    setForm((value) => ({
      ...value,
      selectedAttributes: selection,
      selected_sku_id: sku?.sku_id || null,
      variant: variantLabel(value.attribute_groups, selection) || sku?.label || value.variant,
      color: sku?.color || semanticValue(value.attribute_groups, selection, "color") || "",
      size: sku?.size || semanticValue(value.attribute_groups, selection, "size") || "",
      price_cny: priceForQuantity({ sku, productTiers: value.quantity_price_tiers, quantity: value.quantity, fallbackPrice: sku ? value.price_cny : null }) ?? value.price_cny,
      product_image: sku?.image || value.attribute_groups.flatMap((group) => group.values || []).find((option) => Object.values(selection).includes(option.value_id) && option.image)?.image || value.product_image,
    }));
  };
  const setQuantity = (quantity) => {
    const normalizedQuantity = Math.max(1, Number(quantity) || 1);
    dirtyFields.current.add("quantity");
    setForm((value) => {
      const sku = value.skus.find((entry) => entry.sku_id === value.selected_sku_id) || null;
      const price = priceForQuantity({ sku, productTiers: value.quantity_price_tiers, quantity: normalizedQuantity, fallbackPrice: value.price_cny });
      return { ...value, quantity: normalizedQuantity, price_cny: price ?? value.price_cny };
    });
  };
  const updateQuantity = (event) => setQuantity(event.target.value);
  const requestStaffLookup = async () => {
    const validation = validateProductUrl(form.product_link);
    if (!validation.valid) { setError(validation.message); return; }
    setBusy(true); setError("");
    try {
      const result = await createProductLookupRequest(validation.sourceUrl);
      setLookupRequest(result.request);
      setMessage(`Đã gửi yêu cầu #${result.request.id} cho nhân viên. Dữ liệu sẽ chỉ hiển thị trong tài khoản của bạn.`);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  };
  const validationError = () => {
    const validation = validateProductUrl(form.product_link);
    if (!validation.valid) return validation.message;
    if (!form.product_name.trim() || Number(form.quantity) <= 0) return "Vui lòng nhập tên sản phẩm và số lượng hợp lệ.";
    if (form.has_variants && form.sku_extraction_complete && form.attribute_groups.length && !form.selected_sku_id) return "Vui lòng chọn đầy đủ phân loại hợp lệ trước khi thêm sản phẩm.";
    return "";
  };
  const addCart = () => {
    if (addingToCart.current) return;
    const reason = validationError(); if (reason) { setError(reason); return; }
    addingToCart.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      cart.addItem(localCartPayload(form));
      activeProductUrl.current = ""; dirtyFields.current.clear(); setForm(blank);
      setMessage("Đã thêm sản phẩm vào giỏ hàng trên trình duyệt.");
    }
    catch (reason) { setError(errorText(reason)); } finally { addingToCart.current = false; setBusy(false); }
  };
  const currentProductVisible = Boolean(form.product_name?.trim() || form.product_image || ["success", "partial"].includes(form.metadataStatus));
  const currentPrice = form.price_cny === "" || form.price_cny == null ? null : Number(form.price_cny);
  const currentQuantity = Math.max(1, Number(form.quantity) || 1);
  const currentTotal = currentPrice == null ? null : currentPrice * currentQuantity;
  const currentVariant = form.variant || [form.color, form.size].filter(Boolean).join(" / ") || (form.has_variants ? "Chưa chọn đủ phân loại" : "Sản phẩm không có biến thể");
  const { totalQuantity: cartQuantity, knownTotalCny: cartKnownTotal, unknownPriceCount: cartUnknownPriceCount } = cart.totals;
  const metadataSourceLabel = ({ extension: "Đã lấy từ Extension", remote: "Metadata dự phòng", staff: "Nhân viên hỗ trợ", manual: "Nhập thủ công", demo: "Dữ liệu minh họa" })[form.metadataSource] || "Dữ liệu tham khảo";
  const metadataStatusLabel = ({ success: metadataSourceLabel, partial: `${metadataSourceLabel} — chưa đầy đủ`, loading: "Đang lấy dữ liệu", error: "Lấy dữ liệu thất bại", unavailable: "Cần thao tác thêm" })[form.metadataStatus] || "Nhập thủ công";
  return <><PageHeader icon={ShoppingCart} eyebrow="Mua hộ hàng Trung Quốc" title="Tạo yêu cầu mua hộ" description="Dán link Taobao, Tmall hoặc 1688 — Customer Extension sẽ tự động đọc dữ liệu sản phẩm và SKU." />
    <section className={`${feature.contentCard} ${feature.linkCard}`}>
      <div className={feature.linkCardHeading}><div><strong>Link sản phẩm</strong><span>Extension tự chạy khi bạn dán link hợp lệ, không cần mở popup.</span></div><span className={feature.sourcePill}>{form.source}</span></div>
      <div className={feature.linkActionRow}><div className={feature.linkInput}><Search aria-hidden="true" /><input aria-label="Link sản phẩm" type="url" value={form.product_link} onChange={changeProductLink} placeholder="https://item.taobao.com/item.htm?id=..." />{form.product_link && <button type="button" className={feature.clearLinkButton} aria-label="Xóa link sản phẩm" onClick={clearProductLink}><X aria-hidden="true" /></button>}</div><button className={feature.primary} type="button" disabled={form.metadataStatus === "loading"} onClick={() => loadMetadata(form.product_link)}><Search aria-hidden="true" />{form.metadataStatus === "loading" ? "Đang lấy dữ liệu..." : form.metadataStatus === "idle" ? "Lấy thông tin sản phẩm" : "Thử lấy lại"}</button></div>
      {extensionNotice && <div className={`${feature.extensionConnectionStatus} ${feature[`extension_${extensionNotice.tone}`] || ""}`}><span><strong>{extensionNotice.title}</strong> — {extensionNotice.message}</span></div>}
      {form.metadataStatus !== "idle" && <div className={`${feature.extractionStatus} ${feature[`extraction_${form.metadataStatus}`] || ""}`}>{form.metadataStatus === "loading" ? <Search aria-hidden="true" /> : ["success", "partial"].includes(form.metadataStatus) ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}<span><strong>{metadataStatusLabel}</strong>{metadataMessage && ` — ${metadataMessage}`}</span></div>}
      {["error", "unavailable"].includes(form.metadataStatus) && <div className={feature.fallbackRow}><span>Bạn vẫn có thể nhập thủ công hoặc dùng metadata dự phòng.</span><button className={feature.secondary} type="button" disabled={busy || Boolean(lookupRequest)} onClick={requestStaffLookup}>{lookupRequest ? `Đã gửi yêu cầu #${lookupRequest.id}` : "Nhờ nhân viên hỗ trợ"}</button></div>}
    </section>
    <div className={feature.split}>
      <section className={feature.contentCard}>
        <ProductPreviewPanel product={{ ...form, name: form.product_name, sourceUrl: form.product_link, imageUrl: form.product_image, priceCny: form.price_cny }} status={form.metadataStatus} message={metadataMessage} selectedImage={form.product_image} onSelectImage={(image) => setForm((value) => ({ ...value, product_image: image }))} onRetry={form.metadataStatus === "error" ? loadMetadata : null} />
        <div className={feature.sectionHeading}><div><span>01</span><div><h2>Chọn phân loại</h2><p>Chỉ các tổ hợp SKU đã được nguồn hàng xác minh mới có thể chọn.</p></div></div></div>
        <ProductVariantSelector groups={form.attribute_groups} skus={form.skus} selection={form.selectedAttributes} extractionComplete={form.sku_extraction_complete} onChange={selectVariant} />
        <div className={feature.sectionHeading}><div><span>02</span><div><h2>Thông tin mua hàng</h2><p>Kiểm tra dữ liệu tự lấy và bổ sung phần còn thiếu trước khi thêm vào giỏ.</p></div></div></div>
        <div className={feature.formGrid}>
          <label className={feature.field}><span>Nguồn hàng</span><select value={form.source} onChange={(event) => update("source", event)}><option>Taobao</option><option>1688</option><option>Tmall</option></select></label>
          <label className={feature.field}><span>Tên sản phẩm *</span><input value={form.product_name} onChange={(event) => update("product_name", event)} /></label>
          <label className={feature.field}><span>Phân loại</span><input value={form.variant} onChange={(event) => update("variant", event)} /></label>
          <label className={feature.field}><span>Màu sắc</span><input value={form.color} onChange={(event) => update("color", event)} /></label>
          <label className={feature.field}><span>Kích thước / Quy cách</span><input value={form.size} onChange={(event) => update("size", event)} /></label>
          <div className={feature.field}><span>Số lượng *</span><div className={feature.purchaseQuantity}><button type="button" aria-label="Giảm số lượng sản phẩm" onClick={() => setQuantity(currentQuantity - 1)}>−</button><input aria-label="Số lượng sản phẩm" type="number" min="1" value={form.quantity} onChange={updateQuantity} /><button type="button" aria-label="Tăng số lượng sản phẩm" onClick={() => setQuantity(currentQuantity + 1)}>+</button></div></div>
          <label className={feature.field}><span>Giá tham khảo (CNY)</span><input type="number" min="0" step="0.01" value={form.price_cny} onChange={(event) => update("price_cny", event)} /></label>
          <div className={feature.readonlyTotal}><span>Thành tiền dự kiến</span><strong>{currentTotal == null ? "Chưa xác định" : `${currentTotal.toLocaleString("vi-VN")} CNY`}</strong></div>
          <label className={`${feature.field} ${feature.fullField}`}><span>Ghi chú sản phẩm</span><textarea value={form.note} onChange={(event) => update("note", event)} placeholder="Ví dụ: kiểm tra kỹ màu sắc, quy cách đóng gói..." /></label>
        </div>
      </section>
      <aside className={feature.summaryPanel}><header className={feature.cardHeader}><h2><ShoppingCart aria-hidden="true" />Tóm tắt yêu cầu</h2><p>Giỏ được tự động lưu riêng cho tài khoản này trên trình duyệt.</p></header>
        <section className={feature.currentProductSummary} aria-live="polite"><div className={feature.summarySectionTitle}><div><strong>Sản phẩm đang chọn</strong><small>Chưa thêm vào giỏ</small></div><span className={`${feature.currentStatus} ${feature[`currentStatus_${form.metadataStatus}`] || ""}`}>{metadataStatusLabel}</span></div>
          {currentProductVisible ? <article className={feature.currentProductCard}><ProductThumbnail src={form.product_image} alt={form.product_name} size="medium" /><div><strong>{form.product_name || "Chưa có tên sản phẩm"}</strong><p><span>{form.source}</span>{form.selected_sku_id && <span>SKU: {form.selected_sku_id}</span>}</p><small>{currentVariant}</small></div></article> : <div className={feature.currentProductEmpty}><Package /><span>Dán link để xem sản phẩm tại đây trước khi thêm vào giỏ.</span></div>}
          {currentProductVisible && <dl className={feature.currentProductTotals}><div><dt>Đơn giá tham khảo</dt><dd>{currentPrice == null ? "Chưa xác định" : `${currentPrice.toLocaleString("vi-VN")} CNY`}</dd></div><div><dt>Số lượng đang chọn</dt><dd>{currentQuantity}</dd></div><div><dt>Thành tiền dự kiến</dt><dd>{currentTotal == null ? "Chưa xác định" : `${currentTotal.toLocaleString("vi-VN")} CNY`}</dd></div></dl>}
        </section>
        <section className={feature.savedCartSummary}><div className={feature.summarySectionTitle}><div><strong>Giỏ hàng hiện tại</strong><small>Đã lưu trên trình duyệt</small></div><a href={routes.cart}>Xem giỏ hàng</a></div><dl><div><dt>Số mặt hàng đã lưu</dt><dd>{cart.items.length}</dd></div><div><dt>Tổng số lượng</dt><dd>{cartQuantity}</dd></div><div><dt>Tổng có giá xác định</dt><dd>{cart.items.length && cartUnknownPriceCount < cart.items.length ? `${cartKnownTotal.toLocaleString("vi-VN")} CNY` : "Chưa xác định"}</dd></div></dl>{cartUnknownPriceCount > 0 && <p>{cartUnknownPriceCount} mặt hàng chưa xác định giá, không được tính là 0.</p>}</section>
        <button className={`${feature.primary} ${feature.primaryCartButton}`} disabled={busy || form.metadataStatus === "loading" || !currentProductVisible} onClick={addCart}><ShoppingCart aria-hidden="true" />{busy ? "ĐANG THÊM VÀO GIỎ..." : "THÊM VÀO GIỎ HÀNG"}</button>
        <a className={feature.secondaryWide} href={routes.cart}><ClipboardList aria-hidden="true" />Mở giỏ hàng & bản nháp</a>
        {(error || cart.storageError) && <p className={feature.error} role="alert">{error || cart.storageError}</p>}{message && <p className={feature.notice} role="status">{message} <a href={routes.cart}>Mở giỏ hàng</a></p>}
        <p className={feature.referenceNote}>Giá, hình ảnh và thông tin nguồn hàng chỉ mang tính tham khảo; nhân viên sẽ xác nhận lại sau khi gửi yêu cầu.</p>
      </aside>
    </div></>;
}

export function RealCartAndDraftsPage({ routes, customerId, navigate = (destination) => window.location.assign(destination) }) {
  const cart = useCustomerCart(customerId);
  const [tab, setTab] = useState("cart");
  const [excludedIds, setExcludedIds] = useState(() => new Set());
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState("idle");
  const submittingRef = useRef(false);
  const selectedItems = cart.items.filter((item) => !excludedIds.has(item.local_item_id));
  const selectedIds = new Set(selectedItems.map((item) => item.local_item_id));
  const allSelected = cart.items.length > 0 && selectedItems.length === cart.items.length;
  const selectedTotals = useMemo(() => getCartTotals(selectedItems), [selectedItems]);
  const act = (callback, success) => {
    setError("");
    try { callback(); setMessage(success); } catch (reason) { setError(errorText(reason)); }
  };
  const toggleItem = (itemId) => setExcludedIds((current) => {
    const next = new Set(current);
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
    return next;
  });
  const toggleAll = () => setExcludedIds(allSelected ? new Set(cart.items.map((item) => item.local_item_id)) : new Set());
  const removeOne = (item) => {
    if (!window.confirm(`Xóa “${item.title}” khỏi giỏ hàng?`)) return;
    act(() => cart.removeItem(item.local_item_id), "Đã xóa sản phẩm khỏi giỏ.");
  };
  const removeSelected = () => {
    if (!selectedItems.length || !window.confirm(`Xóa ${selectedItems.length} sản phẩm đã chọn khỏi giỏ hàng?`)) return;
    act(() => selectedItems.forEach((item) => cart.removeItem(item.local_item_id)), "Đã xóa các sản phẩm đã chọn.");
    setExcludedIds(new Set());
  };
  const saveSelectedDraft = () => {
    if (!selectedItems.length) return;
    act(() => cart.saveDraft(selectedItems, cart.requestNote), `Đã lưu bản nháp gồm ${selectedItems.length} sản phẩm trên trình duyệt.`);
  };
  const restoreDraft = (draft) => {
    const prompt = cart.items.length ? "Các sản phẩm trong bản nháp sẽ được gộp vào giỏ hiện tại, không ghi đè dữ liệu. Tiếp tục?" : "Đưa các sản phẩm trong bản nháp vào giỏ để tiếp tục chỉnh sửa?";
    if (!window.confirm(prompt)) return;
    act(() => cart.restoreDraftToCart(draft.draft_id), "Đã gộp bản nháp vào giỏ hàng để tiếp tục chỉnh sửa.");
    setExcludedIds(new Set()); setTab("cart");
  };
  const removeDraft = (draft) => {
    if (!window.confirm(`Xóa “${draft.title}”? Giỏ hàng hiện tại sẽ không bị ảnh hưởng.`)) return;
    act(() => cart.deleteDraft(draft.draft_id), "Đã xóa bản nháp.");
  };
  const submit = async () => {
    const itemRefs = selectedItems.map((item) => item.local_item_id.slice(-8));
    submitDebug("click_received", { selectedCount: selectedItems.length, selectedItemRefs: itemRefs, locked: submittingRef.current });
    if (submittingRef.current) {
      setMessage("Yêu cầu đang được gửi. Vui lòng chờ phản hồi từ hệ thống.");
      submitDebug("blocked_by_submit_lock", { selectedCount: selectedItems.length, locked: true });
      return;
    }
    setSubmitPhase("validating");
    setMessage("Đang kiểm tra dữ liệu sản phẩm...");
    if (!selectedItems.length) {
      setError("Vui lòng chọn ít nhất một sản phẩm trước khi gửi yêu cầu mua hộ.");
      setMessage(""); setSubmitPhase("idle");
      submitDebug("validation_failed", { reason: "no_selected_items", selectedCount: 0, locked: false });
      return;
    }
    const incompleteItem = selectedItems.find((item) => !item.product_url || !item.title || (item.sku_required && !item.sku_id));
    if (incompleteItem) {
      setError(`Sản phẩm “${incompleteItem.title || "Chưa có tên"}” chưa đủ link, tên hoặc phân loại bắt buộc.`);
      setMessage(""); setSubmitPhase("idle");
      submitDebug("validation_failed", { reason: "incomplete_item", selectedCount: selectedItems.length, locked: false });
      return;
    }
    submittingRef.current = true; setSubmitting(true); setSubmitPhase("submitting"); setError(""); setMessage("Đang gửi yêu cầu mua hộ...");
    const snapshot = selectedItems.map((item) => ({ ...item, selected_attributes: { ...item.selected_attributes } }));
    let destination = null;
    try {
      const submission = cart.getOrCreateSubmission(snapshot, cart.requestNote);
      submitDebug("api_request_started", { selectedCount: snapshot.length, selectedItemRefs: itemRefs, locked: true, pendingKeyPresent: Boolean(submission.idempotency_key) });
      const response = await submitCustomerPurchaseRequest({ idempotency_key: submission.idempotency_key, note: cart.requestNote || null, items: snapshot });
      const order = response?.order;
      if (!order?.id) throw new Error("Hệ thống chưa trả về mã yêu cầu mua hộ. Giỏ hàng vẫn được giữ nguyên.");
      cart.removeSubmittedSnapshot(snapshot, submission.idempotency_key);
      setSubmitPhase("success");
      setMessage(`Đã tạo yêu cầu ${order.order_code || order.id}. Đang mở chi tiết đơn...`);
      destination = `${routes.orderDetail}?id=${order.id}`;
      submitDebug("submit_succeeded", { selectedCount: snapshot.length, selectedItemRefs: itemRefs, locked: true, pendingKeyPresent: false, orderId: order.id });
    } catch (reason) {
      setSubmitPhase("failed"); setMessage(""); setError(errorText(reason));
      submitDebug("submit_failed", { selectedCount: snapshot.length, selectedItemRefs: itemRefs, locked: true, pendingKeyPresent: true, errorCode: reason?.code || reason?.name || "REQUEST_FAILED" });
    } finally {
      submittingRef.current = false; setSubmitting(false); setSubmitPhase("idle");
      submitDebug("submit_released", { selectedCount: snapshot.length, locked: false, willNavigate: Boolean(destination) });
    }
    if (destination) navigate(destination);
  };
  const totalLabel = selectedItems.length && selectedTotals.unknownPriceCount === 0 ? `${selectedTotals.knownTotalCny.toLocaleString("vi-VN")} CNY` : "Chưa xác định";
  const draftList = (limit) => cart.drafts.slice(0, limit);
  const renderDrafts = (limit) => <section className={feature.savedDraftSection}>
    <header><div><ClipboardList /><span><strong>{limit ? "Bản nháp đã lưu gần đây" : "Tất cả bản nháp đã lưu"}</strong><small>Snapshot cục bộ, chưa tạo đơn hàng</small></span></div>{limit && cart.drafts.length > limit && <button type="button" onClick={() => setTab("drafts")}>Xem tất cả</button>}</header>
    {draftList(limit).length ? <div className={feature.savedDraftList}>{draftList(limit).map((draft) => <article className={feature.savedDraftRow} key={draft.draft_id}><div><strong title={draft.title}>{draft.title}</strong><small>{draft.items.length} sản phẩm · cập nhật {formatDateTime(draft.updated_at)}</small></div><div><button className={feature.secondary} type="button" onClick={() => restoreDraft(draft)}><Pencil />Tiếp tục chỉnh sửa</button><button className={feature.danger} type="button" onClick={() => removeDraft(draft)}><Trash2 />Xóa</button></div></article>)}</div> : <div className={feature.compactDraftEmpty}><ClipboardList /><span><strong>Chưa có bản nháp</strong><small>Chọn sản phẩm trong giỏ rồi nhấn “Lưu bản nháp”.</small></span></div>}
  </section>;

  return <><PageHeader icon={ShoppingCart} eyebrow="Mua hộ hàng Trung Quốc" title="Giỏ hàng & bản nháp" description="Quản lý các sản phẩm đã chọn, chỉnh sửa trước khi gửi yêu cầu mua hộ hoặc lưu làm bản nháp." action={<a className={styles.primaryAction} href={routes.createOrder}>Thêm sản phẩm</a>} />
    <div className={feature.cartTabs} role="tablist" aria-label="Giỏ hàng và bản nháp"><button type="button" role="tab" aria-selected={tab === "cart"} onClick={() => setTab("cart")}><ShoppingCart />Giỏ hàng hiện tại <b>{cart.items.length}</b></button><button type="button" role="tab" aria-selected={tab === "drafts"} onClick={() => setTab("drafts")}><ClipboardList />Bản nháp đã lưu <b>{cart.drafts.length}</b></button></div>
    {(error || cart.storageError) && <p className={feature.error} role="alert">{error || cart.storageError}</p>}{message && <p className={feature.notice} role="status">{message}</p>}
    {tab === "cart" ? <><div className={feature.cartWorkspace}><section className={feature.cartPanel}>{cart.items.length ? <><div className={feature.cartBulkBar}><label><input type="checkbox" checked={allSelected} onChange={toggleAll} /><span>Chọn tất cả ({selectedItems.length}/{cart.items.length} sản phẩm)</span></label><div><button type="button" className={feature.bulkDanger} disabled={!selectedItems.length} onClick={removeSelected}><Trash2 />Xóa đã chọn</button><button type="button" className={feature.bulkSave} disabled={!selectedItems.length} onClick={saveSelectedDraft}><ClipboardList />Lưu thành bản nháp</button></div></div><div className={feature.cartTableHeader}><span>Sản phẩm</span><span>Đơn giá tham khảo (CNY)</span><span>Số lượng</span><span>Thành tiền (CNY)</span><span>Thao tác</span></div><div className={feature.cartProductList}>{cart.items.map((item) => {
      const attributes = Object.entries(item.selected_attributes || {});
      const complete = Boolean(item.product_url && item.title && (!item.sku_required || item.sku_id));
      return <article className={`${feature.cartProductRow} ${selectedIds.has(item.local_item_id) ? "" : feature.cartProductRowMuted}`} key={item.local_item_id}>
        <div className={feature.cartProductMain}><input aria-label={`Chọn ${item.title}`} type="checkbox" checked={selectedIds.has(item.local_item_id)} onChange={() => toggleItem(item.local_item_id)} /><ProductThumbnail src={item.main_image} alt={item.title} size="large" /><div className={feature.cartProductInfo}><strong title={item.title}>{item.title}</strong><p><span className={feature.sourcePill}>{item.platform || "Nguồn khác"}</span><a href={item.product_url} target="_blank" rel="noreferrer" title={item.product_url}>{item.product_url}<ExternalLink /></a></p><div className={feature.attributeChips}>{item.sku_id && <span title={item.sku_id}>SKU: {item.sku_id}</span>}{attributes.slice(0, 3).map(([name, value]) => <span title={`${name}: ${value}`} key={`${name}-${value}`}>{name}: <b>{value}</b></span>)}{!attributes.length && item.variant_label && <span title={item.variant_label}>Phân loại: <b>{item.variant_label}</b></span>}</div><small className={complete ? feature.itemComplete : feature.itemIncomplete}>{complete ? <Check /> : <AlertCircle />}{complete ? "Đủ thông tin" : "Cần kiểm tra thêm"}</small><div className={feature.compactNote}>{editingNoteId === item.local_item_id ? <><input autoFocus aria-label={`Ghi chú ${item.title}`} value={item.product_note || ""} maxLength="2000" onChange={(event) => act(() => cart.updateItem(item.local_item_id, { product_note: event.target.value }), "")} placeholder="Thêm ghi chú sản phẩm" /><button type="button" aria-label="Hoàn tất sửa ghi chú" onClick={() => setEditingNoteId(null)}><Check /></button></> : <button type="button" onClick={() => setEditingNoteId(item.local_item_id)} title={item.product_note || "Thêm ghi chú"}><Pencil /><span>{item.product_note || "Thêm ghi chú"}</span></button>}</div></div></div>
        <div className={feature.cartUnitPrice}><small>Đơn giá tham khảo</small><strong>{item.reference_price_cny == null ? "Chưa xác định" : Number(item.reference_price_cny).toLocaleString("vi-VN")}</strong></div>
        <div className={feature.cartQuantity}><small>Số lượng</small><div className={feature.quantityControl}><button aria-label={`Giảm số lượng ${item.title}`} onClick={() => act(() => cart.updateItem(item.local_item_id, { quantity: Math.max(1, item.quantity - 1) }), "Đã cập nhật số lượng.")}>−</button><input aria-label={`Số lượng ${item.title}`} type="number" min="1" value={item.quantity} onChange={(event) => act(() => cart.updateItem(item.local_item_id, { quantity: Math.max(1, Number(event.target.value) || 1) }), "Đã cập nhật số lượng.")} /><button aria-label={`Tăng số lượng ${item.title}`} onClick={() => act(() => cart.updateItem(item.local_item_id, { quantity: item.quantity + 1 }), "Đã cập nhật số lượng.")}>+</button></div></div>
        <div className={feature.cartLineTotal}><small>Thành tiền</small><strong>{item.reference_price_cny == null ? "Chưa xác định" : (Number(item.reference_price_cny) * item.quantity).toLocaleString("vi-VN")}</strong></div>
        <div className={feature.cartRowActions}><button type="button" aria-label={`Chỉnh sửa ${item.title}`} onClick={() => setEditingNoteId(item.local_item_id)}><Pencil /></button><button type="button" aria-label={`Xóa ${item.title}`} onClick={() => removeOne(item)}><Trash2 /></button></div>
      </article>;
    })}</div></> : <div className={feature.cartEmpty}><ShoppingCart /><h2>Giỏ hàng đang trống</h2><p>Dán link sản phẩm, chọn SKU và thêm vào giỏ để chuẩn bị yêu cầu mua hộ.</p><a className={feature.primary} href={routes.createOrder}>Tạo yêu cầu mua hộ</a></div>}</section>
      <aside className={feature.cartSummary}><header><ShoppingCart /><div><h2>Tóm tắt giỏ hàng</h2><p>Tính theo sản phẩm đang được chọn.</p></div></header><dl><div><dt>Sản phẩm trong giỏ</dt><dd>{cart.items.length}</dd></div><div><dt>Sản phẩm được chọn</dt><dd>{selectedItems.length}</dd></div><div><dt>Tổng số lượng đã chọn</dt><dd>{selectedTotals.totalQuantity}</dd></div><div><dt>Tổng tiền tham khảo</dt><dd>{totalLabel}</dd></div></dl>{selectedTotals.unknownPriceCount > 0 && <p className={feature.referenceNote}>{selectedTotals.unknownPriceCount} mặt hàng được chọn chưa có giá xác minh và không được tự tính là 0.</p>}<label className={feature.field}><span>Ghi chú chung cho yêu cầu</span><textarea value={cart.requestNote} maxLength="2000" onChange={(event) => act(() => cart.updateRequestNote(event.target.value), "")} placeholder="Ví dụ: giao hàng gộp, yêu cầu đóng gói..." /><small>{cart.requestNote.length}/2000 · tự động lưu trên trình duyệt</small></label><p className={feature.referenceNote}>Giá chỉ mang tính tham khảo. Chi phí thực tế sẽ được nhân viên xác nhận khi đặt hàng.</p><button type="button" className={feature.secondaryWide} disabled={!selectedItems.length} onClick={saveSelectedDraft}><ClipboardList />Lưu bản nháp</button><button type="button" className={`${feature.primary} ${feature.submitCartButton}`} data-submit-state={submitPhase} disabled={submitting || submitPhase === "validating"} aria-busy={submitting || submitPhase === "validating"} onClick={submit}><Send />{submitPhase === "validating" ? "Đang kiểm tra sản phẩm..." : submitting ? "Đang gửi yêu cầu..." : `Gửi ${selectedItems.length} sản phẩm mua hộ`}</button></aside>
    </div>{renderDrafts(2)}</> : renderDrafts()}
  </>;
}

const formatCny = (value) => value === null || value === undefined || value === "" ? "Chưa xác định" : `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} CNY`;
const formatOptionalVnd = (value, exchangeRate) => value && exchangeRate ? formatVnd(value) : "Chưa xác định";
const creationSourceLabel = (source) => ({ customer_portal: "Khách hàng tự gửi", admin_portal: "Nhân viên tạo hộ", legacy: "Đơn cũ / chưa phân loại" })[source] || "Chưa có thông tin";
const paymentLabel = (payment) => {
  if (!payment?.status) return "Chưa có yêu cầu thanh toán";
  return ({ paid: "Đã thanh toán", partial_paid: "Đã thanh toán một phần", waiting_payment: "Chờ thanh toán", unpaid: "Chưa thanh toán", draft: "Chưa phát hành" })[payment.status] || payment.status.replaceAll("_", " ");
};
const historyLabel = (type) => ({ created: "Đã gửi yêu cầu", order_updated: "Đơn hàng được cập nhật", tracking: "Cập nhật vận chuyển", cn_warehouse_received: "Đã tới kho Trung Quốc", invoice: "Đã phát hành thanh toán" })[type] || type.replaceAll("_", " ");
const statusTotal = (statistics, statuses) => statuses.reduce((sum, status) => sum + Number(statistics?.by_status?.[status] || 0), 0);
const visiblePages = (current, last) => {
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "end-gap", last];
  if (current >= last - 3) return [1, "start-gap", last - 4, last - 3, last - 2, last - 1, last];
  return [1, "start-gap", current - 1, current, current + 1, "end-gap", last];
};

const productSource = (item) => {
  const link = String(item?.product_link || "").toLowerCase();
  if (link.includes("1688.com")) return "1688";
  if (link.includes("tmall.com")) return "Tmall";
  if (link.includes("taobao.com")) return "Taobao";
  return item?.shop_name || item?.seller || "";
};

function OrderProductPreview({ order, historyMode = false }) {
  const items = order.items || [];
  const first = items[0];
  const variant = [first?.color, first?.size].filter(Boolean).join(" / ");
  const source = productSource(first);
  if (historyMode) return <div className={feature.historyProductPreview} title={first?.product_name || "Sản phẩm trong đơn"}><div className={feature.orderThumbStack}>{items.slice(0, 3).map((item, index) => <ProductThumbnail key={item.id || index} src={item.product_image} alt={item.product_name || order.order_code} size="small" />)}{items.length > 3 && <span>+{items.length - 3}</span>}</div></div>;
  return <div className={feature.orderProductPreview}><div className={feature.orderPrimaryThumb}><ProductThumbnail src={first?.product_image} alt={first?.product_name || order.order_code} size="small" />{items.length > 1 && <span>+{items.length - 1}</span>}</div><div><strong title={first?.product_name || "Chưa có tên sản phẩm"}>{first?.product_name || "Chưa có tên sản phẩm"}</strong>{(source || variant) && <small title={[source, variant].filter(Boolean).join(" · ")}>{source}{source && variant && " · "}{variant && `Phân loại: ${variant}`}</small>}</div></div>;
}

function OrderMobileCard({ order, routes }) {
  return <article className={feature.orderMobileCard}><header><div><strong title={order.order_code}>{order.order_code}</strong><small>Tạo {formatDateTime(order.created_at)}</small></div><StatusBadge status={order.status} /></header><OrderProductPreview order={order} /><dl><div><dt>Mặt hàng / SL</dt><dd>{order.item_count} / {order.quantity}</dd></div><div><dt>Tổng CNY</dt><dd>{formatCny(order.product_total_cny)}</dd></div><div><dt>Tổng VND</dt><dd>{formatVnd(order.product_total_vnd)}</dd></div><div><dt>Cập nhật</dt><dd>{formatDateTime(order.updated_at)}</dd></div></dl><a className={feature.detailButton} href={`${routes.orderDetail}?id=${order.id}`}>Xem chi tiết <ChevronRight /></a></article>;
}

export function RealOrdersPage({ historyMode = false, routes }) {
  const [result, setResult] = useState(null); const [search, setSearch] = useState(""); const [status, setStatus] = useState(""); const [createdFrom, setCreatedFrom] = useState(""); const [createdTo, setCreatedTo] = useState(""); const [draftSearch, setDraftSearch] = useState(""); const [draftStatus, setDraftStatus] = useState(""); const [draftFrom, setDraftFrom] = useState(""); const [draftTo, setDraftTo] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [retryKey, setRetryKey] = useState(0); const [page, setPage] = useState(1); const [perPage, setPerPage] = useState(10);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try { const value = await getCustomerOrders({ search, status, created_from: createdFrom, created_to: createdTo, page, per_page: perPage }); if (active) setResult(value); }
      catch (reason) { if (active) setError(errorText(reason)); }
      finally { if (active) setLoading(false); }
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [search, status, createdFrom, createdTo, page, perPage, retryKey]);
  const orders = result?.orders || [];
  const statistics = result?.statistics;
  const total = result?.pagination?.total || 0; const lastPage = result?.pagination?.last_page || 1;
  const updateDraftFrom = (event) => { const value = event.target.value; setDraftFrom(value); if (draftTo && value > draftTo) setDraftTo(""); };
  const applyFilters = (event) => { event.preventDefault(); setSearch(draftSearch.trim()); setStatus(draftStatus); setCreatedFrom(draftFrom); setCreatedTo(draftTo); setPage(1); };
  const clearFilters = () => { setDraftSearch(""); setDraftStatus(""); setDraftFrom(""); setDraftTo(""); setSearch(""); setStatus(""); setCreatedFrom(""); setCreatedTo(""); setPage(1); };
  const hasFilters = Boolean(search || status || createdFrom || createdTo || draftSearch || draftStatus || draftFrom || draftTo);
  const stats = historyMode
    ? [["Tổng đơn hàng", statistics?.total ?? total, ClipboardList, "orange"], ["Đã hoàn thành", statusTotal(statistics, ["completed", "delivered"]), PackageCheck, "green"], ["Đang vận chuyển", statusTotal(statistics, ["shipping", "in_transit", "shipped", "receiving", "waiting_cn_warehouse"]), ShoppingBag, "blue"], ["Đang xử lý", statusTotal(statistics, ["pending", "processing", "awaiting_deposit", "deposited", "awaiting_tracking", "purchasing"]), FileClock, "amber"], ["Đã hủy", statusTotal(statistics, ["cancelled", "canceled"]), X, "red"]]
    : [["Tổng đơn hàng", statistics?.total ?? total, ShoppingBag, "orange"], ["Đang xử lý", statusTotal(statistics, ["pending", "processing", "awaiting_deposit", "deposited", "awaiting_tracking"]), FileClock, "blue"], ["Đang mua hàng", statusTotal(statistics, ["purchasing"]), ShoppingCart, "amber"], ["Đang vận chuyển", statusTotal(statistics, ["shipping", "in_transit", "shipped", "receiving", "waiting_cn_warehouse"]), Package, "violet"]];
  return <><div className={feature.ordersHeader}><PageHeader icon={historyMode ? FileClock : ShoppingBag} title={historyMode ? "Lịch sử đơn hàng" : "Đơn hàng mua hộ"} description={historyMode ? "Tra cứu các đơn hàng đã tạo theo thời gian và trạng thái xử lý thực tế." : "Theo dõi các yêu cầu mua hộ đang được tiếp nhận, mua hàng và vận chuyển."} /></div>
    <div className={`${feature.orderStats} ${historyMode ? feature.historyOrderStats : ""}`}>{stats.map(([label, value, Icon, tone]) => <article className={`${feature.orderStat} ${feature[`stat_${tone}`]}`} key={label}><span className={feature.orderStatIcon}><Icon /></span><div><small>{label}</small><strong>{value}</strong></div><Icon className={feature.orderStatWatermark} aria-hidden="true" /></article>)}</div>
    <form className={`${feature.orderFilterForm} ${historyMode ? feature.historyFilterForm : ""}`} onSubmit={applyFilters}><label className={feature.orderSearch}><Search /><input aria-label="Tìm kiếm đơn hàng" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Tìm mã đơn, tên sản phẩm hoặc link sản phẩm..." /></label>{!historyMode && <label className={feature.orderFilterField}><span>Trạng thái</span><div><Filter /><select aria-label="Lọc trạng thái" value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}><option value="">Tất cả trạng thái</option><option value="pending">Chờ xử lý</option><option value="awaiting_deposit">Chờ đặt cọc</option><option value="purchasing">Đang mua hàng</option><option value="waiting_cn_warehouse">Chờ về kho Trung Quốc</option><option value="receiving">Đang tiếp nhận</option><option value="shipped">Đang vận chuyển</option><option value="completed">Hoàn tất</option><option value="cancelled">Đã hủy</option></select></div></label>}<label className={feature.orderDateField}><span>{historyMode ? "Khoảng thời gian" : "Thời gian tạo đơn"}</span><div><CalendarDays /><input aria-label="Từ ngày" title="Từ ngày" type="date" value={draftFrom} onChange={updateDraftFrom} /><i>–</i><input aria-label="Đến ngày" title="Đến ngày" type="date" min={draftFrom || undefined} value={draftTo} onChange={(event) => setDraftTo(event.target.value)} />{hasFilters && <button aria-label="Xóa bộ lọc" type="button" onClick={clearFilters}><X /></button>}</div></label>{historyMode && <label className={feature.orderFilterField}><span>Trạng thái</span><div><Filter /><select aria-label="Lọc trạng thái" value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}><option value="">Tất cả trạng thái</option><option value="pending">Chờ xử lý</option><option value="awaiting_deposit">Chờ đặt cọc</option><option value="purchasing">Đang mua hàng</option><option value="waiting_cn_warehouse">Chờ về kho Trung Quốc</option><option value="receiving">Đang tiếp nhận</option><option value="shipped">Đang vận chuyển</option><option value="completed">Hoàn tất</option><option value="cancelled">Đã hủy</option></select></div></label>}<button className={feature.applyFilterButton} type="submit"><Filter />Lọc</button></form>
    {error && <section className={feature.contentCard}><p className={feature.error} role="alert">{error}</p><button className={feature.primary} type="button" onClick={() => setRetryKey((value) => value + 1)}>Thử lại</button></section>}{loading && !result ? <LoadingState /> : !error && <section className={`${styles.panel} ${feature.ordersPanel}`}>{orders.length ? <><div className={`${styles.tableWrap} ${feature.ordersDesktopTable}`}><table className={`${styles.table} ${feature.ordersTable} ${historyMode ? feature.historyOrdersTable : feature.activeOrdersTable}`}><thead><tr>{!historyMode && <th>#</th>}<th>Mã đơn</th><th>{historyMode ? "Sản phẩm (đại diện)" : "Sản phẩm"}</th><th>{historyMode ? "Số mặt hàng" : "Số lượng"}</th><th>Tổng CNY</th><th>Tổng VND</th><th>Trạng thái</th><th>Cập nhật</th><th>Thao tác</th></tr></thead><tbody>{orders.map((order, index) => <tr key={order.id}>{!historyMode && <td className={feature.orderIndexCell}>{(page - 1) * perPage + index + 1}</td>}<td className={feature.orderCodeCell}><strong title={order.order_code}>{order.order_code}</strong><small>Tạo: {formatDateTime(order.created_at)}</small></td><td><OrderProductPreview order={order} historyMode={historyMode} /></td><td className={feature.orderQuantityCell}>{historyMode ? <strong>{order.item_count} mặt hàng</strong> : <><strong>{order.quantity}</strong>{order.item_count > 1 && <small>{order.item_count} mặt hàng</small>}</>}</td><td className={feature.moneyCell}>{formatCny(order.product_total_cny)}</td><td className={feature.moneyCell}>{formatVnd(order.product_total_vnd)}</td><td className={feature.statusCell}><StatusBadge status={order.status} /></td><td className={feature.orderTimeCell}>{formatDateTime(order.updated_at)}</td><td><a className={feature.detailButton} href={`${routes.orderDetail}?id=${order.id}`}>{historyMode ? <>Xem chi tiết <ChevronRight /></> : <><Eye />Chi tiết</>}</a></td></tr>)}</tbody></table></div><div className={feature.orderMobileList}>{orders.map((order) => <OrderMobileCard key={order.id} order={order} routes={routes} />)}</div><footer className={feature.ordersPagination}><span>Hiển thị {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} trên {total} đơn hàng</span><div><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Trang trước"><ChevronLeft /></button>{visiblePages(page, lastPage).map((number) => typeof number === "string" ? <span className={feature.pageGap} key={number}>…</span> : <button className={number === page ? feature.activePage : ""} key={number} onClick={() => setPage(number)} aria-label={`Trang ${number}`} aria-current={number === page ? "page" : undefined}>{number}</button>)}<button disabled={page >= lastPage} onClick={() => setPage((value) => Math.min(lastPage, value + 1))} aria-label="Trang sau"><ChevronRight /></button><select aria-label="Số đơn mỗi trang" value={perPage} onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}><option value="10">10 / trang</option><option value="20">20 / trang</option><option value="50">50 / trang</option></select></div></footer></> : <EmptyState title={historyMode ? "Không có đơn trong khoảng thời gian này" : "Bạn chưa có đơn hàng mua hộ"} description={historyMode ? "Thay đổi thời gian hoặc bộ lọc để xem lịch sử đơn hàng." : "Tạo yêu cầu mua hộ từ sản phẩm đã thêm trong giỏ hàng."} />}</section>}
  </>;
}

export function RealOrderDetailPage({ routes }) {
  const id = new URLSearchParams(window.location.search).get("id") || window.location.pathname.split("/").filter(Boolean).pop(); const [order, setOrder] = useState(null); const [error, setError] = useState(""); const [retryKey, setRetryKey] = useState(0); const [copyState, setCopyState] = useState("");
  useEffect(() => { let active = true; getCustomerOrder(id).then(({ order: value }) => { if (active) setOrder(value); }).catch((reason) => { if (active) setError(errorText(reason)); }); return () => { active = false; }; }, [id, retryKey]);
  const copyOrderCode = async () => {
    try { await navigator.clipboard.writeText(order.order_code); setCopyState("Đã sao chép"); }
    catch { setCopyState("Không thể sao chép"); }
  };
  if (error) return <><PageHeader title="Không thể mở đơn hàng" /><section className={feature.contentCard}><p className={feature.error} role="alert">{error}</p><button className={feature.primary} type="button" onClick={() => { setError(""); setRetryKey((value) => value + 1); }}>Thử lại</button></section></>;
  if (!order) return <LoadingState />;
  const items = order.items || [];
  const isCustomerSubmission = order.creation_source === "customer_portal";
  const priceTitle = isCustomerSubmission ? "Đơn giá tham khảo" : "Đơn giá (CNY)";
  const totalTitle = isCustomerSubmission ? "Tổng tiền tham khảo" : "Tổng tiền sản phẩm";
  const stats = [
    ["Trạng thái đơn", <StatusBadge status={order.status} />, CheckCircle2, "green"],
    ["Ngày tạo", formatDateTime(order.created_at), CalendarDays, "violet"],
    ["Tổng sản phẩm", `${order.item_count ?? items.length} sản phẩm`, Box, "blue"],
    [totalTitle, formatCny(order.product_total_cny), Coins, "amber"],
    ["Thanh toán", paymentLabel(order.payment), CreditCard, "orange"],
    ["Nhân viên phụ trách", order.account_manager?.name || "Chưa tiếp nhận", UserRound, "slate"],
  ];
  return <div className={feature.orderDetailPage}>
    <header className={feature.detailHero}><div className={feature.detailHeroTitle}><span><ShoppingBag /></span><div><h1>Chi tiết đơn mua hộ</h1><p>Thông tin chi tiết, tiến trình xử lý và lịch sử của đơn hàng mua hộ.</p></div></div><div className={feature.detailCode}><span>Mã đơn: <strong>{order.order_code}</strong></span><button type="button" onClick={copyOrderCode} aria-label="Sao chép mã đơn"><Copy /></button>{copyState && <small role="status">{copyState}</small>}</div></header>
    <section className={feature.detailStats} aria-label="Tổng quan nhanh">{stats.map(([label, value, Icon, tone]) => <article className={`${feature.detailStat} ${feature[`detailStat_${tone}`]}`} key={label}><span><Icon /></span><div><small>{label}</small><strong>{value}</strong></div></article>)}</section>
    <div className={feature.detailContentGrid}>
      <section className={feature.detailPanel}><header className={feature.detailPanelHeader}><div><Box /><h2>Sản phẩm ({items.length})</h2></div></header>
        {items.length ? <><div className={feature.detailProductTable}><table><thead><tr><th>#</th><th>Sản phẩm</th><th>Phân loại / SKU</th><th>SL</th><th>{priceTitle}<br />(CNY)</th><th>Thành tiền<br />(CNY)</th><th>Ghi chú</th><th>Trạng thái</th></tr></thead><tbody>{items.map((item, index) => {
          const attributes = Object.entries(item.selected_attributes || {}); const variant = item.variant_label || [item.color, item.size].filter(Boolean).join(" / ");
          return <tr key={item.id}><td>{index + 1}</td><td><div className={feature.detailProduct}><ProductThumbnail src={item.product_image} alt={item.product_name || "Sản phẩm"} size="medium" /><div><strong>{item.product_name || "Chưa có tên sản phẩm"}</strong><p><b>{productSource(item) || "Nguồn chưa xác định"}</b>{item.product_link && <a href={item.product_link} target="_blank" rel="noreferrer"><Link2 />Mở link</a>}</p></div></div></td><td><div className={feature.detailVariant}>{variant && <strong>{variant}</strong>}{attributes.map(([name, value]) => <small key={name}>{name}: {value}</small>)}{item.source_sku_id && <small>SKU: {item.source_sku_id}</small>}{!variant && !attributes.length && !item.source_sku_id && <span>—</span>}</div></td><td>{item.quantity}</td><td>{formatCny(item.price_cny)}</td><td>{formatCny(item.reference_subtotal_cny ?? (item.subtotal_cny && Number(item.subtotal_cny) > 0 ? item.subtotal_cny : null))}</td><td>{item.note || "—"}</td><td><StatusBadge status={order.status} /></td></tr>;
        })}</tbody></table></div><div className={feature.detailProductCards}>{items.map((item) => <article key={item.id}><div><ProductThumbnail src={item.product_image} alt={item.product_name || "Sản phẩm"} size="large" /><div><strong>{item.product_name || "Chưa có tên sản phẩm"}</strong><small>{item.variant_label || [item.color, item.size].filter(Boolean).join(" / ") || "Chưa có phân loại"}</small></div></div><dl><div><dt>Số lượng</dt><dd>{item.quantity}</dd></div><div><dt>{priceTitle}</dt><dd>{formatCny(item.price_cny)}</dd></div><div><dt>Thành tiền</dt><dd>{formatCny(item.reference_subtotal_cny)}</dd></div></dl>{item.product_link && <a href={item.product_link} target="_blank" rel="noreferrer"><ExternalLink />Mở link sản phẩm</a>}</article>)}</div></> : <EmptyState title="Đơn hàng chưa có sản phẩm" />}
      </section>
      <aside className={`${feature.detailPanel} ${feature.detailOverview}`}><header className={feature.detailPanelHeader}><div><Layers3 /><h2>Tổng quan đơn hàng</h2></div></header><dl><div><dt>Tổng sản phẩm</dt><dd>{order.item_count ?? items.length} sản phẩm</dd></div><div><dt>Tổng số lượng</dt><dd>{order.quantity ?? items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</dd></div><div><dt>Tổng CNY</dt><dd>{formatCny(order.product_total_cny)}</dd></div><div><dt>Quy đổi VND tham khảo</dt><dd>{formatOptionalVnd(order.product_total_vnd, order.exchange_rate)}</dd></div><div><dt>Trạng thái thanh toán</dt><dd>{paymentLabel(order.payment)}</dd></div></dl><p><AlertCircle />Giá và quy đổi chỉ mang tính tham khảo cho đến khi nhân viên xác nhận.</p>{routes.support && <a className={feature.detailSupport} href={routes.support}><Headphones />Liên hệ hỗ trợ</a>}<a className={feature.detailBack} href={routes.orders}><ArrowLeft />Quay lại danh sách</a></aside>
    </div>
    <OrderShipmentPanel orderId={order.id} routes={routes} />
    <div className={feature.detailLowerGrid}>
      <section className={feature.detailPanel}><header className={feature.detailPanelHeader}><div><Clock3 /><span><h2>Tiến trình xử lý</h2><p>Các mốc đã được hệ thống ghi nhận</p></span></div></header>{order.history?.length ? <ol className={feature.detailTimeline}>{order.history.map((event, index) => <li key={`${event.type}-${event.occurred_at}-${index}`}><span><Check /></span><div><strong>{historyLabel(event.type)}</strong><small>{formatDateTime(event.occurred_at)}</small><StatusBadge status={event.status} /></div></li>)}</ol> : <EmptyState title="Chưa có lịch sử xử lý" description="Các mốc sẽ xuất hiện khi hệ thống ghi nhận thay đổi." />}</section>
      <section className={feature.detailPanel}><header className={feature.detailPanelHeader}><div><FileText /><h2>Thông tin yêu cầu</h2></div></header><div className={feature.detailRequest}><section><h3>Ghi chú chung</h3><p>{order.note || "Không có ghi chú."}</p></section><section><h3>Thông tin liên hệ</h3>{order.customer_contact ? <dl><div><dt><UserRound />Người liên hệ</dt><dd>{order.customer_contact.name || "Chưa cung cấp"}</dd></div><div><dt><Phone />Số điện thoại</dt><dd>{order.customer_contact.phone || order.submitted_by?.phone || "Chưa cung cấp"}</dd></div><div><dt><Mail />Email</dt><dd>{order.customer_contact.email || order.submitted_by?.email || "Chưa cung cấp"}</dd></div></dl> : <p>Chưa có thông tin liên hệ trong dữ liệu đơn.</p>}</section><section className={feature.detailSource}><Database /><span>Nguồn tạo đơn</span><strong>{creationSourceLabel(order.creation_source)}</strong></section></div></section>
    </div>
  </div>;
}
