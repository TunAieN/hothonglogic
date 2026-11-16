import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { formatDateTime, formatVnd } from "../../utils/customerFormatters.js";
import { EmptyState, FieldError, IntegrationNotice, Modal, PageHeader, StatusBadge } from "../../components/customer/PortalComponents.jsx";
import styles from "../../components/customer/CustomerPortal.module.css";
import { useDemoPortal } from "../../components/customer/DemoPortalContext.jsx";

const initialForm = { tracking: "", name: "", quantity: "", weight: "", notes: "" };

export default function ConsignmentPage({ data, openCreate = false }) {
  const { addConsignment } = useDemoPortal();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(openCreate);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState("");
  const filtered = useMemo(() => data.consignments.filter((item) => `${item.tracking} ${item.name}`.toLowerCase().includes(search.trim().toLowerCase())), [data.consignments, search]);
  const close = () => { setOpen(false); setErrors({}); setFeedback(""); };
  const update = (field) => (event) => { setForm((current) => ({ ...current, [field]: event.target.value })); setErrors((current) => ({ ...current, [field]: "" })); };
  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (!form.tracking.trim()) next.tracking = "Vui lòng nhập mã vận đơn.";
    if (!form.name.trim()) next.name = "Vui lòng nhập tên hàng.";
    if (form.quantity && (!Number.isFinite(Number(form.quantity)) || Number(form.quantity) <= 0)) next.quantity = "Số lượng phải lớn hơn 0.";
    if (form.weight && (!Number.isFinite(Number(form.weight)) || Number(form.weight) < 0)) next.weight = "Cân nặng không được âm.";
    setErrors(next);
    if (Object.keys(next).length) return;
    addConsignment(form);
    setFeedback("Đã thêm khai báo vào Demo Store. Chưa gửi dữ liệu đến backend thật.");
    setForm(initialForm);
  };

  return <><PageHeader title="Hàng ký gửi" description="Quản lý mã vận đơn và theo dõi hành trình kiện hàng từ Trung Quốc về Việt Nam." action={<button className={styles.primaryAction} type="button" onClick={() => setOpen(true)}><Plus />Thêm mã vận đơn</button>} /><IntegrationNotice>Form được chuẩn bị để kiểm tra giao diện và validation; thao tác lưu chưa được kết nối.</IntegrationNotice><div className={styles.toolbar}><label className={styles.searchBox}><Search /><span className="srOnly">Tìm kiếm ký gửi</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã vận đơn, tên hàng..." /></label></div><section className={styles.panel}>{filtered.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Mã vận đơn</th><th>Tên hàng</th><th>Ngày khai báo</th><th>Cân nặng</th><th>Trạng thái</th><th>Cước phí</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.tracking}</strong></td><td>{item.name}</td><td>{formatDateTime(item.declaredAt)}</td><td>{item.weight} kg</td><td><StatusBadge status={item.status} /></td><td>{formatVnd(item.feeVnd)}</td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có kiện ký gửi" />}</section><Modal open={open} onClose={close} title="Khai báo hàng ký gửi" description="Dữ liệu sẽ không được gửi khi API khách hàng chưa sẵn sàng."><form onSubmit={submit} noValidate><div className={styles.formGrid}><div className={`${styles.field} ${styles.full}`}><label htmlFor="consignment-tracking">Mã vận đơn nội địa Trung Quốc *</label><input id="consignment-tracking" value={form.tracking} onChange={update("tracking")} aria-invalid={Boolean(errors.tracking)} /><FieldError id="consignment-tracking-error">{errors.tracking}</FieldError></div><div className={styles.field}><label htmlFor="consignment-name">Tên hàng *</label><input id="consignment-name" value={form.name} onChange={update("name")} /><FieldError>{errors.name}</FieldError></div><div className={styles.field}><label htmlFor="consignment-quantity">Số lượng</label><input id="consignment-quantity" type="number" min="1" value={form.quantity} onChange={update("quantity")} /><FieldError>{errors.quantity}</FieldError></div><div className={styles.field}><label htmlFor="consignment-weight">Cân nặng dự kiến (kg)</label><input id="consignment-weight" type="number" min="0" step="0.1" value={form.weight} onChange={update("weight")} /><FieldError>{errors.weight}</FieldError></div><div className={`${styles.field} ${styles.full}`}><label htmlFor="consignment-notes">Ghi chú</label><textarea id="consignment-notes" value={form.notes} onChange={update("notes")} /></div></div>{feedback && <p className={styles.formFeedback} role="status">{feedback}</p>}<div className={styles.formActions}><button className={styles.secondaryAction} type="button" onClick={close}>Hủy</button><button className={styles.primaryAction} type="submit">Kiểm tra khai báo</button></div></form></Modal></>;
}
