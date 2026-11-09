import { useMemo, useState } from "react";
import { Calculator, CircleAlert } from "lucide-react";
import { pricingConfig } from "../../data/pricingConfig.js";
import { calculateEstimate, formatVnd } from "../../utils/pricingCalculator.js";
import Button from "../ui/Button.jsx";
import styles from "./PricingPage.module.css";

const initialForm = {
  productPriceCny: "",
  quantity: "1",
  shippingAmount: "",
  destinationId: "",
};

export default function PriceCalculator({ customerType, shippingMode, onShippingModeChange }) {
  const [form, setForm] = useState(initialForm);
  const [submitted, setSubmitted] = useState(false);

  const input = useMemo(() => ({ ...form, customerType, shippingMode }), [form, customerType, shippingMode]);
  const result = useMemo(() => submitted ? calculateEstimate(input, pricingConfig) : null, [input, submitted]);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSubmitted(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(true);
  };

  const breakdown = result?.breakdown;

  return <aside className={styles.calculator}><div className={styles.calculatorTitle}><span><Calculator /></span><div><h2>Ước tính chi phí nhập hàng</h2><p>Kết quả chỉ xuất hiện khi đủ dữ liệu đã xác minh.</p></div></div><form onSubmit={handleSubmit} noValidate><label>Giá sản phẩm (CNY)<input inputMode="decimal" value={form.productPriceCny} onChange={(event) => update("productPriceCny", event.target.value)} placeholder="Nhập giá bằng CNY" /></label><label>Số lượng<input inputMode="numeric" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} placeholder="Nhập số lượng" /></label><fieldset><legend>Hình thức vận chuyển</legend><div className={styles.inlineOptions}><button type="button" className={shippingMode === "kg" ? styles.selectedOption : ""} onClick={() => { onShippingModeChange("kg"); setSubmitted(false); }}>Theo kg</button><button type="button" className={shippingMode === "m3" ? styles.selectedOption : ""} onClick={() => { onShippingModeChange("m3"); setSubmitted(false); }}>Theo m³</button></div></fieldset><label>{shippingMode === "m3" ? "Thể tích (m³)" : "Trọng lượng (kg)"}<input inputMode="decimal" value={form.shippingAmount} onChange={(event) => update("shippingAmount", event.target.value)} placeholder={shippingMode === "m3" ? "Nhập thể tích" : "Nhập trọng lượng"} /></label><label>Điểm nhận hàng<select value={form.destinationId} onChange={(event) => update("destinationId", event.target.value)}><option value="">Chưa có điểm nhận được cấu hình</option>{pricingConfig.destinations.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><Button type="submit"><Calculator /> Kiểm tra khả năng ước tính</Button></form><div className={styles.result} aria-live="polite"><h3>{breakdown ? "Chi phí dự kiến" : "Chưa đủ dữ liệu để ước tính"}</h3><dl><div><dt>Tiền hàng</dt><dd>{formatVnd(breakdown?.goodsValueVnd)}</dd></div><div><dt>Phí dịch vụ</dt><dd>{formatVnd(breakdown?.purchaseFee)}</dd></div><div><dt>Phí vận chuyển</dt><dd>{formatVnd(breakdown?.shippingFee)}</dd></div><div><dt>Phí khác</dt><dd>{formatVnd(breakdown?.additionalFee)}</dd></div><div className={styles.total}><dt>Tổng dự kiến</dt><dd>{formatVnd(breakdown?.total)}</dd></div></dl>{result?.errors?.length > 0 && <ul className={styles.errors}>{result.errors.map((error) => <li key={error}>{error}</li>)}</ul>}{result?.missing?.length > 0 && <div className={styles.missing}><CircleAlert /><p>Còn thiếu: {result.missing.join(", ")}.</p></div>}{!result && <p className={styles.resultHint}>Nhập thông tin để kiểm tra dữ liệu cần thiết. Hệ thống không thay dữ liệu thiếu bằng 0.</p>}</div><a className={styles.calculatorContact} href="#pricing-contact">Liên hệ nhận báo giá</a></aside>;
}
