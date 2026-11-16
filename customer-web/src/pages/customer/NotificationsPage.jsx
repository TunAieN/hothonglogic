import { useMemo, useState } from "react";
import { BellRing, Boxes, Megaphone, ShoppingBag } from "lucide-react";
import { formatDateTime } from "../../utils/customerFormatters.js";
import { IntegrationNotice, PageHeader } from "../../components/customer/PortalComponents.jsx";
import { useDemoPortal } from "../../components/customer/DemoPortalContext.jsx";
import styles from "../../components/customer/CustomerPortal.module.css";

const icons = { order: ShoppingBag, package: Boxes, system: Megaphone };
export default function NotificationsPage({ data }) {
  const [filter, setFilter] = useState("all"); const { markNotificationRead } = useDemoPortal();
  const notifications = useMemo(() => data.notifications.filter((item) => filter === "all" || (filter === "unread" ? item.unread : item.type === filter)), [data.notifications, filter]);
  return <><PageHeader title="Thông báo" description="Theo dõi cập nhật đơn hàng, kiện hàng và thông báo hệ thống." action={<button type="button" className={styles.secondaryAction} onClick={() => data.notifications.filter((item) => item.unread).forEach((item) => markNotificationRead(item.id))}>Đánh dấu tất cả đã đọc</button>} /><IntegrationNotice>Trạng thái đã đọc chỉ được lưu trong Development Demo Mode; chưa đồng bộ backend.</IntegrationNotice><div className={styles.tabs}>{[["all","Tất cả"],["unread","Chưa đọc"],["order","Đơn hàng"],["package","Vận chuyển"],["system","Hệ thống"]].map(([value,label]) => <button key={value} type="button" className={filter === value ? styles.active : ""} onClick={() => setFilter(value)}>{label}</button>)}</div><section className={styles.panel}><div className={styles.notificationList}>{notifications.map((item) => { const Icon = icons[item.type] || BellRing; return <article className={styles.notificationItem} key={item.id}><span><Icon /></span><div><strong>{item.title}{item.unread && " • Chưa đọc"}</strong><p>{item.body}</p>{item.unread && <button type="button" className={styles.linkButton} onClick={() => markNotificationRead(item.id)}>Đánh dấu đã đọc</button>}</div><time>{formatDateTime(item.createdAt)}</time></article>; })}</div>{!notifications.length && <p>Không có thông báo phù hợp.</p>}</section></>;
}
