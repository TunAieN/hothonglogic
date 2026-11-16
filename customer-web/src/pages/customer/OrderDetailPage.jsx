import { ShieldAlert } from "lucide-react";
import { getPortalRoutes } from "../../config/customerPortal.js";
import { formatDateTime, formatVnd, getOrderStatus } from "../../utils/customerFormatters.js";
import { EmptyState, IntegrationNotice, PageHeader, StatusBadge } from "../../components/customer/PortalComponents.jsx";
import ProductThumbnail from "../../components/customer/ProductThumbnail.jsx";
import styles from "../../components/customer/CustomerPortal.module.css";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

const timelineStatuses = ["pending","awaiting_deposit","purchasing","awaiting_tracking","waiting_cn_warehouse","shipped","completed"];
export default function OrderDetailPage({ data }) {
  const routes = getPortalRoutes();
  const pathId = window.location.pathname.split("/").filter(Boolean).pop();
  const id = new URLSearchParams(window.location.search).get("id") || (pathId !== "chi-tiet" ? pathId : null);
  const order = data.orders.find((item) => item.id === id);
  if (!order) return <><PageHeader title="Chi tiết đơn hàng" description="Không tìm thấy đơn hàng minh họa theo mã yêu cầu." action={<a className={styles.secondaryAction} href={routes.orders}>Quay lại danh sách</a>} /><section className={styles.panel}><EmptyState title="Không tìm thấy đơn hàng" description="Đơn có thể không tồn tại hoặc không thuộc nguồn dữ liệu hiện tại." /></section></>;
  const currentIndex = Math.max(0, timelineStatuses.indexOf(order.status));
  const payments = data.transactions.filter((item) => item.description?.includes(order.code));
  const address = data.addresses.find((item) => item.id === order.addressId) || data.addresses.find((item) => item.isDefault);

  return <>
    <PageHeader title={`Đơn hàng ${order.code}`} description={`Ngày tạo: ${formatDateTime(order.createdAt)}`} action={<StatusBadge status={order.status} />} />
    <section className={styles.panel}><header className={styles.panelHeader}><h2>Hành trình đơn hàng</h2><span>{getOrderStatus(order.status).label}</span></header><div className={styles.timeline}>{timelineStatuses.map((status,index) => <div className={`${styles.timelineStep} ${index < currentIndex ? styles.complete : ""} ${index === currentIndex ? styles.current : ""}`} key={status}><span>{index + 1}</span><strong>{getOrderStatus(status).label}</strong><small>{index <= currentIndex ? "Đã cập nhật" : "Chờ xử lý"}</small></div>)}</div></section>
    <div className={styles.summaryGrid}><section className={styles.panel}><header className={styles.panelHeader}><h2>Danh sách sản phẩm ({order.items.length})</h2></header><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Sản phẩm</th><th>Phân loại</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td><div className={styles.productCell}><ProductThumbnail src={item.imageUrl || item.productImage} alt={item.name} size="small" /><span><strong>{item.name}</strong><small>{item.source || order.source}</small></span></div></td><td>{item.variant}</td><td>{item.quantity}</td><td>{formatVnd(item.unitPriceVnd)}</td><td>{formatVnd(item.unitPriceVnd * item.quantity)}</td></tr>)}</tbody></table></div></section><aside className={styles.summaryCard}><h2>Tổng quan thanh toán</h2><div className={styles.summaryRows}><div><span>Giá trị đơn minh họa</span><strong>{formatVnd(order.totalVnd)}</strong></div><div><span>Đã thanh toán</span><strong>{formatVnd(order.paidVnd || 0)}</strong></div><div><span>Còn lại</span><strong>{formatVnd(order.totalVnd - (order.paidVnd || 0))}</strong></div></div></aside></div>
    <div className={styles.summaryGrid}><section className={feature.contentCard}><header className={feature.cardHeader}><h2>Thông tin giao nhận</h2></header>{address ? <><strong>{address.receiver} · {address.phone}</strong><p className={feature.muted}>{address.fullAddress}</p></> : <p className={feature.muted}>Chưa chọn địa chỉ nhận hàng.</p>}</section><section className={feature.contentCard}><header className={feature.cardHeader}><h2>Lịch sử thanh toán</h2></header>{payments.length ? payments.map((item) => <p key={item.id}>{formatDateTime(item.createdAt)} · {formatVnd(item.amountVnd)}</p>) : <p className={feature.muted}>Chưa có giao dịch liên kết với đơn này.</p>}</section></div>
    <IntegrationNotice title="Thanh toán thực chưa khả dụng"><ShieldAlert aria-hidden="true" /> Portal không gọi mutation quản trị. <a href={routes.support}>Gửi yêu cầu hỗ trợ Demo</a> nếu cần kiểm tra luồng liên quan.</IntegrationNotice>
  </>;
}
