import { useEffect, useState } from "react";
import { Bell, ChevronDown, ChevronRight, Home, LogOut, Menu, X } from "lucide-react";
import { getCustomerMenu, getCustomerMenuGroups, customerSupportLink } from "../../data/customerMenu.js";
import { getPortalRoutes, isCustomerPortalDemoPath } from "../../config/customerPortal.js";
import { DemoNotice } from "./PortalComponents.jsx";
import styles from "./CustomerPortal.module.css";

const isMenuActive = (item, pathname) => item.id === "overview"
  ? pathname === item.href
  : pathname === item.href || pathname.startsWith(`${item.href}/`);

export default function CustomerPortalLayout({ children, profile, unreadCount = 0, onLogout }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const portalRoutes = getPortalRoutes(pathname);
  const customerMenu = getCustomerMenu(pathname);
  const menuGroups = getCustomerMenuGroups(pathname);
  const demoMode = isCustomerPortalDemoPath(pathname);
  const activeGroupId = menuGroups.find((group) => group.items.some((item) => isMenuActive(item, pathname)))?.id;
  const [openGroups, setOpenGroups] = useState(() => new Set(["main", activeGroupId].filter(Boolean)));

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleGroup = (id) => setOpenGroups((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const handleLogout = async () => {
    if (!onLogout || loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try { await onLogout(); }
    catch { setLogoutError("Không thể đăng xuất. Vui lòng thử lại."); }
    finally { setLoggingOut(false); }
  };

  const sidebar = <aside className={`${styles.sidebar} ${drawerOpen ? styles.drawerOpen : ""}`} id="customer-sidebar" aria-label="Điều hướng tài khoản">
    <div className={styles.brand}>
      <a href="/" aria-label="VietTrung Order - Trang chủ"><span>V</span><div><strong>VietTrung Order</strong><small>{demoMode ? "Dashboard Demo" : "Quản lý tài khoản"}</small></div></a>
      <button type="button" className={styles.drawerClose} onClick={() => setDrawerOpen(false)} aria-label="Đóng menu"><X /></button>
    </div>
    <nav className={styles.menuScroll}>{menuGroups.map((group) => <section className={styles.menuGroup} key={group.id}>
      <button type="button" className={styles.menuGroupButton} onClick={() => toggleGroup(group.id)} aria-expanded={openGroups.has(group.id)}><span>{group.label}</span><ChevronDown aria-hidden="true" /></button>
      {openGroups.has(group.id) && <div className={styles.menuGroupItems}>{group.items.map(({ icon: Icon, ...item }) => <a key={item.id} href={item.href} className={isMenuActive(item, pathname) ? styles.active : ""} aria-current={isMenuActive(item, pathname) ? "page" : undefined} onClick={() => setDrawerOpen(false)}><Icon aria-hidden="true" /><span>{item.label}</span>{item.id === "notifications" && unreadCount > 0 && <b aria-label={`${unreadCount} thông báo chưa đọc`}>{unreadCount}</b>}</a>)}</div>}
    </section>)}</nav>
    <div className={styles.sidebarFooter}>
      <a href="/"><Home aria-hidden="true" />Về trang chủ</a>
      <a href={customerSupportLink.href}><customerSupportLink.icon aria-hidden="true" />{customerSupportLink.label}</a>
      {demoMode
        ? <a href="/dang-nhap"><LogOut aria-hidden="true" />Thoát Demo</a>
        : <button type="button" onClick={handleLogout} disabled={loggingOut || !onLogout}><LogOut aria-hidden="true" />{loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</button>}
      {logoutError && <small role="alert">{logoutError}</small>}
    </div>
  </aside>;

  const mobileItems = ["overview", "createOrder", "orders", "tracking", "wallet"].map((id) => customerMenu.find((item) => item.id === id)).filter(Boolean);
  return <div className={styles.portal}>
    {sidebar}
    {drawerOpen && <button type="button" className={styles.drawerBackdrop} onClick={() => setDrawerOpen(false)} aria-label="Đóng menu tài khoản" />}
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button type="button" className={styles.menuButton} onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen} aria-controls="customer-sidebar" aria-label="Mở menu tài khoản"><Menu /></button>
        <div className={styles.breadcrumb}><span>Tài khoản</span><ChevronRight aria-hidden="true" /><strong>{customerMenu.find((item) => isMenuActive(item, pathname))?.label || "Chi tiết đơn hàng"}</strong></div>
        <div className={styles.topActions}><a href={portalRoutes.notifications} aria-label="Xem thông báo"><Bell />{unreadCount > 0 && <span>{unreadCount}</span>}</a><a href={portalRoutes.settings} className={styles.avatar} aria-label="Mở cài đặt tài khoản">{profile.initials}</a></div>
      </header>
      <main className={styles.main}><DemoNotice />{children}</main>
      <nav className={styles.mobileNav} aria-label="Điều hướng nhanh">
        {mobileItems.map(({ icon: Icon, ...item }) => <a key={item.id} href={item.href} className={isMenuActive(item, pathname) ? styles.active : ""}><Icon /><span>{item.label.replace("Tạo yêu cầu mua hộ", "Tạo đơn").replace("Đơn hàng mua hộ", "Đơn mua").replace("Tra cứu hành trình", "Tra cứu").replace("Ví & giao dịch", "Ví")}</span></a>)}
        <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Mở thêm mục"><Menu /><span>Thêm</span></button>
      </nav>
    </div>
  </div>;
}
