import { MapPin, Plus } from "lucide-react";
import { PageHeader } from "../../components/customer/PortalComponents.jsx";
import { AddressBook } from "../../components/customer/CustomerAddressBook.jsx";
import styles from "../../components/customer/CustomerPortal.module.css";

export default function AddressesPage() {
  return <>
    <PageHeader icon={MapPin} eyebrow="Tài khoản khách hàng" title="Sổ địa chỉ" description="Quản lý địa chỉ nhận hàng tại Việt Nam. Đơn đã gửi luôn giữ một bản chụp địa chỉ riêng." action={<span className={styles.primaryAction}><Plus />Thêm và quản lý bên dưới</span>} />
    <AddressBook />
  </>;
}
