import { useMemo, useState } from "react";
import { Globe2, Link2, Package, PackagePlus, Search, Sparkles, Store } from "lucide-react";
import { PageHeader } from "../../components/customer/PortalComponents.jsx";
import { useDemoPortal } from "../../components/customer/DemoPortalContext.jsx";
import ProductPreviewPanel from "../../components/customer/ProductPreviewPanel.jsx";
import ProductThumbnail from "../../components/customer/ProductThumbnail.jsx";
import { productPreviewDemoItems } from "../../data/productPreviewDemo.js";
import { detectProductSource, getProductMetadata, validateProductUrl } from "../../services/productMetadata.js";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

const sources = [
  { name: "Taobao", icon: Store },
  { name: "1688", icon: PackagePlus },
  { name: "Tmall", icon: Store },
  { name: "Nguồn khác", icon: Globe2 },
];
const blankItem = { source: "Taobao", sourceUrl: "", link: "", name: "", variant: "", color: "", size: "", quantity: 1, priceCny: "", note: "", imageUrl: null, images: [], metadataSource: "manual", metadataStatus: "idle" };
const normalizeItem = (item) => ({ ...blankItem, ...item, sourceUrl: item.sourceUrl || item.link || "", link: item.link || item.sourceUrl || "", images: item.images || (item.imageUrl ? [item.imageUrl] : []) });

