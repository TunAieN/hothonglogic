import { useCallback, useEffect, useRef, useState } from "react";
import { Package, Search } from "lucide-react";
import {
  addPurchaseCartItem, createPurchaseDraft, deletePurchaseCartItem, deletePurchaseDraft,
  createProductLookupRequest, getProductLookupRequest,
  getCustomerOrder, getCustomerOrders, getPurchaseWorkspace, submitPurchaseCart,
  submitPurchaseDraft, updatePurchaseCartItem, updatePurchaseDraft, savePurchaseCartAsDraft,
} from "../../api/customerPortal.js";
import { EmptyState, LoadingState, PageHeader, StatusBadge } from "../../components/customer/PortalComponents.jsx";
import ProductThumbnail from "../../components/customer/ProductThumbnail.jsx";
import ProductPreviewPanel from "../../components/customer/ProductPreviewPanel.jsx";
import ProductVariantSelector from "../../components/customer/ProductVariantSelector.jsx";
import { formatDateTime, formatVnd } from "../../utils/customerFormatters.js";
import { detectProductSource, getProductMetadata, validateProductUrl } from "../../services/productMetadata.js";
import { extractProductWithExtension, mapExtensionProduct } from "../../services/customerExtension.js";
import { priceForQuantity, semanticValue, variantLabel } from "../../services/skuSelection.js";
import styles from "../../components/customer/CustomerPortal.module.css";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

const blank = { source: "Taobao", product_link: "", product_name: "", variant: "", color: "", size: "", quantity: 1, price_cny: "", note: "", product_image: "", seller: "", shop_name: "", images: [], skus: [], attribute_groups: [], selectedAttributes: {}, selected_sku_id: null, has_variants: false, sku_extraction_complete: true, quantity_price_tiers: [], metadataStatus: "idle", metadataSource: "manual" };
const errorText = (error) => error?.message || "Không thể thực hiện yêu cầu.";
const missingFieldLabel = (field) => ({ skus: "phân loại/SKU", price_cny: "giá", images: "ảnh", title: "tên sản phẩm" })[field] || field;
const itemPayload = (item) => {
  const skuNote = item.selected_sku_id ? `SKU nguồn: ${item.selected_sku_id}` : "";
  const note = skuNote && !String(item.note || "").includes(skuNote) ? [item.note, skuNote].filter(Boolean).join("\n") : item.note;
  return ({
  ...item, note: note || null, quantity: Number(item.quantity),
  price_cny: item.price_cny === "" || item.price_cny == null ? null : Number(item.price_cny),
  product_link: item.product_link || null, product_image: item.product_image || null,
  });
};

