import { useEffect, useState } from "react";
import CustomerPortalLayout from "../../components/customer/CustomerPortalLayout.jsx";
import { EmptyState, IntegrationNotice, LoadingState, PageHeader } from "../../components/customer/PortalComponents.jsx";
import { customerPortalRuntime, getPortalRoutes, isCustomerPortalDemoPath } from "../../config/customerPortal.js";
import { customerPortalDemoData } from "../../data/customerPortalDemo.js";
import OverviewPage from "./OverviewPage.jsx";
import OrdersPage from "./OrdersPage.jsx";
import OrderDetailPage from "./OrderDetailPage.jsx";
import ConsignmentPage from "./ConsignmentPage.jsx";
import WalletPage from "./WalletPage.jsx";
import AddressesPage from "./AddressesPage.jsx";
import NotificationsPage, { RealNotificationsPage } from "./NotificationsPage.jsx";
import AccountSettingsPage from "./AccountSettingsPage.jsx";
import CreateOrderPage from "./CreateOrderPage.jsx";
import CartAndDraftsPage from "./CartAndDraftsPage.jsx";
import TrackingPage from "./TrackingPage.jsx";
import CustomerPricingPage from "./CustomerPricingPage.jsx";
import SupportRequestsPage from "./SupportRequestsPage.jsx";
import { DemoPortalProvider, useDemoPortal } from "../../components/customer/DemoPortalContext.jsx";
import styles from "../../components/customer/CustomerPortal.module.css";
import { changeCustomerPassword, CustomerAuthError, getCustomerSession, logoutCustomer } from "../../api/customerAuth.js";
import { RealCartAndDraftsPage, RealCreateOrderPage, RealOrderDetailPage, RealOrdersPage } from "./RealPurchasePages.jsx";
import RealCustomerDashboard from "./RealCustomerDashboard.jsx";
import { ConsignmentComingSoon, RealConsignmentsPage, RealTrackingPage } from "./RealCustomerLogisticsPages.jsx";
import { RealCustomerPricingPage, RealOrderPaymentsPage, RealWalletPage } from "./RealCustomerFinancePages.jsx";
import { CheckCircle2, Eye, EyeOff, IdCard, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { getCustomerNotifications } from "../../api/customerPortal.js";

const emptyDemoData = {
  ...customerPortalDemoData,
  summary: { walletBalance: null, processingOrders: null, shippingPackages: null, debt: null },
  orders: [], consignments: [], transactions: [], addresses: [], notifications: [],
  cart: [], drafts: [], supportRequests: [], preferences: { orderNotifications: false, shippingNotifications: false, financeNotifications: false },
};

function resolvePage(pathname, data, portalRoutes) {
  if (pathname === portalRoutes.overview) return <OverviewPage data={data} routes={portalRoutes} />;
  if (pathname === portalRoutes.createOrder) return <CreateOrderPage routes={portalRoutes} />;
  if (pathname === portalRoutes.cart) return <CartAndDraftsPage routes={portalRoutes} />;
  if (pathname === portalRoutes.orderHistory) return <OrdersPage data={data} routes={portalRoutes} historyMode />;
  if (pathname === portalRoutes.orderPayments) return <WalletPage data={data} initialTab="payments" />;
  if (pathname === portalRoutes.orders) return <OrdersPage data={data} routes={portalRoutes} />;
  if (pathname === portalRoutes.orderDetail || pathname.startsWith(`${portalRoutes.orders}/`)) return <OrderDetailPage data={data} routes={portalRoutes} />;
  if (pathname === portalRoutes.consignmentCreate) return <ConsignmentPage data={data} openCreate />;
  if (pathname === portalRoutes.consignments) return <ConsignmentPage data={data} />;
  if (pathname === portalRoutes.tracking) return <TrackingPage />;
  if (pathname === portalRoutes.wallet) return <WalletPage data={data} />;
  if (pathname === portalRoutes.pricing) return <CustomerPricingPage />;
  if (pathname === portalRoutes.addresses) return <AddressesPage data={data} />;
  if (pathname === portalRoutes.notifications) return <NotificationsPage data={data} />;
  if (pathname === portalRoutes.settings) return <AccountSettingsPage data={data} />;
  if (pathname === portalRoutes.support) return <SupportRequestsPage />;
  return <><PageHeader title="Không tìm thấy trang" description="Đường dẫn tài khoản không tồn tại." /><section className={styles.panel}><EmptyState title="Trang không tồn tại" description="Vui lòng chọn một mục trong menu tài khoản." /></section></>;
}

function CustomerPortalContent({ pathname, portalRoutes }) {
  const { data: storeData } = useDemoPortal();
  const data = customerPortalRuntime.demoState === "empty" ? emptyDemoData : storeData;
  const unreadCount = data.notifications.filter((item) => item.unread).length;
  let content;
  if (customerPortalRuntime.demoState === "loading") content = <LoadingState />;
  else if (customerPortalRuntime.demoState === "error") content = <><PageHeader title="Không thể tải dữ liệu" description="Trạng thái lỗi minh họa để kiểm tra trải nghiệm người dùng." /><IntegrationNotice title="Kết nối dữ liệu không thành công">Vui lòng thử lại sau khi API khách hàng được cấu hình.</IntegrationNotice></>;
  else content = resolvePage(pathname, data, portalRoutes);
  return <CustomerPortalLayout profile={data.profile} unreadCount={unreadCount} cartCount={data.cart.length}>{content}</CustomerPortalLayout>;
}

export default function CustomerPortalPage() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const demoRoute = isCustomerPortalDemoPath(pathname);
  const previewAllowed = customerPortalRuntime.demoEnabled && demoRoute;
  const portalRoutes = getPortalRoutes(pathname);

  if (!demoRoute) return <RealCustomerPortal pathname={pathname} />;
  if (!previewAllowed) {
    window.location.replace("/dang-nhap");
    return <main className={styles.portal}><LoadingState /></main>;
  }

  return <DemoPortalProvider><CustomerPortalContent pathname={pathname} portalRoutes={portalRoutes} /></DemoPortalProvider>;
}

