import { useState } from "react";
import { PackageSearch, RotateCcw, Search } from "lucide-react";
import { PageHeader, StatusBadge } from "../../components/customer/PortalComponents.jsx";
import { useDemoPortal } from "../../components/customer/DemoPortalContext.jsx";
import { formatDateTime } from "../../utils/customerFormatters.js";
import { getPortalRoutes } from "../../config/customerPortal.js";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

const stages = ["Đã tiếp nhận", "Đang xử lý", "Đang vận chuyển", "Hoàn tất"];
export default function TrackingPage() {
  const { data } = useDemoPortal();
  const routes = getPortalRoutes();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(undefined);
  const [error, setError] = useState("");
  const search = () => {
    const key = query.trim().toLowerCase();
    if (!key) { setError("Vui lòng nhập chính xác mã đơn hoặc mã vận đơn Demo."); setResult(undefined); return; }
    const found = data.orders.find((item) => [item.code, item.id].some((value) => value.toLowerCase() === key))
      || data.consignments.find((item) => item.tracking.toLowerCase() === key);
    setResult(found || null);
    setError(found ? "" : "Không tìm thấy mã trong dữ liệu Demo.");
  };
  const reset = () => { setQuery(""); setResult(undefined); setError(""); };
  const current = result?.status === "completed" || result?.status === "delivered" ? 3 : result?.status === "shipped" ? 2 : result?.status === "pending" ? 0 : 1;
  const isOrder = Boolean(result?.code);

  return <>
    <PageHeader title="Tra cứu hành trình" description="Kiểm tra trạng thái đơn hàng hoặc kiện ký gửi trong Development Demo Mode." />
    <section className={feature.searchPanel}>
      <div className={feature.searchRow}><label className={feature.field}><span>Mã đơn / mã vận đơn</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") search(); }} placeholder="Ví dụ: DEMO260002" /></label><button type="button" className={feature.primary} onClick={search}><Search aria-hidden="true" />Tra cứu</button></div>
      <div className={feature.searchHint}><span>Mã Demo hợp lệ:</span><code>DEMO260002</code><code>DEMO-KG-001</code><span>Không tạo kết quả giả cho mã khác.</span></div>
    </section>
    {result === undefined && !error && <section className={feature.statePanel}><PackageSearch aria-hidden="true" /><h2>Nhập mã để xem hành trình</h2><p>Thông tin trạng thái, thời gian cập nhật và timeline vận chuyển sẽ hiển thị tại đây.</p></section>}
    {error && <section className={feature.statePanel} role="alert"><PackageSearch aria-hidden="true" /><h2>Không tìm thấy mã</h2><p>{error} Hãy kiểm tra lại hoặc dùng một trong các mã gợi ý phía trên.</p><button type="button" className={feature.secondary} onClick={reset}><RotateCcw aria-hidden="true" />Tra cứu lại</button></section>}
    {result && <section className={feature.statePanel}>
      <header className={feature.resultHeader}><div><span className={feature.badge}>Dữ liệu minh họa</span><h2>{result.code || result.tracking}</h2><p>{result.product || result.name}</p></div><StatusBadge status={result.status} /></header>
      <div className={feature.trackingGrid}><div className={feature.trackingInfo}><div><span>Cập nhật</span><strong>{formatDateTime(result.updatedAt || result.declaredAt)}</strong></div><div><span>Nguồn hàng</span><strong>{result.source || "Ký gửi"}</strong></div><div><span>Số lượng</span><strong>{result.quantity || 1}</strong></div>{result.weight !== undefined && <div><span>Cân nặng</span><strong>{result.weight} kg</strong></div>}{isOrder && <a className={feature.secondary} href={`${routes.orderDetail}?id=${encodeURIComponent(result.id)}`}>Xem chi tiết đơn hàng</a>}</div><div className={feature.timeline} aria-label="Timeline hành trình">{stages.map((stage, index) => <div className={`${feature.timelineStep} ${index <= current ? feature.active : ""}`} key={stage}>{stage}</div>)}</div></div>
    </section>}
  </>;
}