export function RealCreateOrderPage({ routes }) {
  const draftId = new URLSearchParams(window.location.search).get("draft");
  const [form, setForm] = useState(blank);
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState("");
  const [lookupRequest, setLookupRequest] = useState(null);
  const dirtyFields = useRef(new Set());
  const extraction = useRef({ sequence: 0, controller: null });

  useEffect(() => {
    if (!draftId) return;
    getPurchaseWorkspace().then(({ drafts }) => {
      const draft = drafts.find((entry) => String(entry.id) === String(draftId));
      if (draft) { setTitle(draft.title || ""); setNote(draft.note || ""); setItems(draft.items); }
    }).catch((reason) => setError(errorText(reason)));
  }, [draftId]);

  useEffect(() => () => extraction.current.controller?.abort(), []);
  const update = (key, event) => {
    dirtyFields.current.add(key);
    setForm((value) => ({ ...value, [key]: event.target.value }));
  };
  const applyMetadata = useCallback((result, validation, source) => {
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
      try {
        const extensionResult = await extractProductWithExtension(validation.sourceUrl, { signal: controller.signal, onStatus: (status) => {
          if (sequence === extraction.current.sequence) setMetadataMessage(status === "loading" ? "Extension đang đọc trang sản phẩm..." : "Extension đã nhận yêu cầu...");
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
          return;
        }
      } catch (reason) {
        if (reason?.name === "AbortError" || sequence !== extraction.current.sequence) return;
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
    const validation = validateProductUrl(form.product_link);
    if (!validation.valid) return;
    const timer = setTimeout(() => void loadMetadata(validation.sourceUrl), 550);
    return () => clearTimeout(timer);
  }, [form.product_link, loadMetadata]);
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
  const updateQuantity = (event) => {
    const quantity = event.target.value;
    dirtyFields.current.add("quantity");
    setForm((value) => {
      const sku = value.skus.find((entry) => entry.sku_id === value.selected_sku_id) || null;
      const price = priceForQuantity({ sku, productTiers: value.quantity_price_tiers, quantity, fallbackPrice: value.price_cny });
      return { ...value, quantity, price_cny: price ?? value.price_cny };
    });
  };
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
    if (!form.product_name.trim() || Number(form.quantity) <= 0) return "Vui lòng nhập tên sản phẩm và số lượng hợp lệ.";
    if (form.has_variants && form.sku_extraction_complete && form.attribute_groups.length && !form.selected_sku_id) return "Vui lòng chọn đầy đủ phân loại hợp lệ trước khi thêm sản phẩm.";
    return "";
  };
  const addLocal = () => {
    const reason = validationError(); if (reason) { setError(reason); return; }
    setItems((value) => [...value, { ...itemPayload(form), id: `local-${crypto.randomUUID()}` }]);
    dirtyFields.current.clear(); setForm(blank); setError("");
  };
  const addCart = async () => {
    const reason = validationError(); if (reason) { setError(reason); return; }
    setBusy(true); setError("");
    try { await addPurchaseCartItem(itemPayload(form)); dirtyFields.current.clear(); setForm(blank); setMessage("Đã lưu sản phẩm vào giỏ hàng."); }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  };
  const persist = async () => {
    if (!items.length) throw new Error("Hãy thêm ít nhất một sản phẩm.");
    const payload = { title: title || `Yêu cầu ${new Date().toLocaleDateString("vi-VN")}`, note: note || null, items: items.map(itemPayload) };
    return draftId ? updatePurchaseDraft(draftId, payload) : createPurchaseDraft({ ...payload, idempotency_key: crypto.randomUUID() });
  };
  const save = async () => {
    setBusy(true); setError("");
    try {
      const { draft } = await persist(); setMessage("Đã lưu bản nháp trên hệ thống.");
      if (!draftId) window.history.replaceState(null, "", `${routes.createOrder}?draft=${draft.id}`);
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setError("");
    try { const { draft } = await persist(); const { order } = await submitPurchaseDraft(draft.id); window.location.assign(`${routes.orderDetail}?id=${order.id}`); }
    catch (reason) { setError(errorText(reason)); setBusy(false); }
  };

  return <><PageHeader title="Tạo yêu cầu mua hộ" description="Yêu cầu được lưu theo tài khoản và chuyển vào hệ thống đơn hàng thật sau khi gửi." />
    <div className={feature.split}>
      <section className={feature.contentCard}><header className={feature.cardHeader}><h2>Thông tin sản phẩm</h2><p>Nhập link hoặc mô tả sản phẩm cần mua hộ.</p></header>
        <div className={feature.formGrid}>
          <label className={feature.field}><span>Nguồn hàng</span><select value={form.source} onChange={(event) => update("source", event)}><option>Taobao</option><option>1688</option><option>Tmall</option><option>Nguồn khác</option></select></label>
          <label className={feature.field}><span>Tên sản phẩm *</span><input value={form.product_name} onChange={(event) => update("product_name", event)} /></label>
          <label className={`${feature.field} ${feature.fullField}`}><span>Link sản phẩm</span><div className={feature.linkInput}><Search aria-hidden="true" /><input type="url" value={form.product_link} onChange={(event) => setForm((value) => ({ ...value, product_link: event.target.value, metadataStatus: "idle" }))} placeholder="https://item.taobao.com/..." /></div></label>
          <div className={`${feature.actions} ${feature.fullField}`}><button className={feature.secondary} type="button" disabled={form.metadataStatus === "loading"} onClick={() => loadMetadata(form.product_link)}><Search aria-hidden="true" />{form.metadataStatus === "loading" ? "Đang lấy thông tin..." : form.metadataStatus === "idle" ? "Lấy thông tin sản phẩm" : "Thử lấy lại"}</button>{["error", "unavailable"].includes(form.metadataStatus) && <button className={feature.secondary} type="button" disabled={busy || Boolean(lookupRequest)} onClick={requestStaffLookup}>{lookupRequest ? `Đã gửi yêu cầu #${lookupRequest.id}` : "Nhờ nhân viên lấy thông tin"}</button>}{form.metadataStatus === "error" && <span className={feature.muted}>Bạn vẫn có thể nhập thủ công bên dưới.</span>}</div>
          <div className={feature.fullField}><ProductPreviewPanel product={{ ...form, name: form.product_name, sourceUrl: form.product_link, imageUrl: form.product_image, priceCny: form.price_cny }} status={form.metadataStatus} message={metadataMessage} selectedImage={form.product_image} onSelectImage={(image) => setForm((value) => ({ ...value, product_image: image }))} onRetry={form.metadataStatus === "error" ? loadMetadata : null} /></div>
          <ProductVariantSelector groups={form.attribute_groups} skus={form.skus} selection={form.selectedAttributes} extractionComplete={form.sku_extraction_complete} onChange={selectVariant} />
          <label className={feature.field}><span>Phân loại</span><input value={form.variant} onChange={(event) => update("variant", event)} /></label>
          <label className={feature.field}><span>Màu sắc</span><input value={form.color} onChange={(event) => update("color", event)} /></label>
          <label className={feature.field}><span>Kích thước</span><input value={form.size} onChange={(event) => update("size", event)} /></label>
          <label className={feature.field}><span>Số lượng *</span><input type="number" min="1" value={form.quantity} onChange={updateQuantity} /></label>
          <label className={feature.field}><span>Giá tham khảo (CNY)</span><input type="number" min="0" step="0.01" value={form.price_cny} onChange={(event) => update("price_cny", event)} /></label>
          <label className={`${feature.field} ${feature.fullField}`}><span>Ghi chú sản phẩm</span><textarea value={form.note} onChange={(event) => update("note", event)} /></label>
        </div><div className={feature.actions}><button className={feature.primary} disabled={busy} onClick={addLocal}>Thêm vào yêu cầu</button><button className={feature.secondary} disabled={busy} onClick={addCart}>Thêm vào giỏ</button></div>
      </section>
      <aside className={feature.summaryPanel}><header className={feature.cardHeader}><h2>Tóm tắt yêu cầu</h2><p>{items.length} mặt hàng · tổng SL {items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</p></header>
        <label className={feature.field}><span>Tiêu đề</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className={feature.field}><span>Ghi chú chung</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
        {items.length ? <div className={feature.summaryItems}>{items.map((item) => <article className={feature.itemCard} key={item.id}><div className={feature.itemHead}><div><strong>{item.product_name}</strong><div className={feature.itemMeta}><span>{item.source}</span><span>SL {item.quantity}</span></div></div><button className={feature.danger} onClick={() => setItems((value) => value.filter((entry) => entry.id !== item.id))}>Xóa</button></div></article>)}</div> : <div className={feature.compactEmpty}><Package /><strong>Chưa có sản phẩm</strong></div>}
        {error && <p className={feature.error} role="alert">{error}</p>}{message && <p className={feature.notice}>{message}</p>}
        <div className={feature.actions}><button className={feature.secondary} disabled={busy || !items.length} onClick={save}>Lưu bản nháp</button><button className={feature.primary} disabled={busy || !items.length} onClick={submit}>Gửi yêu cầu</button></div>
      </aside>
    </div></>;
}

export function RealCartAndDraftsPage({ routes }) {
  const [workspace, setWorkspace] = useState(null); const [tab, setTab] = useState("cart"); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(true);
  const reload = async () => {
    setLoading(true); setError("");
    try { setWorkspace(await getPurchaseWorkspace()); }
    catch (reason) { setError(errorText(reason)); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    getPurchaseWorkspace().then((value) => { if (active) setWorkspace(value); }).catch((reason) => { if (active) setError(errorText(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  if (loading && !workspace) return <LoadingState />;
  if (!workspace) return <><PageHeader title="Giỏ hàng & bản nháp" description="Không thể tải dữ liệu giỏ hàng." /><section className={feature.contentCard}><p className={feature.error} role="alert">{error}</p><button className={feature.primary} type="button" onClick={reload}>Thử lại</button></section></>;
  const cart = workspace.cart?.items || [];
  const act = async (callback, success) => { setError(""); try { await callback(); setMessage(success); await reload(); } catch (reason) { setError(errorText(reason)); } };
  const goToOrder = async (callback) => { try { const { order } = await callback(); window.location.assign(`${routes.orderDetail}?id=${order.id}`); } catch (reason) { setError(errorText(reason)); } };

  return <><PageHeader title="Giỏ hàng & bản nháp" description="Dữ liệu được lưu bền vững theo tài khoản khách hàng." />
    <div className={feature.tabs}><button aria-selected={tab === "cart"} onClick={() => setTab("cart")}>Giỏ hàng ({cart.length})</button><button aria-selected={tab === "drafts"} onClick={() => setTab("drafts")}>Bản nháp ({workspace.drafts.length})</button></div>
    {error && <p className={feature.error}>{error}</p>}{message && <p className={feature.notice}>{message}</p>}
    {tab === "cart" ? <section className={feature.cartPanel}>{cart.length ? <><div className={feature.cartList}>{cart.map((item) => <article className={feature.cartItem} key={item.id}>
      <ProductThumbnail src={item.product_image} alt={item.product_name} size="medium" /><div className={feature.cartInfo}><strong>{item.product_name}</strong><p>{item.source || "Nguồn khác"} · {item.variant || "Chưa có phân loại"}</p></div>
      <div className={feature.quantityControl}><button onClick={() => act(() => updatePurchaseCartItem(item.id, { quantity: Math.max(1, item.quantity - 1) }), "Đã cập nhật giỏ.")}>−</button><input type="number" min="1" value={item.quantity} onChange={(event) => act(() => updatePurchaseCartItem(item.id, { quantity: Math.max(1, Number(event.target.value) || 1) }), "Đã cập nhật giỏ.")} /><button onClick={() => act(() => updatePurchaseCartItem(item.id, { quantity: item.quantity + 1 }), "Đã cập nhật giỏ.")}>+</button></div>
      <div className={feature.cartPrice}><span>Giá tham khảo</span><strong>{item.price_cny ? `${item.price_cny} CNY` : "Chưa có"}</strong></div><button className={feature.danger} onClick={() => act(() => deletePurchaseCartItem(item.id), "Đã xóa sản phẩm.")}>Xóa</button>
    </article>)}</div><footer className={feature.cartFooter}><div className={feature.actions}><a className={feature.secondary} href={routes.createOrder}>Tiếp tục mua</a><button className={feature.secondary} onClick={() => act(() => savePurchaseCartAsDraft({ title: `Bản nháp ${new Date().toLocaleDateString("vi-VN")}` }), "Đã lưu giỏ hàng thành bản nháp.")}>Lưu bản nháp</button><button className={feature.primary} onClick={() => goToOrder(submitPurchaseCart)}>Gửi yêu cầu</button></div></footer></> : <EmptyState title="Giỏ hàng đang trống" description="Thêm sản phẩm từ trang tạo yêu cầu mua hộ." />}</section>
      : <section className={feature.draftList}>{workspace.drafts.length ? workspace.drafts.map((draft) => <article className={feature.draftItem} key={draft.id}><div><h3>{draft.title || `Bản nháp #${draft.id}`}</h3><p>{draft.items.length} sản phẩm · cập nhật {formatDateTime(draft.updated_at)}</p></div><div className={feature.inlineActions}><a className={feature.secondary} href={`${routes.createOrder}?draft=${draft.id}`}>Chỉnh sửa</a><button className={feature.primary} onClick={() => goToOrder(() => submitPurchaseDraft(draft.id))}>Gửi yêu cầu</button><button className={feature.danger} onClick={() => act(() => deletePurchaseDraft(draft.id), "Đã xóa bản nháp.")}>Xóa</button></div></article>) : <EmptyState title="Chưa có bản nháp" />}</section>}
  </>;
}

export function RealOrdersPage({ historyMode = false, routes }) {
  const [result, setResult] = useState(null); const [search, setSearch] = useState(""); const [status, setStatus] = useState(""); const [createdFrom, setCreatedFrom] = useState(""); const [createdTo, setCreatedTo] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try { const value = await getCustomerOrders({ search, status, created_from: historyMode ? createdFrom : "", created_to: historyMode ? createdTo : "", per_page: 50 }); if (active) setResult(value); }
      catch (reason) { if (active) setError(errorText(reason)); }
      finally { if (active) setLoading(false); }
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [search, status, createdFrom, createdTo, historyMode, retryKey]);
  const orders = result?.orders || [];
  return <><PageHeader title={historyMode ? "Lịch sử đơn hàng" : "Đơn hàng mua hộ"} description="Chỉ hiển thị đơn thuộc tài khoản khách hàng đang đăng nhập." />
    <div className={styles.toolbar}><label className={styles.searchBox}><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã đơn hoặc sản phẩm..." /></label><select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả trạng thái</option><option value="pending">Chờ xử lý</option><option value="awaiting_deposit">Chờ đặt cọc</option><option value="purchasing">Đang mua hàng</option><option value="completed">Hoàn tất</option></select>{historyMode && <><label className={feature.field}><span>Từ ngày</span><input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} /></label><label className={feature.field}><span>Đến ngày</span><input type="date" min={createdFrom || undefined} value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} /></label></>}</div>
    {error && <section className={feature.contentCard}><p className={feature.error} role="alert">{error}</p><button className={feature.primary} type="button" onClick={() => setRetryKey((value) => value + 1)}>Thử lại</button></section>}{loading && !result ? <LoadingState /> : !error && <section className={styles.panel}>{orders.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Mã đơn</th><th>Sản phẩm</th><th>Tổng CNY</th><th>Tổng VND</th><th>Trạng thái</th><th>Cập nhật</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.order_code}</strong></td><td>{order.item_count} mặt hàng / SL {order.quantity}</td><td>{order.product_total_cny} CNY</td><td>{formatVnd(order.product_total_vnd)}</td><td><StatusBadge status={order.status} /></td><td>{formatDateTime(order.updated_at)}</td><td><a href={`${routes.orderDetail}?id=${order.id}`}>Chi tiết</a></td></tr>)}</tbody></table></div> : <EmptyState title={historyMode ? "Bạn chưa có lịch sử đơn hàng" : "Bạn chưa có đơn hàng mua hộ"} />}</section>}
  </>;
}

export function RealOrderDetailPage({ routes }) {
  const id = new URLSearchParams(window.location.search).get("id") || window.location.pathname.split("/").filter(Boolean).pop(); const [order, setOrder] = useState(null); const [error, setError] = useState(""); const [retryKey, setRetryKey] = useState(0);
  useEffect(() => { let active = true; getCustomerOrder(id).then(({ order: value }) => { if (active) setOrder(value); }).catch((reason) => { if (active) setError(errorText(reason)); }); return () => { active = false; }; }, [id, retryKey]);
  if (error) return <><PageHeader title="Không thể mở đơn hàng" /><section className={feature.contentCard}><p className={feature.error} role="alert">{error}</p><button className={feature.primary} type="button" onClick={() => { setError(""); setRetryKey((value) => value + 1); }}>Thử lại</button></section></>;
  if (!order) return <LoadingState />;
  return <><PageHeader title={`Đơn hàng ${order.order_code}`} description={`Tạo lúc ${formatDateTime(order.created_at)}`} action={<StatusBadge status={order.status} />} />
    <section className={styles.panel}><header className={styles.panelHeader}><h2>Sản phẩm ({order.items.length})</h2></header><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Sản phẩm</th><th>Phân loại</th><th>SL</th><th>Giá CNY</th><th>Thành tiền</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td><strong>{item.product_name}</strong>{item.product_link && <small> · <a href={item.product_link} target="_blank" rel="noreferrer">Mở link</a></small>}</td><td>{[item.color, item.size].filter(Boolean).join(" / ") || "—"}</td><td>{item.quantity}</td><td>{item.price_cny} CNY</td><td>{item.subtotal_cny} CNY</td></tr>)}</tbody></table></div></section>
    <div className={styles.summaryGrid}><section className={styles.panel}><header className={styles.panelHeader}><h2>Lịch sử thực tế</h2></header>{order.history.length ? <div className={feature.draftList}>{order.history.map((event, index) => <article className={feature.draftItem} key={`${event.type}-${index}`}><div><strong>{event.type.replaceAll("_", " ")}</strong><p>{formatDateTime(event.occurred_at)}</p></div><StatusBadge status={event.status} /></article>)}</div> : <EmptyState title="Chưa có sự kiện" />}</section><aside className={styles.summaryCard}><h2>Tổng quan</h2><div className={styles.summaryRows}><div><span>Tổng sản phẩm</span><strong>{order.product_total_cny} CNY</strong></div><div><span>Quy đổi</span><strong>{formatVnd(order.product_total_vnd)}</strong></div><div><span>Kiện / hóa đơn</span><strong>{order.package_count} / {order.invoice_count}</strong></div></div><a className={styles.secondaryAction} href={routes.orders}>Quay lại danh sách</a></aside></div>
  </>;
}
