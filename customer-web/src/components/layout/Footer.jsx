import { Boxes, PackageSearch } from "lucide-react";
import styles from "./Footer.module.css";

const groups = [
  ["Dịch vụ", [["Mua hộ và đặt hàng", "/dich-vu#service-ordering"], ["Kho Trung Quốc", "/dich-vu#service-china-warehouse"], ["Vận chuyển Trung – Việt", "/dich-vu#service-shipping"], ["Theo dõi đơn", "/#tra-cuu"]]],
  ["Hỗ trợ", [["Hướng dẫn sử dụng", "/huong-dan"], ["Câu hỏi thường gặp", "/huong-dan#faq"], ["Trung tâm hỗ trợ", "/#ho-tro"]]],
  ["Chính sách", [["Điều khoản (đang cập nhật)", "/#ho-tro"], ["Bảo mật (đang cập nhật)", "/#ho-tro"], ["Quy định vận chuyển", "/#ho-tro"]]],
];

export default function Footer() {
  return <footer className={styles.footer}><div className={`container ${styles.grid}`}><div className={styles.brand}><a href="/#top"><span>V</span><strong>VietTrung Order</strong></a><p>Giải pháp hỗ trợ quản lý nhập hàng và vận chuyển Trung Quốc – Việt Nam trong một quy trình rõ ràng.</p><div><span><Boxes size={15}/> Quản lý kiện</span><span><PackageSearch size={15}/> Theo dõi đơn</span></div></div>{groups.map(([title, links]) => <section key={title}><h2>{title}</h2><ul>{links.map(([label, href]) => <li key={label}><a href={href}>{label}</a></li>)}</ul></section>)}</div><div className={`container ${styles.note}`}>Thông tin pháp nhân và liên hệ sẽ hiển thị sau khi được cấu hình, xác minh.</div><div className={styles.bottom}><div className="container">© {new Date().getFullYear()} VietTrung Order. All rights reserved.</div></div></footer>;
}
