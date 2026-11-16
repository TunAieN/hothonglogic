import { useEffect, useState } from "react";
import { Package, Search } from "lucide-react";
import {
  addPurchaseCartItem, createPurchaseDraft, deletePurchaseCartItem, deletePurchaseDraft,
  getCustomerOrder, getCustomerOrders, getPurchaseWorkspace, submitPurchaseCart,
  submitPurchaseDraft, updatePurchaseCartItem, updatePurchaseDraft, savePurchaseCartAsDraft,
} from "../../api/customerPortal.js";
import { EmptyState, LoadingState, PageHeader, StatusBadge } from "../../components/customer/PortalComponents.jsx";
import ProductThumbnail from "../../components/customer/ProductThumbnail.jsx";
import ProductPreviewPanel from "../../components/customer/ProductPreviewPanel.jsx";
import { formatDateTime, formatVnd } from "../../utils/customerFormatters.js";
import { detectProductSource, getProductMetadata, validateProductUrl } from "../../services/productMetadata.js";
import styles from "../../components/customer/CustomerPortal.module.css";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

const blank = { source: "Taobao", product_link: "", product_name: "", variant: "", color: "", size: "", quantity: 1, price_cny: "", note: "", product_image: "", images: [], skus: [], metadataStatus: "idle", metadataSource: "manual" };
const errorText = (error) => error?.message || "Không thể thực hiện yêu cầu.";
const itemPayload = (item) => ({
  ...item, quantity: Number(item.quantity),
  price_cny: item.price_cny === "" || item.price_cny == null ? null : Number(item.price_cny),
  product_link: item.product_link || null, product_image: item.product_image || null,
});

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

  useEffect(() => {
    if (!draftId) return;
    getPurchaseWorkspace().then(({ drafts }) => {
      const draft = drafts.find((entry) => String(entry.id) === String(draftId));
      if (draft) { setTitle(draft.title || ""); setNote(draft.note || ""); setItems(draft.items); }
    }).catch((reason) => setError(errorText(reason)));
  }, [draftId]);

  const update = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const loadMetadata = async () => {
    const validation = validateProductUrl(form.product_link);
    if (!validation.valid) { setMetadataMessage(validation.message); setForm((value) => ({ ...value, metadataStatus: "error" })); return; }
    setMetadataMessage(""); setForm((value) => ({ ...value, metadataStatus: "loading", source: validation.source }));
    const result = await getProductMetadata(validation.sourceUrl);
    setMetadataMessage(result.message || "");
    setForm((value) => ({
      ...value,
      metadataStatus: result.status || "error", metadataSource: "remote",
      product_link: result.normalized_url || validation.sourceUrl,
      source: result.source || detectProductSource(validation.sourceUrl),
      product_name: result.title || value.product_name,
      product_image: result.image || value.product_image,
      images: result.images || [], skus: result.skus || [],
      price_cny: result.price_cny ?? value.price_cny,
    }));
  };
  const selectSku = (event) => {
    const sku = form.skus[Number(event.target.value)];
    if (!sku) return;
    setForm((value) => ({ ...value, variant: sku.label || value.variant, color: sku.color || value.color, size: sku.size || value.size, price_cny: sku.price_cny ?? value.price_cny, product_image: sku.image || value.product_image }));
  };
  const validate = () => form.product_name.trim() && Number(form.quantity) > 0;
  const addLocal = () => {
    if (!validate()) { setError("Vui lòng nhập tên sản phẩm và số lượng hợp lệ."); return; }
    setItems((value) => [...value, { ...itemPayload(form), id: `local-${crypto.randomUUID()}` }]);
    setForm(blank); setError("");
  };
  const addCart = async () => {
    if (!validate()) { setError("Vui lòng nhập tên sản phẩm và số lượng hợp lệ."); return; }
    setBusy(true); setError("");
    try { await addPurchaseCartItem(itemPayload(form)); setForm(blank); setMessage("Đã lưu sản phẩm vào giỏ hàng."); }
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
          <label className={feature.field}><span>Nguồn hàng</span><select value={form.source} onChange={update("source")}><option>Taobao</option><option>1688</option><option>Tmall</option><option>Nguồn khác</option></select></label>
          <label className={feature.field}><span>Tên sản phẩm *</span><input value={form.product_name} onChange={update("product_name")} /></label>
          <label className={`${feature.field} ${feature.fullField}`}><span>Link sản phẩm</span><div className={feature.linkInput}><Search aria-hidden="true" /><input type="url" value={form.product_link} onChange={(event) => setForm((value) => ({ ...value, product_link: event.target.value, metadataStatus: "idle" }))} placeholder="https://item.taobao.com/..." /></div></label>
          <div className={`${feature.actions} ${feature.fullField}`}><button className={feature.secondary} type="button" disabled={form.metadataStatus === "loading"} onClick={loadMetadata}><Search aria-hidden="true" />{form.metadataStatus === "loading" ? "Đang lấy thông tin..." : "Lấy thông tin sản phẩm"}</button></div>
          <div className={feature.fullField}><ProductPreviewPanel product={{ ...form, name: form.product_name, sourceUrl: form.product_link, imageUrl: form.product_image, priceCny: form.price_cny }} status={form.metadataStatus} message={metadataMessage} selectedImage={form.product_image} onSelectImage={(image) => setForm((value) => ({ ...value, product_image: image }))} onRetry={form.metadataStatus === "error" ? loadMetadata : null} /></div>
          {form.skus.length > 0 && <label className={`${feature.field} ${feature.fullField}`}><span>Phân loại từ nguồn hàng</span><select defaultValue="" onChange={selectSku}><option value="" disabled>Chọn phân loại</option>{form.skus.map((sku, index) => <option value={index} key={`${sku.label}-${index}`}>{sku.label}{sku.price_cny != null ? ` — ${sku.price_cny} CNY` : ""}</option>)}</select></label>}
          <label className={feature.field}><span>Phân loại</span><input value={form.variant} onChange={update("variant")} /></label>
          <label className={feature.field}><span>Màu sắc</span><input value={form.color} onChange={update("color")} /></label>
          <label className={feature.field}><span>Kích thước</span><input value={form.size} onChange={update("size")} /></label>
          <label className={feature.field}><span>Số lượng *</span><input type="number" min="1" value={form.quantity} onChange={update("quantity")} /></label>
          <label className={feature.field}><span>Giá tham khảo (CNY)</span><input type="number" min="0" step="0.01" value={form.price_cny} onChange={update("price_cny")} /></label>
          <label className={`${feature.field} ${feature.fullField}`}><span>Ghi chú sản phẩm</span><textarea value={form.note} onChange={update("note")} /></label>
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
