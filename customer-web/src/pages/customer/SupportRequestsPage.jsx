import { useMemo, useState } from "react";
import { Headphones, Plus } from "lucide-react";
import { PageHeader } from "../../components/customer/PortalComponents.jsx";
import { useDemoPortal } from "../../components/customer/DemoPortalContext.jsx";
import { formatDateTime } from "../../utils/customerFormatters.js";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

export default function SupportRequestsPage() {
  const { data, addSupportRequest } = useDemoPortal();
  const [form, setForm] = useState({ type: "order", orderCode: "", title: "", content: "" });
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const requests = useMemo(() => data.supportRequests.filter((item) => filter === "all" || item.status === filter), [data.supportRequests, filter]);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    if (form.title.trim().length < 5 || form.content.trim().length < 10) { setError("Tiêu đề tối thiểu 5 ký tự và nội dung tối thiểu 10 ký tự."); return; }
    addSupportRequest(form);
    setForm({ type: "order", orderCode: "", title: "", content: "" });
    setError("");
    setMessage("Đã lưu yêu cầu trong Demo Mode. Chưa gửi đến hệ thống thật.");
  };

  return <>
    <PageHeader title="Yêu cầu hỗ trợ" description="Theo dõi và tạo yêu cầu hỗ trợ liên quan tới tài khoản Demo." />
    <div className={feature.supportSplit}>
      <section className={feature.supportList}>
        <header className={feature.supportListHeader}><div><h2>Yêu cầu gần đây</h2></div><select aria-label="Lọc trạng thái yêu cầu" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="open">Đang mở</option></select></header>
        {requests.length ? requests.map((item) => <article className={feature.supportItem} key={item.id}><div><div className={feature.itemHead}><h3>{item.title}</h3><span className={feature.badge}>Demo · {item.status === "open" ? "Đang mở" : item.status}</span></div><div className={feature.supportMeta}><span>{item.code}</span><span>{formatDateTime(item.createdAt)}</span>{item.orderCode && <span>Đơn {item.orderCode}</span>}</div>{expanded === item.id && <p>{item.content}</p>}</div><button type="button" className={feature.secondary} onClick={() => setExpanded((current) => current === item.id ? null : item.id)}>{expanded === item.id ? "Thu gọn" : "Xem chi tiết"}</button></article>) : <div className={feature.compactEmpty}><Headphones aria-hidden="true" /><strong>Chưa có yêu cầu hỗ trợ</strong><p>Tạo yêu cầu mới bằng biểu mẫu bên cạnh.</p></div>}
      </section>
      <form className={feature.supportForm} onSubmit={submit} noValidate>
        <header className={feature.cardHeader}><h2>Tạo yêu cầu Demo</h2><p>Yêu cầu chỉ được lưu cục bộ trong chế độ xem trước.</p></header>
        <div className={feature.stack}>
          <label className={feature.field}><span>Nhóm hỗ trợ</span><select value={form.type} onChange={update("type")}><option value="order">Đơn hàng</option><option value="finance">Tài chính</option><option value="account">Tài khoản</option></select></label>
          <label className={feature.field}><span>Mã đơn liên quan</span><input value={form.orderCode} onChange={update("orderCode")} placeholder="Không bắt buộc" /></label>
          <label className={feature.field}><span>Tiêu đề *</span><input value={form.title} onChange={update("title")} placeholder="Mô tả ngắn vấn đề" /></label>
          <label className={feature.field}><span>Nội dung *</span><textarea value={form.content} onChange={update("content")} placeholder="Cung cấp thông tin để hỗ trợ xử lý" /></label>
        </div>
        {error && <p className={feature.error} role="alert">{error}</p>}
        {message && <p className={feature.notice} role="status">{message}</p>}
        <button className={feature.primary} type="submit"><Plus aria-hidden="true" />Lưu yêu cầu Demo</button>
      </form>
    </div>
  </>;
}
