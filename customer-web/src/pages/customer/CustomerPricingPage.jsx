import { useMemo, useState } from "react";
import { Boxes, Calculator, CircleDollarSign, Layers3, Truck } from "lucide-react";
import { PageHeader, IntegrationNotice } from "../../components/customer/PortalComponents.jsx";
import { pricingConfig } from "../../data/pricingConfig.js";
import { calculateEstimate, formatVnd } from "../../utils/pricingCalculator.js";
import { getPortalRoutes } from "../../config/customerPortal.js";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

const categories = [
  { label: "Tỷ giá CNY/VND", detail: "Nguồn tỷ giá dành cho khách hàng", icon: CircleDollarSign },
  { label: "Phí mua hộ", detail: "Quy tắc theo giá trị đơn hàng", icon: Layers3 },
  { label: "Vận chuyển theo kg / m³", detail: "Biểu phí theo tuyến và khối lượng", icon: Truck },
  { label: "Dịch vụ gia tăng", detail: "Kiểm hàng, đóng gói và bảo hiểm", icon: Boxes },
];

export default function CustomerPricingPage() {
  const routes = getPortalRoutes();
  const [form, setForm] = useState({ productPriceCny: "", quantity: "1", shippingMode: "kg", shippingAmount: "", destinationId: "" });
  const [submitted, setSubmitted] = useState(false);
  const result = useMemo(() => submitted ? calculateEstimate({ ...form, customerType: "retail" }, pricingConfig) : null, [form, submitted]);
  const breakdown = result?.breakdown;
  const update = (key) => (event) => { setForm((current) => ({ ...current, [key]: event.target.value })); setSubmitted(false); };

  return <>
    <PageHeader title="Bảng giá & ước tính chi phí" description="Tra cứu cấu trúc biểu phí và kiểm tra dữ liệu cần thiết trước khi ước tính." />
    <IntegrationNotice title="Bảng giá đang được cập nhật">Thông tin tỷ giá và biểu phí cần được xác minh trước khi sử dụng để tính chi phí. Portal không thay giá trị thiếu bằng 0.</IntegrationNotice>
    <div className={feature.pricingLayout}>
      <section className={feature.contentCard}>
        <header className={feature.cardHeader}><h2>Nhóm thông tin giá</h2><p>Một nguồn cấu hình dùng chung với trang Bảng giá công khai.</p></header>
        <div className={feature.priceCategories}>{categories.map(({ label, detail, icon: Icon }) => <div className={feature.priceCategory} key={label}><Icon aria-hidden="true" /><div><strong>{label}</strong><small>{detail}</small></div><span>Chờ dữ liệu xác minh</span></div>)}</div>
        <div className={feature.pricingCta}><a className={feature.secondary} href="/bang-gia">Xem bảng giá công khai</a><a className={feature.primary} href={routes.support}>Liên hệ tư vấn</a></div>
      </section>
      <aside className={feature.contentCard}><header className={feature.cardHeader}><h2>Trạng thái cấu hình</h2><p>Portal chỉ tính khi đủ tỷ giá, quy tắc phí, tuyến vận chuyển và kho nhận.</p></header><span className={feature.badge}>Chưa đủ dữ liệu để tính phí</span></aside>
    </div>
    <section className={feature.calculator} aria-label="Công cụ ước tính chi phí">
      <form className={feature.calculatorInput} onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
        <header className={feature.cardHeader}><h2>Nhập thông tin đơn hàng</h2><p>Kết quả chỉ xuất hiện khi cấu hình giá hợp lệ.</p></header>
        <div className={feature.formGrid}>
          <label className={feature.field}><span>Giá sản phẩm (CNY)</span><input inputMode="decimal" value={form.productPriceCny} onChange={update("productPriceCny")} placeholder="Nhập giá sản phẩm" /></label>
          <label className={feature.field}><span>Số lượng</span><input inputMode="numeric" value={form.quantity} onChange={update("quantity")} /></label>
          <label className={feature.field}><span>Phương thức tính cước</span><select value={form.shippingMode} onChange={update("shippingMode")}><option value="kg">Theo cân nặng (kg)</option><option value="m3">Theo thể tích (m³)</option></select></label>
          <label className={feature.field}><span>{form.shippingMode === "m3" ? "Thể tích (m³)" : "Trọng lượng (kg)"}</span><input inputMode="decimal" value={form.shippingAmount} onChange={update("shippingAmount")} placeholder="Nhập giá trị" /></label>
          <label className={feature.field}><span>Kho nhận</span><select value={form.destinationId} onChange={update("destinationId")}><option value="">Chưa có kho nhận được cấu hình</option>{pricingConfig.destinations.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        </div>
        <div className={feature.actions}><button type="submit" className={feature.primary}><Calculator aria-hidden="true" />Kiểm tra khả năng ước tính</button></div>
      </form>
      <aside className={feature.calculatorResult} aria-live="polite">
        <header className={feature.cardHeader}><h2>Kết quả ước tính</h2><p>{breakdown ? "Chi phí dự kiến theo cấu hình hiện hành." : "Chưa đủ dữ liệu để tính phí."}</p></header>
        <div className={feature.breakdown}><div><span>Tiền hàng</span><strong>{formatVnd(breakdown?.goodsValueVnd)}</strong></div><div><span>Phí dịch vụ</span><strong>{formatVnd(breakdown?.purchaseFee)}</strong></div><div><span>Phí vận chuyển</span><strong>{formatVnd(breakdown?.shippingFee)}</strong></div><div><span>Phí tùy chọn</span><strong>{formatVnd(breakdown?.additionalFee)}</strong></div><div><span>Tổng ước tính</span><strong>{formatVnd(breakdown?.total)}</strong></div></div>
        {result?.errors?.length > 0 && <p className={feature.error} role="alert">{result.errors.join(" ")}</p>}
        {result?.missing?.length > 0 && <p className={feature.notice}>Còn thiếu: {result.missing.join(", ")}.</p>}
      </aside>
    </section>
  </>;
}