function RealCustomerPortal({ pathname }) {
  const portalRoutes = getPortalRoutes(pathname);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirmation: "" });
  const [passwordVisibility, setPasswordVisibility] = useState({ current: false, next: false, confirmation: false });
  const [feedback, setFeedback] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    getCustomerSession().then((result) => setAccount(result.account)).catch(() => {
      const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      window.location.replace(`/dang-nhap?redirect=${redirect}`);
    });
  }, []);
  useEffect(() => {
    if (!account) return undefined;
    let active = true;
    const refresh = () => getCustomerNotifications({ per_page: 1 }).then((result) => {
      if (active) setUnreadCount(Number(result.meta?.unread || 0));
    }).catch(() => {});
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [account]);
  if (!account) return <main className={styles.portal}><LoadingState /></main>;
  const initials = account.name.split(" ").slice(-2).map((part) => part[0]).join("").toUpperCase();
  const signOut = async () => { await logoutCustomer(); window.location.replace("/dang-nhap"); };
  const changePassword = async (event) => {
    event.preventDefault(); setError(""); setFeedback("");
    if (passwords.next.length < 12 || passwords.next !== passwords.confirmation) { setError("Mật khẩu mới cần ít nhất 12 ký tự và xác nhận phải khớp."); return; }
    try {
      const result = await changeCustomerPassword({ current_password: passwords.current, password: passwords.next, password_confirmation: passwords.confirmation });
      setFeedback(result.message); setPasswords({ current: "", next: "", confirmation: "" });
    } catch (reason) { setError(reason instanceof CustomerAuthError ? reason.message : "Không thể đổi mật khẩu."); }
  };
  let content;
  if (pathname === portalRoutes.settings) {
    const fields = [
      ["Họ và tên", account.name, UserRound], ["Mã khách hàng", account.customer_code, IdCard],
      ["Email", account.email, Mail], ["Số điện thoại", account.phone, Phone],
    ];
    const vip = account.vip || {};
    const spend = Number(vip.qualified_spend_vnd || 0);
    const nextSpend = Number(vip.next_tier_minimum_spend_vnd || 0);
    const progress = nextSpend > 0 ? Math.min(100, Math.round((spend / nextSpend) * 100)) : 100;
    content = <div className={styles.accountPage}><PageHeader title="Tài khoản & bảo mật" description="Thông tin tài khoản khách hàng và thiết lập mật khẩu."/><section className={styles.accountCard}><header><span><ShieldCheck /></span><h2>Hạng thành viên</h2></header><div className={styles.accountReadOnlyGrid}><label><span>Hạng VIP hiện tại</span><div><ShieldCheck /><input value={vip.name || "Chưa phân hạng"} readOnly /></div></label><label><span>Chi tiêu hợp lệ</span><div><IdCard /><input value={`${spend.toLocaleString("vi-VN")} ₫`} readOnly /></div></label><label><span>Quyền lợi cọc cơ bản</span><div><LockKeyhole /><input value={vip.deposit_policy_enabled && vip.base_deposit_percent != null ? `${vip.base_deposit_percent}%` : "Chờ chính sách được duyệt"} readOnly /></div></label><label><span>Tiến độ hạng tiếp theo</span><div><CheckCircle2 /><input value={vip.next_tier_name ? `${progress}% đến ${vip.next_tier_name}` : "Đã ở hạng cao nhất"} readOnly /></div></label></div><IntegrationNotice>Tỷ lệ cọc thực tế còn phụ thuộc mức rủi ro của từng đơn Taobao và phê duyệt ngoại lệ.</IntegrationNotice></section><section className={styles.accountCard}><header><span><UserRound /></span><h2>Thông tin tài khoản</h2></header><div className={styles.accountProfileGrid}><aside><div className={styles.accountAvatar}>{initials}</div><strong>{account.name}</strong>{account.email_verified && <span><CheckCircle2 /> Đã xác thực email</span>}</aside><div className={styles.accountReadOnlyGrid}>{fields.map(([label, value, Icon]) => <label key={label}><span>{label}</span><div><Icon /><input value={value || "Chưa cập nhật"} readOnly aria-label={label} /></div></label>)}</div></div></section><section className={styles.passwordCard}><header><span><LockKeyhole /></span><div><h2>Đổi mật khẩu</h2><p>Mật khẩu mới cần tối thiểu 12 ký tự.</p></div></header><form onSubmit={changePassword}><div className={styles.passwordGrid}>{[["current","Mật khẩu hiện tại"],["next","Mật khẩu mới"],["confirmation","Xác nhận mật khẩu mới"]].map(([key,label]) => <label key={key} className={key === "confirmation" ? styles.passwordFull : ""}><span>{label}</span><div><LockKeyhole /><input id={`real-${key}`} aria-label={label} type={passwordVisibility[key] ? "text" : "password"} autoComplete={key === "current" ? "current-password" : "new-password"} value={passwords[key]} onChange={(event) => setPasswords((value) => ({ ...value, [key]: event.target.value }))} required/><button type="button" aria-label={`${passwordVisibility[key] ? "Ẩn" : "Hiện"} ${label.toLowerCase()}`} onClick={() => setPasswordVisibility((value) => ({ ...value, [key]: !value[key] }))}>{passwordVisibility[key] ? <EyeOff /> : <Eye />}</button></div></label>)}</div>{error && <p className={styles.fieldError} role="alert">{error}</p>}{feedback && <p className={styles.formFeedback} role="status"><ShieldCheck /> {feedback}</p>}<button className={styles.primaryAction} disabled={!passwords.current || !passwords.next || !passwords.confirmation}><LockKeyhole /> Đổi mật khẩu</button></form></section></div>;
  } else if (pathname === portalRoutes.createOrder) {
    content = <RealCreateOrderPage routes={portalRoutes} customerId={account.customer_id} />;
  } else if (pathname === portalRoutes.cart) {
    content = <RealCartAndDraftsPage routes={portalRoutes} customerId={account.customer_id} />;
  } else if (pathname === portalRoutes.orderHistory) {
    content = <RealOrdersPage routes={portalRoutes} historyMode />;
  } else if (pathname === portalRoutes.orders) {
    content = <RealOrdersPage routes={portalRoutes} />;
  } else if (pathname.startsWith(`${portalRoutes.orders}/`)) {
    content = <RealOrderDetailPage routes={portalRoutes} />;
  } else if (pathname === portalRoutes.overview) {
    content = <RealCustomerDashboard account={account} routes={portalRoutes} />;
  } else if (pathname === portalRoutes.consignmentCreate) {
    content = <ConsignmentComingSoon routes={portalRoutes} />;
  } else if (pathname === portalRoutes.consignments) {
    content = <RealConsignmentsPage routes={portalRoutes} />;
  } else if (pathname === portalRoutes.tracking) {
    content = <RealTrackingPage routes={portalRoutes} />;
  } else if (pathname === portalRoutes.wallet) {
    content = <RealWalletPage />;
  } else if (pathname === portalRoutes.orderPayments) {
    content = <RealOrderPaymentsPage />;
  } else if (pathname === portalRoutes.pricing) {
    content = <RealCustomerPricingPage />;
  } else if (pathname === portalRoutes.notifications) {
    content = <RealNotificationsPage onUnreadChange={setUnreadCount} />;
  } else if (pathname === portalRoutes.addresses) {
    content = <AddressesPage />;
  } else {
    content = <><PageHeader title="Chức năng đang được hoàn thiện" description="Không sử dụng API quản trị hoặc dữ liệu Demo trong phiên thật."/><IntegrationNotice>Module này chưa có API Customer được phân quyền theo customer_id.</IntegrationNotice></>;
  }
  return <CustomerPortalLayout profile={{ ...account, initials }} unreadCount={unreadCount} onLogout={signOut}>{content}</CustomerPortalLayout>;
}
