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
import NotificationsPage from "./NotificationsPage.jsx";
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
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    getCustomerSession().then((result) => setAccount(result.account)).catch(() => {
      const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      window.location.replace(`/dang-nhap?redirect=${redirect}`);
    });
  }, []);
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
    content = <><PageHeader title="Tài khoản & bảo mật" description="Thông tin tài khoản khách hàng đã xác thực."/><section className={styles.settingsContent}><h2>Thông tin tài khoản</h2><div className={styles.formGrid}><div className={styles.field}><label>Họ và tên</label><input value={account.name} readOnly/></div><div className={styles.field}><label>Mã khách hàng</label><input value={account.customer_code} readOnly/></div><div className={styles.field}><label>Email</label><input value={account.email} readOnly/></div><div className={styles.field}><label>Số điện thoại</label><input value={account.phone} readOnly/></div></div><h2>Đổi mật khẩu</h2><form onSubmit={changePassword}><div className={styles.formGrid}>{[["current","Mật khẩu hiện tại"],["next","Mật khẩu mới"],["confirmation","Xác nhận mật khẩu"]].map(([key,label]) => <div className={styles.field} key={key}><label htmlFor={`real-${key}`}>{label}</label><input id={`real-${key}`} type="password" value={passwords[key]} onChange={(event) => setPasswords((value) => ({ ...value, [key]: event.target.value }))} required/></div>)}</div><button className={styles.primaryAction}>Đổi mật khẩu</button>{error && <p className={styles.fieldError} role="alert">{error}</p>}{feedback && <p className={styles.formFeedback} role="status">{feedback}</p>}</form></section></>;
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
  } else {
    content = <><PageHeader title="Chức năng đang được hoàn thiện" description="Không sử dụng API quản trị hoặc dữ liệu Demo trong phiên thật."/><IntegrationNotice>Module này chưa có API Customer được phân quyền theo customer_id.</IntegrationNotice></>;
  }
  return <CustomerPortalLayout profile={{ ...account, initials }} unreadCount={0} onLogout={signOut}>{content}</CustomerPortalLayout>;
}
