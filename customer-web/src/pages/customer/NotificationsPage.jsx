import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Boxes, Megaphone, ShoppingBag } from "lucide-react";
import { formatDateTime } from "../../utils/customerFormatters.js";
import { IntegrationNotice, PageHeader } from "../../components/customer/PortalComponents.jsx";
import { useDemoPortal } from "../../components/customer/DemoPortalContext.jsx";
import styles from "../../components/customer/CustomerPortal.module.css";
import { getCustomerNotifications, markAllCustomerNotificationsRead, markCustomerNotificationRead } from "../../api/customerPortal.js";
import { EmptyState, LoadingState } from "../../components/customer/PortalComponents.jsx";

const icons = { order: ShoppingBag, package: Boxes, system: Megaphone };
export default function NotificationsPage({ data }) {
  const [filter, setFilter] = useState("all"); const { markNotificationRead } = useDemoPortal();
  const notifications = useMemo(() => data.notifications.filter((item) => filter === "all" || (filter === "unread" ? item.unread : item.type === filter)), [data.notifications, filter]);
  return <><PageHeader title="Thông báo" description="Theo dõi cập nhật đơn hàng, kiện hàng và thông báo hệ thống." action={<button type="button" className={styles.secondaryAction} onClick={() => data.notifications.filter((item) => item.unread).forEach((item) => markNotificationRead(item.id))}>Đánh dấu tất cả đã đọc</button>} /><IntegrationNotice>Trạng thái đã đọc chỉ được lưu trong Development Demo Mode; chưa đồng bộ backend.</IntegrationNotice><div className={styles.tabs}>{[["all","Tất cả"],["unread","Chưa đọc"],["order","Đơn hàng"],["package","Vận chuyển"],["system","Hệ thống"]].map(([value,label]) => <button key={value} type="button" className={filter === value ? styles.active : ""} onClick={() => setFilter(value)}>{label}</button>)}</div><section className={styles.panel}><div className={styles.notificationList}>{notifications.map((item) => { const Icon = icons[item.type] || BellRing; return <article className={styles.notificationItem} key={item.id}><span><Icon /></span><div><strong>{item.title}{item.unread && " • Chưa đọc"}</strong><p>{item.body}</p>{item.unread && <button type="button" className={styles.linkButton} onClick={() => markNotificationRead(item.id)}>Đánh dấu đã đọc</button>}</div><time>{formatDateTime(item.createdAt)}</time></article>; })}</div>{!notifications.length && <p>Không có thông báo phù hợp.</p>}</section></>;
}

export function RealNotificationsPage({ onUnreadChange }) {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ unread: 0, total: 0 });
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const result = await getCustomerNotifications({ per_page: 100 });
      setRows(result.data || []);
      setMeta(result.meta || { unread: 0, total: 0 });
      onUnreadChange?.(Number(result.meta?.unread || 0));
      setError("");
    } catch (reason) {
      setError(reason.message || "Không thể tải thông báo.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onUnreadChange]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load({ silent: true }); }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);
  const visible = useMemo(() => rows.filter((item) => filter === "all" || (filter === "unread" ? !item.read_at : item.type === filter)), [rows, filter]);
  const readOne = async (id) => { await markCustomerNotificationRead(id); await load({ silent: true }); };
  const readAll = async () => { await markAllCustomerNotificationsRead(); await load({ silent: true }); };
  const iconFor = (type) => type.startsWith("deposit") ? ShoppingBag : BellRing;
  return <><PageHeader title="Thông báo" description="Cập nhật yêu cầu đặt cọc, đối soát và trạng thái đơn hàng." action={<button type="button" className={styles.secondaryAction} disabled={!meta.unread} onClick={() => void readAll()}>Đánh dấu tất cả đã đọc</button>} />
    <div className={styles.tabs}>{[["all","Tất cả"],["unread","Chưa đọc"],["deposit_requested","Yêu cầu cọc"],["deposit_paid","Đã thanh toán"],["deposit_reconciliation","Cần kiểm tra"]].map(([value,label]) => <button key={value} type="button" className={filter === value ? styles.active : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <section className={styles.panel}>{error && <p role="alert">{error}</p>}{loading ? <LoadingState /> : visible.length ? <div className={styles.notificationList}>{visible.map((item) => { const Icon = iconFor(item.type); return <article className={styles.notificationItem} key={item.id}><span><Icon /></span><div><strong>{item.title}{!item.read_at && " • Chưa đọc"}</strong><p>{item.body}</p><div>{item.action_url && <a className={styles.linkButton} href={item.action_url}>Xem chi tiết</a>}{!item.read_at && <button type="button" className={styles.linkButton} onClick={() => void readOne(item.id)}>Đánh dấu đã đọc</button>}</div></div><time>{formatDateTime(item.sent_at || item.created_at)}</time></article>; })}</div> : <EmptyState title="Không có thông báo phù hợp" description="Các cập nhật thanh toán mới sẽ xuất hiện tại đây." />}</section>
  </>;
}