export default function CreateOrderPage({ routes }) {
  const { data, addCartItem, saveDraft, submitOrder } = useDemoPortal();
  const draftId = new URLSearchParams(window.location.search).get("draft");
  const draft = useMemo(() => data.drafts.find((item) => item.id === draftId), [data.drafts, draftId]);
  const [form, setForm] = useState(blankItem);
  const [items, setItems] = useState(() => (draft?.items || []).map(normalizeItem));
  const [addressId, setAddressId] = useState(() => draft?.addressId || data.addresses.find((item) => item.isDefault)?.id || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [metadataMessage, setMetadataMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [demoIndex, setDemoIndex] = useState(0);
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity), 0);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const validate = () => {
    if (!form.name.trim()) return "Vui lòng nhập tên sản phẩm.";
    if (form.sourceUrl && !validateProductUrl(form.sourceUrl).valid) return "Link sản phẩm phải là URL http:// hoặc https:// hợp lệ.";
    if (Number(form.quantity) < 1) return "Số lượng phải lớn hơn 0.";
    return "";
  };
  const addItem = (target) => {
    const issue = validate();
    if (issue) { setError(issue); return; }
    const item = { ...form, id: `local-${Date.now()}`, link: form.sourceUrl, quantity: Number(form.quantity), priceCny: form.priceCny === "" ? null : Number(form.priceCny), imageUrl: selectedImage || form.imageUrl, metadataStatus: form.metadataStatus || "manual" };
    if (target === "cart") { addCartItem(item); setMessage("Đã thêm vào giỏ hàng Demo."); }
    else { setItems((current) => [...current, item]); setMessage("Đã thêm sản phẩm vào yêu cầu."); }
    setError("");
    setForm((current) => ({ ...blankItem, source: current.source }));
    setSelectedImage(null);
    setMetadataMessage("");
  };
  const applyProduct = (product) => {
    const normalized = normalizeItem(product);
    setForm(normalized);
    setSelectedImage(normalized.imageUrl || normalized.images[0] || null);
    setMetadataMessage("");
    setError("");
  };
  const loadMetadata = async () => {
    const validation = validateProductUrl(form.sourceUrl);
    if (!validation.valid) { setForm((current) => ({ ...current, metadataStatus: "error" })); setMetadataMessage(validation.message); return; }
    const result = await getProductMetadata(validation.sourceUrl);
    setForm((current) => ({ ...current, source: detectProductSource(validation.sourceUrl), sourceUrl: validation.sourceUrl, link: validation.sourceUrl, metadataStatus: result.status }));
    setMetadataMessage(result.message || "");
  };
  const loadDemoProduct = async () => {
    setForm((current) => ({ ...current, metadataStatus: "loading" }));
    setMetadataMessage("");
    await new Promise((resolve) => setTimeout(resolve, 420));
    const product = productPreviewDemoItems[demoIndex % productPreviewDemoItems.length];
    applyProduct(product);
    setDemoIndex((current) => current + 1);
    setMessage(product.metadataStatus === "partial" ? "Đã mở sản phẩm mẫu thiếu dữ liệu. Bạn có thể bổ sung thủ công." : "Đã mở sản phẩm mẫu trong Demo Mode.");
  };
  const create = () => {
    if (!items.length) { setError("Hãy thêm ít nhất một sản phẩm trước khi gửi yêu cầu."); return; }
    const order = submitOrder({ items, addressId, draftId });
    setItems([]);
    setMessage(`Đã tạo yêu cầu ${order.code} trong Demo Mode.`);
  };

  return <>
    <PageHeader title="Tạo yêu cầu mua hộ" description="Gom sản phẩm từ nhiều nguồn vào một yêu cầu. Dữ liệu chỉ lưu trong Development Demo Mode." />
    <section className={feature.sourceGrid} aria-label="Chọn nguồn hàng">
      {sources.map(({ name, icon: Icon }) => <button type="button" aria-pressed={form.source === name} className={`${feature.sourceCard} ${form.source === name ? feature.active : ""}`} key={name} onClick={() => setForm((current) => ({ ...current, source: name }))}><Icon aria-hidden="true" /><span>{name}</span></button>)}
    </section>
    <div className={feature.split}>
      <section className={feature.contentCard}>
        <header className={feature.cardHeader}><h2>Thông tin sản phẩm</h2><p>Nhập link hoặc mô tả sản phẩm cần mua hộ.</p></header>
        <div className={feature.linkPanel}>
          <label className={feature.field}><span>Link sản phẩm</span><div className={feature.linkInput}><Search aria-hidden="true" /><input value={form.sourceUrl} onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value, link: event.target.value, metadataStatus: "idle", metadataSource: "manual" }))} placeholder="https://item.taobao.com/..." /></div></label>
          <button className={feature.primary} type="button" onClick={loadMetadata}><Search aria-hidden="true" />Lấy thông tin</button>
          <button className={feature.secondary} type="button" onClick={loadDemoProduct}><Sparkles aria-hidden="true" />Xem sản phẩm mẫu</button>
        </div>
        <ProductPreviewPanel product={form} status={form.metadataStatus} message={metadataMessage} selectedImage={selectedImage} onSelectImage={setSelectedImage} onRetry={form.metadataStatus === "error" ? loadMetadata : null} />
        <div className={feature.manualHeading}><div><h3>Thông tin có thể chỉnh sửa</h3><p>Bổ sung thủ công khi nguồn hàng chưa hỗ trợ lấy dữ liệu tự động.</p></div><span>Nhập thủ công</span></div>
        <div className={feature.formGrid}>
          <label className={feature.field}><span>Nguồn hàng</span><select value={form.source} onChange={update("source")}>{sources.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
          <label className={feature.field}><span>Tên sản phẩm *</span><input value={form.name} onChange={update("name")} placeholder="Nhập tên sản phẩm" /></label>
          <label className={feature.field}><span>Phân loại</span><input value={form.variant} onChange={update("variant")} placeholder="Phiên bản / kiểu sản phẩm" /></label>
          <label className={feature.field}><span>Màu sắc</span><input value={form.color} onChange={update("color")} placeholder="Ví dụ: Cam" /></label>
          <label className={feature.field}><span>Kích thước</span><input value={form.size} onChange={update("size")} placeholder="Ví dụ: L / 28 × 20 cm" /></label>
          <label className={feature.field}><span>Số lượng *</span><input type="number" min="1" value={form.quantity} onChange={update("quantity")} /></label>
          <label className={feature.field}><span>Giá tham khảo (CNY)</span><input type="number" min="0" value={form.priceCny} onChange={update("priceCny")} placeholder="Không bắt buộc" /></label>
          <label className={`${feature.field} ${feature.fullField}`}><span>Ghi chú</span><textarea value={form.note} onChange={update("note")} placeholder="Yêu cầu về mẫu, đóng gói hoặc thông tin cần xác nhận..." /></label>
        </div>
        {error && <p className={feature.error} role="alert">{error}</p>}
        <div className={feature.actions}><button className={feature.primary} type="button" onClick={() => addItem("request")}><Link2 aria-hidden="true" />Thêm vào yêu cầu</button><button className={feature.secondary} type="button" onClick={() => addItem("cart")}>Thêm vào giỏ</button></div>
      </section>
      <aside className={feature.summaryPanel}>
        <header className={feature.cardHeader}><h2>Tóm tắt yêu cầu</h2><p>Kiểm tra sản phẩm và địa chỉ trước khi gửi.</p></header>
        <div className={feature.summaryStats}><div className={feature.summaryStat}><small>Sản phẩm</small><strong>{items.length}</strong></div><div className={feature.summaryStat}><small>Tổng số lượng</small><strong>{itemCount}</strong></div></div>
        {items.length ? <div className={feature.summaryItems}>{items.map((item) => <article className={feature.itemCard} key={item.id}><ProductThumbnail src={item.imageUrl} alt={item.name} size="small" /><div className={feature.itemHead}><div><strong>{item.name}</strong><div className={feature.itemMeta}><span>{item.source}</span><span>SL {item.quantity}</span></div></div><button className={feature.danger} type="button" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}>Xóa</button></div></article>)}</div> : <div className={feature.compactEmpty}><Package aria-hidden="true" /><strong>Chưa có sản phẩm trong yêu cầu</strong><p>Nhập thông tin sản phẩm và nhấn “Thêm vào yêu cầu”.</p></div>}
        <label className={feature.field}><span>Địa chỉ nhận hàng</span><select value={addressId} onChange={(event) => setAddressId(event.target.value)}>{data.addresses.map((item) => <option value={item.id} key={item.id}>{item.receiver} — {item.label}</option>)}</select></label>
        {message && <p className={feature.notice} role="status">{message} {message.includes("Đã tạo") && <a href={routes.orders}>Xem đơn hàng</a>}</p>}
        <div className={feature.actions}><button className={feature.secondary} type="button" disabled={!items.length} onClick={() => { saveDraft({ id: draftId, items, addressId }); setMessage("Đã lưu bản nháp Demo."); }}>Lưu bản nháp</button><button className={feature.primary} type="button" onClick={create}>Gửi yêu cầu Demo</button></div>
      </aside>
    </div>
  </>;
}
