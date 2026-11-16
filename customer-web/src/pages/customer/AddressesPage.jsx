import { useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { FieldError, IntegrationNotice, Modal, PageHeader } from "../../components/customer/PortalComponents.jsx";
import styles from "../../components/customer/CustomerPortal.module.css";

const initialForm = { receiver: "", phone: "", province: "", district: "", ward: "", detail: "" };

export default function AddressesPage({ data }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState("");
  const close = () => { setOpen(false); setErrors({}); setFeedback(""); };
  const update = (field) => (event) => { setForm((current) => ({ ...current, [field]: event.target.value })); setErrors((current) => ({ ...current, [field]: "" })); };
  const submit = (event) => {
    event.preventDefault();
    const next = {};
    if (!form.receiver.trim()) next.receiver = "Vui lòng nhập họ tên người nhận.";
    if (!/^(?:\+84|0)\d{9}$/.test(form.phone.trim())) next.phone = "Số điện thoại chưa đúng định dạng.";
    for (const field of ["province", "district", "ward", "detail"]) if (!form[field].trim()) next[field] = "Vui lòng nhập thông tin này.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setFeedback("Chưa lưu địa chỉ: API hiện tại yêu cầu quyền quản trị và customer_id tùy ý.");
  };

  return <><PageHeader title="Sổ địa chỉ" description="Quản lý địa chỉ nhận hàng tại Việt Nam." action={<button className={styles.primaryAction} type="button" onClick={() => setOpen(true)}><Plus />Thêm địa chỉ</button>} /><IntegrationNotice>Địa chỉ demo không phải địa chỉ thật. Chức năng thêm/sửa/xóa chờ API tự scope theo khách hàng đăng nhập.</IntegrationNotice><div className={styles.addressGrid}>{data.addresses.map((address) => <article className={styles.addressCard} key={address.id}><header><div><h3>{address.receiver}</h3><p>{address.phone}</p></div>{address.isDefault && <span className={styles.defaultBadge}>Mặc định</span>}</header><p><MapPin size={15} /> {address.fullAddress}</p><footer><button type="button" onClick={() => setOpen(true)}>Sửa giao diện</button><button type="button" disabled>Xóa — chờ API</button></footer></article>)}</div><section className={styles.panel} style={{ marginTop: 14 }}><header className={styles.panelHeader}><h2>Địa chỉ kho Trung Quốc</h2></header><IntegrationNotice title="Chưa có địa chỉ kho được xác minh">Vui lòng liên hệ hỗ trợ để nhận thông tin kho và mã khách phù hợp. Portal không sử dụng địa chỉ trong ảnh demo.</IntegrationNotice></section><Modal open={open} onClose={close} title="Thông tin địa chỉ" description="Form chỉ kiểm tra giao diện và dữ liệu nhập."><form onSubmit={submit} noValidate><div className={styles.formGrid}>{[["receiver","Họ tên người nhận"],["phone","Số điện thoại"],["province","Tỉnh/Thành phố"],["district","Quận/Huyện"],["ward","Phường/Xã"],["detail","Địa chỉ chi tiết"]].map(([field,label]) => <div className={`${styles.field} ${field === "detail" ? styles.full : ""}`} key={field}><label htmlFor={`address-${field}`}>{label} *</label><input id={`address-${field}`} value={form[field]} onChange={update(field)} aria-invalid={Boolean(errors[field])} /><FieldError>{errors[field]}</FieldError></div>)}</div>{feedback && <p className={styles.formFeedback}>{feedback}</p>}<div className={styles.formActions}><button className={styles.secondaryAction} type="button" onClick={close}>Hủy</button><button className={styles.primaryAction} type="submit">Kiểm tra địa chỉ</button></div></form></Modal></>;
}
