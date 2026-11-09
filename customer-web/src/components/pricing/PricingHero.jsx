import { Calculator, CircleDollarSign, ListChecks, Route } from "lucide-react";
import ImageSlot from "../ui/ImageSlot.jsx";
import styles from "./PricingPage.module.css";

const highlights = [
  { label: "Chi phí rõ ràng", icon: ListChecks },
  { label: "Nhiều hình thức vận chuyển", icon: Route },
  { label: "Dễ dàng ước tính", icon: Calculator },
];

export default function PricingHero() {
  return <section className={styles.hero} id="top"><div className={`container ${styles.heroGrid}`}><div className={styles.heroCopy}><span className="sectionEyebrow">Bảng giá dịch vụ</span><h1>Chi phí minh bạch, <em>nhập hàng dễ dàng</em></h1><p>Tra cứu phí mua hộ, vận chuyển và các dịch vụ hỗ trợ trên cùng một hệ thống. Dễ dàng dự trù chi phí trước khi gửi yêu cầu.</p><ul>{highlights.map(({ label, icon: Icon }) => <li key={label}><Icon /> {label}</li>)}</ul></div><div className={styles.heroVisual}><ImageSlot label="Ảnh minh họa bảng giá" alt="Minh họa bảng giá VietTrung Order" eager /><div className={styles.heroFloats}><span><CircleDollarSign /> Tỷ giá CNY/VND <b>Đang cập nhật</b></span><span><ListChecks /> Phí dịch vụ <b>Chưa có dữ liệu</b></span><span><Calculator /> Ước tính đơn hàng <b>Cần cấu hình giá</b></span></div></div></div></section>;
}
