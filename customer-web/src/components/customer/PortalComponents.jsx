import { useEffect, useRef } from "react";
import { AlertCircle, DatabaseZap, Package, X } from "lucide-react";
import { getPortalRoutes, isCustomerPortalDemoPath } from "../../config/customerPortal.js";
import { formatDateTime, formatVnd, getOrderStatus } from "../../utils/customerFormatters.js";
import ProductThumbnail from "./ProductThumbnail.jsx";
import styles from "./CustomerPortal.module.css";

export function PageHeader({ title, description, action, icon: Icon, eyebrow }) {
  return <div className={styles.pageHeader}><div className={styles.pageHeading}>{Icon && <span className={styles.pageHeadingIcon}><Icon aria-hidden="true" /></span>}<div>{eyebrow && <small>{eyebrow}</small>}<h1>{title}</h1>{description && <p>{description}</p>}</div></div>{action}</div>;
}

export function StatusBadge({ status }) {
  const metadata = getOrderStatus(status);
  return <span className={`${styles.statusBadge} ${styles[metadata.tone]}`}><span aria-hidden="true" />{metadata.label}</span>;
}

export function DemoNotice() {
  if (!isCustomerPortalDemoPath(window.location.pathname)) return null;
  return <div className={styles.demoNotice} role="status"><DatabaseZap aria-hidden="true" /><span><strong>Chế độ xem trước · Dữ liệu minh họa</strong> — không có API khách hàng hoặc giao dịch thật nào được sử dụng.</span></div>;
}

export function IntegrationNotice({ title = "Chức năng đang chờ tích hợp", children }) {
  return <div className={styles.integrationNotice} role="status"><AlertCircle aria-hidden="true" /><div><strong>{title}</strong><p>{children || "Backend hiện chưa cung cấp API khách hàng và phân quyền phù hợp cho chức năng này."}</p></div></div>;
}

export function EmptyState({ title = "Chưa có dữ liệu", description = "Thông tin sẽ xuất hiện tại đây khi có dữ liệu phù hợp." }) {
  return <div className={styles.emptyState}><DatabaseZap aria-hidden="true" /><h3>{title}</h3><p>{description}</p></div>;
}

export function LoadingState() {
  return <div className={styles.loadingState} role="status" aria-live="polite"><span /><p>Đang tải dữ liệu tài khoản...</p></div>;
}

export function OrderTable({ orders }) {
  const portalRoutes = getPortalRoutes();
  if (!orders.length) return <EmptyState title="Chưa có đơn hàng" description="Không tìm thấy đơn hàng phù hợp với bộ lọc hiện tại." />;
  return <><div className={`${styles.tableWrap} ${styles.desktopOnly}`}><table className={styles.table}><thead><tr><th>Mã đơn</th><th>Sản phẩm</th><th>Nguồn hàng</th><th>Tổng tiền</th><th>Trạng thái</th><th>Cập nhật</th><th>Thao tác</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.code}</strong></td><td><div className={styles.productCell}><ProductThumbnail src={order.items?.[0]?.imageUrl || order.items?.[0]?.productImage} alt={order.product} size="small" /><span><strong>{order.product}</strong><small>{order.quantity} sản phẩm</small></span></div></td><td>{order.source}</td><td>{formatVnd(order.totalVnd)}</td><td><StatusBadge status={order.status} /></td><td>{formatDateTime(order.updatedAt)}</td><td><a href={`${portalRoutes.orderDetail}?id=${encodeURIComponent(order.id)}`}>Chi tiết</a></td></tr>)}</tbody></table></div><div className={styles.mobileCards}>{orders.map((order) => <article className={styles.orderCard} key={order.id}><header><ProductThumbnail src={order.items?.[0]?.imageUrl || order.items?.[0]?.productImage} alt={order.product} size="small" /><div><h3>{order.code}</h3><p>{order.product}</p></div><Package aria-hidden="true" /></header><div className={styles.orderMeta}><span><small>Tổng tiền</small><strong>{formatVnd(order.totalVnd)}</strong></span><span><small>Nguồn hàng</small><strong>{order.source}</strong></span></div><footer><StatusBadge status={order.status} /><a href={`${portalRoutes.orderDetail}?id=${encodeURIComponent(order.id)}`}>Xem chi tiết</a></footer></article>)}</div></>;
}

export function Modal({ open, title, description, onClose, children, className = "", icon: Icon = null }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]') || [])];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;
  return <div className={styles.modalOverlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className={`${styles.modal} ${className}`} role="dialog" aria-modal="true" aria-labelledby="portal-modal-title"><header><div className={styles.modalHeading}>{Icon && <span className={styles.modalHeadingIcon}><Icon /></span>}<div><h2 id="portal-modal-title">{title}</h2>{description && <p>{description}</p>}</div></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng hộp thoại"><X /></button></header>{children}</section></div>;
}

export function FieldError({ id, children }) {
  return children ? <p className={styles.fieldError} id={id} role="alert">{children}</p> : null;
}
