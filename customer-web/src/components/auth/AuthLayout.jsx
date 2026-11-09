import { Layers3, PackageCheck, ShieldCheck, ShoppingCart, Truck, Zap } from "lucide-react";
import ImageSlot from "../ui/ImageSlot.jsx";
import styles from "./LoginPage.module.css";

const serviceBenefits = [
  { icon: ShoppingCart, title: "Đặt hàng thuận tiện", description: "Hỗ trợ yêu cầu nhập hàng từ nhiều nguồn." },
  { icon: Layers3, title: "Quản lý đơn minh bạch", description: "Theo dõi trạng thái và quá trình xử lý đơn hàng." },
  { icon: Truck, title: "Quản lý vận chuyển", description: "Theo dõi hành trình hàng hóa Trung Quốc – Việt Nam." },
  { icon: ShieldCheck, title: "Hỗ trợ khách hàng", description: "Tiếp nhận yêu cầu trong quá trình sử dụng." },
];

const trustItems = [
  { icon: ShieldCheck, title: "An toàn & bảo mật", description: "Chỉ xử lý qua kết nối chính thức" },
  { icon: Zap, title: "Quản lý thuận tiện", description: "Thông tin tập trung trên cùng hệ thống" },
  { icon: Layers3, title: "Minh bạch thông tin", description: "Đối chiếu theo dữ liệu từng đơn" },
  { icon: PackageCheck, title: "Hỗ trợ khách hàng", description: "Tiếp nhận yêu cầu khi cần thiết" },
];

export default function AuthLayout({ children }) {
  return <main className={styles.page}><section className={styles.authSection}><div className={`container ${styles.authCard}`}><div className={styles.intro}><span className={styles.eyebrow}><PackageCheck size={17}/> Nền tảng nhập hàng Trung Quốc</span><h1>Nhập hàng Trung Quốc <span>đơn giản và hiệu quả</span></h1><p>Đặt hàng, quản lý đơn, vận chuyển và thanh toán tập trung trên cùng một hệ thống.</p><div className={styles.benefitList}>{serviceBenefits.map(({ icon: Icon, title, description }) => <div className={styles.benefit} key={title}><span><Icon/></span><div><strong>{title}</strong><small>{description}</small></div></div>)}</div><div className={styles.visual}><ImageSlot label="Ảnh minh họa nhập hàng và logistics"/></div></div>{children}</div></section><section className={styles.trustSection} aria-label="Lợi ích của VietTrung Order"><div className={`container ${styles.trustGrid}`}>{trustItems.map(({ icon: Icon, title, description }) => <div key={title}><Icon/><span><strong>{title}</strong><small>{description}</small></span></div>)}</div></section></main>;
}
