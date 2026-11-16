import { Package } from "lucide-react";
import styles from "./OrderDashboardPreview.module.css";

const orders = [["VT-2408", "Phụ kiện gia dụng", "Đã mua hàng", "done"], ["VT-2395", "Vật tư đóng gói", "Đang vận chuyển", "moving"], ["VT-2372", "Thiết bị cửa hàng", "Về kho Việt Nam", "stored"]];

export default function OrderDashboardPreview() {
  return <div className={styles.dashboard} aria-label="Bảng quản lý đơn hàng minh họa"><aside><strong>VietTrung Order</strong>{["Tổng quan", "Đặt hàng", "Quản lý đơn", "Kho Trung Quốc", "Kho Việt Nam", "Thanh toán"].map((item, index) => <span className={index === 0 ? styles.selected : ""} key={item}>{item}</span>)}</aside><div className={styles.panel}><div className={styles.panelTop}><div><small>Dữ liệu minh họa</small><h2>Quản lý đơn hàng</h2></div><b>03 đơn</b></div><div className={styles.tabs}><span>Tất cả (03)</span><span>Đang xử lý</span><span>Đang vận chuyển</span></div><div className={styles.search}>Nhập mã đơn, sản phẩm...</div><div className={styles.orders}>{orders.map(([code, name, status, tone], index) => <article key={code}><span className={styles.product}><Package size={16} /></span><div><strong>{name}</strong><small>{code} · {index + 1} kiện hàng</small></div><b className={styles[tone]}>{status}</b></article>)}</div><div className={styles.route}><span>Đặt hàng</span><span>Kho TQ</span><span>Vận chuyển</span><span>Kho VN</span></div></div></div>;
}
