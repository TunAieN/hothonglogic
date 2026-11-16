import { BellRing, CreditCard, Headphones, PackageCheck, PackagePlus, SearchCheck, ShoppingCart, WalletCards } from "lucide-react";
import { getPortalRoutes } from "../../config/customerPortal.js";
import { formatDateTime, formatVnd } from "../../utils/customerFormatters.js";
import { OrderTable, PageHeader } from "../../components/customer/PortalComponents.jsx";
import styles from "../../components/customer/CustomerPortal.module.css";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

const portalRoutes = getPortalRoutes();

const statCards = [
  { key: "walletBalance", label: "Số dư ví", icon: WalletCards, format: formatVnd, action: "Xem giao dịch", href: portalRoutes.wallet },
  { key: "processingOrders", label: "Đơn đang xử lý", icon: ShoppingCart, format: (value) => value === null ? "Chưa có dữ liệu" : `${value} đơn`, action: "Xem chi tiết", href: portalRoutes.orders },
  { key: "shippingPackages", label: "Kiện đang vận chuyển", icon: PackageCheck, format: (value) => value === null ? "Chưa có dữ liệu" : `${value} kiện`, action: "Xem ký gửi", href: portalRoutes.consignments },
  { key: "debt", label: "Công nợ cần thanh toán", icon: CreditCard, format: formatVnd, action: "Chờ API thanh toán", href: null },
];

export default function OverviewPage({ data }) {
  const quickActions = [{ label: "Tạo yêu cầu mua hộ", href: portalRoutes.createOrder, icon: PackagePlus }, { label: "Khai báo ký gửi", href: portalRoutes.consignmentCreate, icon: PackageCheck }, { label: "Tra cứu hành trình", href: portalRoutes.tracking, icon: SearchCheck }, { label: "Gửi yêu cầu hỗ trợ", href: portalRoutes.support, icon: Headphones }];
  return <><PageHeader title={`Xin chào, ${data.profile.name}`} description="Theo dõi đơn hàng, kiện vận chuyển và các dịch vụ tài khoản tại một nơi." /><section className={feature.quickGrid} aria-label="Thao tác nhanh">{quickActions.map(({ label, href, icon: Icon }) => <a className={feature.quickCard} href={href} key={label}><Icon /><span>{label}</span></a>)}</section><section className={styles.grid4} aria-label="Tổng quan tài khoản">{statCards.map(({ key, label, icon: Icon, format, action, href }) => <article className={styles.statCard} key={key}><div className={styles.statTop}><span className={styles.statIcon}><Icon aria-hidden="true" /></span></div><small>{label}</small><strong>{format(data.summary[key])}</strong><footer>{href ? <a href={href}>{action}</a> : <span>{action}</span>}</footer></article>)}</section><div className={styles.dashboardGrid}><section className={styles.panel}><header className={styles.panelHeader}><h2>Đơn hàng gần đây</h2><a href={portalRoutes.orders}>Xem tất cả</a></header><OrderTable orders={data.orders.slice(0, 4)} /></section><section className={styles.panel}><header className={styles.panelHeader}><h2>Thông báo gần đây</h2><a href={portalRoutes.notifications}>Xem tất cả</a></header><div className={styles.notificationList}>{data.notifications.slice(0, 4).map((notification) => <article className={styles.notificationItem} key={notification.id}><span><BellRing aria-hidden="true" /></span><div><strong>{notification.title}</strong><p>{notification.body}</p></div><time>{formatDateTime(notification.createdAt)}</time></article>)}</div></section></div></>;
}
