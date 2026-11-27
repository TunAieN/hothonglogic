import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Home, LoaderCircle, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { createCustomerAddress, deleteCustomerAddress, getAddressDistricts, getAddressProvinces, getAddressWards, getCustomerAddresses, setDefaultCustomerAddress, updateCustomerAddress } from "../../api/customerPortal.js";
import { EmptyState, FieldError, Modal } from "./PortalComponents.jsx";
import css from "./CustomerAddressBook.module.css";

const emptyForm = { label: "Nhà riêng", receiver_name: "", receiver_phone: "", province_code: "", province_name: "", district_code: "", district_name: "", ward_code: "", ward_name: "", address_line: "", delivery_note: "", is_default: false };
const errorText = (error) => error?.message || "Không thể xử lý địa chỉ. Vui lòng thử lại.";

function AddressForm({ initialValue, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...(initialValue || {}) }));
  const [provinces, setProvinces] = useState([]); const [districts, setDistricts] = useState([]); const [wards, setWards] = useState([]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  useEffect(() => { getAddressProvinces().then((v) => setProvinces(v.provinces || [])).catch((e) => setError(errorText(e))); }, []);
  useEffect(() => { if (form.province_code) getAddressDistricts(form.province_code).then((v) => setDistricts(v.districts || [])).catch((e) => setError(errorText(e))); }, [form.province_code]);
  useEffect(() => { if (form.district_code) getAddressWards(form.district_code).then((v) => setWards(v.wards || [])).catch((e) => setError(errorText(e))); }, [form.district_code]);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => { event.preventDefault(); setLoading(true); setError(""); try { const response = await (initialValue?.id ? updateCustomerAddress(initialValue.id, form) : createCustomerAddress(form)); onSaved(response.address); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } };
  return <form className={css.form} onSubmit={submit} noValidate><div className={css.formGrid}>
    <label><span>Họ tên người nhận *</span><input value={form.receiver_name} maxLength="150" onChange={(e) => set("receiver_name", e.target.value)} required /></label>
    <label><span>Số điện thoại *</span><input value={form.receiver_phone} maxLength="30" inputMode="tel" onChange={(e) => set("receiver_phone", e.target.value)} required /></label>
    <label><span>Tỉnh/Thành phố *</span><select value={form.province_code} onChange={(e) => { const option = e.target.selectedOptions[0]; setForm((current) => ({ ...current, province_code: e.target.value, province_name: option?.dataset.name || "", district_code: "", district_name: "", ward_code: "", ward_name: "" })); }} required><option value="">Chọn Tỉnh/Thành phố</option>{provinces.map((item) => <option key={item.province_id} value={item.province_id} data-name={item.name}>{item.name}</option>)}</select></label>
    <label><span>Quận/Huyện vận chuyển *</span><select value={form.district_code} onChange={(e) => { const option = e.target.selectedOptions[0]; setForm((current) => ({ ...current, district_code: e.target.value, district_name: option?.dataset.name || "", ward_code: "", ward_name: "" })); }} required><option value="">Chọn Quận/Huyện</option>{districts.map((item) => <option key={item.district_id} value={item.district_id} data-name={item.name}>{item.name}</option>)}</select></label>
    <label><span>Phường/Xã *</span><select value={form.ward_code} onChange={(e) => { const option = e.target.selectedOptions[0]; setForm((current) => ({ ...current, ward_code: e.target.value, ward_name: option?.dataset.name || "" })); }} required><option value="">Chọn Phường/Xã</option>{wards.map((item) => <option key={item.ward_code} value={item.ward_code} data-name={item.name}>{item.name}</option>)}</select></label>
    <label><span>Nhãn địa chỉ</span><select value={form.label} onChange={(e) => set("label", e.target.value)}><option>Nhà riêng</option><option>Văn phòng</option><option>Khác</option></select></label>
    <label className={css.full}><span>Địa chỉ chi tiết *</span><input value={form.address_line} maxLength="255" placeholder="Số nhà, tên đường, tòa nhà..." onChange={(e) => set("address_line", e.target.value)} required /></label>
    <label className={css.full}><span>Ghi chú giao hàng</span><textarea value={form.delivery_note || ""} maxLength="500" onChange={(e) => set("delivery_note", e.target.value)} placeholder="Ví dụ: gọi trước khi giao" /></label>
    <label className={`${css.checkbox} ${css.full}`}><input type="checkbox" checked={Boolean(form.is_default)} onChange={(e) => set("is_default", e.target.checked)} /><span>Đặt làm địa chỉ mặc định</span></label>
  </div><FieldError>{error}</FieldError><footer className={css.formActions}><button type="button" onClick={onCancel}>Hủy</button><button className={css.primary} disabled={loading}>{loading ? <LoaderCircle className={css.spin} /> : <Check />}{initialValue?.id ? "Lưu thay đổi" : "Thêm địa chỉ"}</button></footer></form>;
}

function AddressCard({ address, selected, selectable, onSelect, onEdit, onDelete, onDefault, busy }) {
  return <article className={`${css.card} ${selected ? css.selected : ""}`}>{selectable && <button className={css.selectArea} type="button" onClick={() => onSelect(address.id)} aria-pressed={selected} aria-label={`Chọn địa chỉ ${address.label}`} />}<header><span className={css.icon}><Home /></span><div><strong>{address.label || "Địa chỉ giao hàng"}</strong><p>{address.receiver_name} · {address.receiver_phone}</p></div>{address.is_default && <em><Star />Mặc định</em>}</header><p className={css.address}><MapPin />{address.full_address}</p>{address.delivery_note && <small>Ghi chú: {address.delivery_note}</small>}{!selectable && <footer><button onClick={() => onEdit(address)}><Pencil />Sửa</button>{!address.is_default && <button onClick={() => onDefault(address.id)} disabled={busy}><Star />Đặt mặc định</button>}<button className={css.danger} onClick={() => onDelete(address)} disabled={busy}><Trash2 />Xóa</button></footer>}{selectable && <span className={css.radio}>{selected && <Check />}</span>}</article>;
}

function useAddressBook(open = true) {
  const [addresses, setAddresses] = useState([]); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const value = await getCustomerAddresses(); setAddresses(value.addresses || []); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } }, []);
  useEffect(() => { if (open) void Promise.resolve().then(load); }, [load, open]);
  return { addresses, loading, error, load };
}

export function AddressBook() {
  const { addresses, loading, error, load } = useAddressBook(); const [editing, setEditing] = useState(null); const [formOpen, setFormOpen] = useState(false); const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState("");
  const remove = async (address) => { if (!window.confirm(`Xóa địa chỉ “${address.label}”?`)) return; setBusy(true); try { await deleteCustomerAddress(address.id); setFeedback("Đã xóa địa chỉ."); await load(); } catch (reason) { setFeedback(errorText(reason)); } finally { setBusy(false); } };
  const makeDefault = async (id) => { setBusy(true); try { await setDefaultCustomerAddress(id); setFeedback("Đã cập nhật địa chỉ mặc định."); await load(); } catch (reason) { setFeedback(errorText(reason)); } finally { setBusy(false); } };
  return <section className={css.book}><div className={css.toolbar}><div><strong>{addresses.length} địa chỉ</strong><span>Mỗi đơn sẽ lưu một bản chụp độc lập.</span></div><button className={css.primary} onClick={() => { setEditing(null); setFormOpen(true); }}><Plus />Thêm địa chỉ</button></div>{feedback && <p className={css.feedback}>{feedback}</p>}{error && <p className={css.error}>{error}</p>}{loading ? <div className={css.loading}><LoaderCircle className={css.spin} />Đang tải sổ địa chỉ...</div> : addresses.length ? <div className={css.grid}>{addresses.map((address) => <AddressCard key={address.id} address={address} onEdit={(value) => { setEditing(value); setFormOpen(true); }} onDelete={remove} onDefault={makeDefault} busy={busy} />)}</div> : <EmptyState title="Bạn chưa có địa chỉ nhận hàng" description="Thêm địa chỉ đầu tiên để sử dụng khi gửi yêu cầu mua hộ." />}<Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Chỉnh sửa địa chỉ" : "Thêm địa chỉ nhận hàng"} description="Thông tin này chỉ dùng cho giao hàng tại Việt Nam." icon={MapPin} className={css.modal}><AddressForm initialValue={editing} onCancel={() => setFormOpen(false)} onSaved={async () => { setFormOpen(false); setFeedback(editing ? "Đã cập nhật địa chỉ." : "Đã thêm địa chỉ."); await load(); }} /></Modal></section>;
}

export function AddressSelectionModal({ open, onClose, onConfirm, busy }) {
  const { addresses, loading, error, load } = useAddressBook(open); const [selectedId, setSelectedId] = useState(null); const [formOpen, setFormOpen] = useState(false);
  const effectiveSelectedId = addresses.some((item) => item.id === selectedId) ? selectedId : (addresses.find((item) => item.is_default)?.id || addresses[0]?.id || null);
  const selected = useMemo(() => addresses.find((item) => item.id === effectiveSelectedId), [addresses, effectiveSelectedId]);
  return <Modal open={open} onClose={onClose} title="Chọn địa chỉ nhận hàng" description="Đơn hàng sẽ lưu bản chụp của địa chỉ được chọn." icon={MapPin} className={css.selectionModal}><div className={css.selectionBody}>{error && <p className={css.error}>{error}</p>}{loading ? <div className={css.loading}><LoaderCircle className={css.spin} />Đang tải địa chỉ mới nhất...</div> : addresses.length ? <div className={css.selectionList}>{addresses.map((address) => <AddressCard key={address.id} address={address} selectable selected={address.id === effectiveSelectedId} onSelect={setSelectedId} />)}</div> : !formOpen && <EmptyState title="Bạn chưa có địa chỉ nhận hàng" description="Thêm địa chỉ ngay tại đây; sản phẩm trong giỏ vẫn được giữ nguyên." />}{formOpen ? <AddressForm onCancel={() => setFormOpen(false)} onSaved={async (address) => { setFormOpen(false); await load(); setSelectedId(address.id); }} /> : <button className={css.addInline} onClick={() => setFormOpen(true)}><Plus />Thêm địa chỉ nhận hàng</button>}</div>{!formOpen && <footer className={css.selectionActions}><button onClick={onClose}>Hủy</button><button className={css.primary} disabled={!selected || busy} onClick={() => onConfirm(selected.id)}>{busy ? <LoaderCircle className={css.spin} /> : <Check />}Xác nhận địa chỉ và gửi yêu cầu</button></footer>}</Modal>;
}
