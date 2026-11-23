import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Check, ChevronRight, CircleAlert, Clock3, FileClock, Headphones, History, Package, PackageCheck, PackagePlus, RefreshCw, ShoppingBag, ShoppingCart, WalletCards } from "lucide-react";
import { getCustomerDashboardAnalytics, getCustomerFinanceSummary, getCustomerOrders } from "../../api/customerPortal.js";
import DashboardCharts, { Sparkline } from "../../components/customer/DashboardCharts.jsx";
import ProductThumbnail from "../../components/customer/ProductThumbnail.jsx";
import { StatusBadge } from "../../components/customer/PortalComponents.jsx";
import useCustomerCart from "../../hooks/useCustomerCart.js";
import { formatDateTime, formatVnd } from "../../utils/customerFormatters.js";
import dashboard from "../../components/customer/CustomerDashboard.module.css";

const DASHBOARD_STATUS_GROUPS = Object.freeze({
  processing: ["pending", "processing", "awaiting_deposit", "deposited", "awaiting_tracking"],
  purchasing: ["purchasing"],
  shipping: ["shipping", "in_transit", "shipped", "receiving", "waiting_cn_warehouse"],
  complete: ["completed", "delivered"],
  attention: ["complaint"],
});

const workflowStages = [
  { label: "Đã gửi yêu cầu", statuses: [] },
  { label: "Chờ xử lý", statuses: DASHBOARD_STATUS_GROUPS.processing },
  { label: "Đang mua hàng", statuses: DASHBOARD_STATUS_GROUPS.purchasing },
  { label: "Đang vận chuyển", statuses: DASHBOARD_STATUS_GROUPS.shipping },
  { label: "Hoàn tất", statuses: DASHBOARD_STATUS_GROUPS.complete },
];

const countStatuses = (statistics, statuses) => statuses.reduce((sum, status) => sum + Number(statistics?.by_status?.[status] || 0), 0);
const formatCny = (value) => value === null || value === undefined || value === "" ? "Chưa xác định" : `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} CNY`;

function DashboardSkeleton() {
  return <div className={dashboard.skeleton} aria-label="Đang tải dữ liệu đơn hàng"><span /><span /><span /></div>;
}

function StatCard({ label, value, Icon, tone, href, loading, unavailable, trend }) {
  return <a className={`${dashboard.statCard} ${dashboard[`stat_${tone}`]}`} href={href} aria-label={`${label}: ${unavailable ? "không tải được" : loading ? "đang tải" : value}`}>
    <span className={dashboard.statIcon}><Icon aria-hidden="true" /></span>
    <div><small>{label}</small>{loading ? <i className={dashboard.statSkeleton} /> : <strong>{unavailable ? "—" : value}</strong>}{!loading && !unavailable && <Sparkline values={trend} tone={tone} />}</div>
    <Icon className={dashboard.statWatermark} aria-hidden="true" />
  </a>;
}

function RecentOrder({ order, routes }) {
  const items = order.items || [];
  const first = items[0];
  return <article className={dashboard.orderRow}>
    <div className={dashboard.orderProducts}>
      <div className={dashboard.thumbStack}>{items.slice(0, 3).map((item, index) => <ProductThumbnail key={item.id || index} src={item.product_image} alt={item.product_name || order.order_code} size="small" />)}{items.length > 3 && <b>+{items.length - 3}</b>}</div>
      <div><a href={`${routes.orderDetail}?id=${order.id}`}>{order.order_code}</a><strong title={first?.product_name || "Chưa có tên sản phẩm"}>{first?.product_name || "Chưa có tên sản phẩm"}</strong><small>{order.item_count ?? items.length} mặt hàng · {order.quantity ?? items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} sản phẩm</small></div>
    </div>
    <div className={dashboard.orderMeta}><strong>{formatCny(order.product_total_cny)}</strong><small>{formatDateTime(order.created_at)}</small></div>
    <StatusBadge status={order.status} />
    <a className={dashboard.orderDetail} href={`${routes.orderDetail}?id=${order.id}`} aria-label={`Xem chi tiết ${order.order_code}`}><ChevronRight /></a>
  </article>;
}

function CartSummary({ customerId, routes }) {
  const cart = useCustomerCart(customerId);
  const unavailable = Boolean(cart.storageError);
  return <section className={`${dashboard.card} ${dashboard.cartCard}`}>
    <header className={dashboard.cardHeader}><div><span><ShoppingCart /></span><div><h2>Giỏ hàng của bạn</h2><p>Lưu riêng trên trình duyệt này</p></div></div><b>{unavailable ? "—" : cart.totals.itemCount}</b></header>
    {cart.storageError && <p className={dashboard.inlineError} role="alert"><AlertCircle />{cart.storageError}</p>}
    <dl className={dashboard.cartStats}>
      <div><dt>Mặt hàng</dt><dd>{unavailable ? "—" : cart.totals.itemCount}</dd></div>
      <div><dt>Tổng số lượng</dt><dd>{unavailable ? "—" : cart.totals.totalQuantity}</dd></div>
      <div><dt>Tạm tính</dt><dd>{unavailable ? "—" : formatCny(cart.totals.knownTotalCny)}</dd></div>
      <div><dt>Bản nháp đã lưu</dt><dd>{unavailable ? "—" : cart.drafts.length}</dd></div>
    </dl>
    {!unavailable && cart.totals.unknownPriceCount > 0 && <p className={dashboard.cartNote}>{cart.totals.unknownPriceCount} mặt hàng chưa có giá tham khảo nên chưa được tính vào tổng.</p>}
    {!unavailable && cart.totals.itemCount === 0 && <p className={dashboard.cartEmpty}>Giỏ hàng đang trống. Dán link sản phẩm để bắt đầu yêu cầu mua hộ.</p>}
    <div className={dashboard.cartActions}><a href={routes.cart}>Mở giỏ hàng</a><a href={routes.createOrder}>Tiếp tục mua hàng <ArrowRight /></a></div>
  </section>;
}

function Workflow({ order, routes }) {
  if (!order) return <section className={`${dashboard.card} ${dashboard.workflowCard}`}><header className={dashboard.cardHeader}><div><span><Clock3 /></span><div><h2>Theo dõi tiến trình mua hộ</h2><p>Đơn đang hoạt động gần nhất</p></div></div></header><div className={dashboard.compactEmpty}><PackageCheck /><div><strong>Chưa có đơn đang xử lý</strong><p>Khi bạn gửi yêu cầu, tiến trình thực tế sẽ xuất hiện tại đây.</p></div></div></section>;
  const matchedIndex = workflowStages.findIndex((stage) => stage.statuses.includes(order.status));
  const currentIndex = matchedIndex >= 0 ? matchedIndex : 0;
  return <section className={`${dashboard.card} ${dashboard.workflowCard}`}>
    <header className={dashboard.cardHeader}><div><span><Clock3 /></span><div><h2>Theo dõi tiến trình mua hộ</h2><p>Đơn {order.order_code}</p></div></div><a href={`${routes.orderDetail}?id=${order.id}`}>Theo dõi đơn hàng</a></header>
    <ol className={dashboard.workflow}>{workflowStages.map((stage, index) => <li className={index < currentIndex ? dashboard.stageDone : index === currentIndex ? dashboard.stageCurrent : ""} key={stage.label}><span>{index < currentIndex ? <Check /> : index + 1}</span><div><strong>{stage.label}</strong>{index === 0 && <small>{formatDateTime(order.created_at)}</small>}{index === currentIndex && index > 0 && <small>Cập nhật {formatDateTime(order.updated_at)}</small>}</div></li>)}</ol>
  </section>;
}

export default function RealCustomerDashboard({ account, routes }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [months, setMonths] = useState(6);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsRetryKey, setAnalyticsRetryKey] = useState(0);
  const [finance, setFinance] = useState(null);
  const load = useCallback(() => {
    setResult(null);
    setLoading(true);
    setError("");
    setRetryKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    getCustomerOrders({ page: 1, per_page: 5 }).then((data) => { if (active) setResult(data); }).catch((reason) => { if (active) setError(reason?.message || "Không thể tải dữ liệu đơn hàng."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retryKey]);

  useEffect(() => {
    let active = true;
    getCustomerDashboardAnalytics(months).then((data) => { if (active) setAnalytics(data); }).catch((reason) => { if (active) setAnalyticsError(reason?.message || "Không thể tải dữ liệu biểu đồ."); }).finally(() => { if (active) setAnalyticsLoading(false); });
    return () => { active = false; };
  }, [months, analyticsRetryKey]);

  useEffect(() => {
    let active = true;
    getCustomerFinanceSummary().then((data) => { if (active) setFinance(data); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const changeMonths = useCallback((value) => {
    if (value === months) return;
    setAnalytics(null); setAnalyticsError(""); setAnalyticsLoading(true); setMonths(value);
  }, [months]);
  const retryAnalytics = useCallback(() => {
    setAnalytics(null); setAnalyticsError(""); setAnalyticsLoading(true); setAnalyticsRetryKey((value) => value + 1);
  }, []);

  const orders = useMemo(() => result?.orders || [], [result]);
  const statistics = result?.statistics;
  const statsUnavailable = Boolean(error) || (!loading && !statistics);
  const activeOrder = useMemo(() => orders.find((order) => ![...DASHBOARD_STATUS_GROUPS.complete, "cancelled", "canceled", "complaint"].includes(order.status)), [orders]);
  const attentionCount = countStatuses(statistics, DASHBOARD_STATUS_GROUPS.attention);
  const trendFor = (statuses = null) => analytics?.monthly?.map((entry) => statuses ? countStatuses({ by_status: entry.by_status }, statuses) : Number(entry.order_count || 0));
  const statCards = [
    ["Tổng đơn mua hộ", statistics?.total, ShoppingBag, "orange", routes.orders, trendFor()],
    ["Chờ tiếp nhận / xử lý", countStatuses(statistics, DASHBOARD_STATUS_GROUPS.processing), FileClock, "blue", routes.orders, trendFor(DASHBOARD_STATUS_GROUPS.processing)],
    ["Đang mua hàng", countStatuses(statistics, DASHBOARD_STATUS_GROUPS.purchasing), ShoppingCart, "amber", routes.orders, trendFor(DASHBOARD_STATUS_GROUPS.purchasing)],
    ["Đang vận chuyển", countStatuses(statistics, DASHBOARD_STATUS_GROUPS.shipping), Package, "violet", routes.orders, trendFor(DASHBOARD_STATUS_GROUPS.shipping)],
  ];
  const quickActions = [
    ["Tạo yêu cầu mua hộ", "Nhập link Taobao, Tmall hoặc 1688", PackagePlus, routes.createOrder],
    ["Giỏ hàng & bản nháp", "Tiếp tục các sản phẩm đang lưu", ShoppingCart, routes.cart],
    ["Đơn hàng mua hộ", "Theo dõi trạng thái xử lý", ShoppingBag, routes.orders],
    ["Lịch sử đơn hàng", "Tra cứu đơn theo thời gian", History, routes.orderHistory],
  ];

  return <div className={dashboard.dashboard}>
    <section className={dashboard.hero}>
      <div><span className={dashboard.heroEyebrow}>Tổng quan tài khoản</span><h1>Xin chào, {account.name}!</h1><p>Chào mừng bạn trở lại VietTrung Order. Theo dõi đơn mua hộ và quản lý sản phẩm của bạn tại đây.</p><div className={dashboard.accountMeta}><span>Mã khách hàng <strong>{account.customer_code}</strong></span>{account.status && <span>Trạng thái <strong>{account.status === "active" ? "Đang hoạt động" : account.status}</strong></span>}</div></div>
      <div className={dashboard.heroActions}><a href={routes.createOrder}><PackagePlus />Tạo yêu cầu mua hộ</a><a href={routes.cart}><ShoppingCart />Xem giỏ hàng</a></div>
    </section>

    <section className={dashboard.stats} aria-label="Thống kê đơn hàng">{statCards.map(([label, value, Icon, tone, href, trend]) => <StatCard key={label} label={label} value={value} Icon={Icon} tone={tone} href={href} loading={loading && !result} unavailable={statsUnavailable} trend={trend} />)}</section>

    <section className={dashboard.financeStrip} aria-label="Tổng quan tài chính"><span><WalletCards /></span><div><small>Số dư ví</small><strong>{finance ? formatVnd(finance.balance_vnd) : "Đang tải..."}</strong></div><div><small>Công nợ cần thanh toán</small><strong>{finance ? formatVnd(finance.outstanding_vnd) : "Đang tải..."}</strong></div><a href={routes.orderPayments}>Thanh toán đơn hàng <ArrowRight /></a></section>

    <DashboardCharts analytics={analytics} loading={analyticsLoading} error={analyticsError} months={months} onMonthsChange={changeMonths} onRetry={retryAnalytics} />

    <div className={dashboard.primaryGrid}>
      <section className={`${dashboard.card} ${dashboard.ordersCard}`}>
        <header className={dashboard.cardHeader}><div><span><ShoppingBag /></span><div><h2>Đơn hàng gần đây</h2><p>5 yêu cầu mới nhất của tài khoản</p></div></div><a href={routes.orders}>Xem tất cả đơn hàng <ArrowRight /></a></header>
        {loading && !result ? <DashboardSkeleton /> : error ? <div className={dashboard.errorState} role="alert"><AlertCircle /><div><strong>Không thể tải dữ liệu đơn hàng</strong><p>{error}</p><button type="button" onClick={load}><RefreshCw />Thử lại</button></div></div> : orders.length ? <div className={dashboard.orderList}>{orders.map((order) => <RecentOrder key={order.id} order={order} routes={routes} />)}</div> : <div className={dashboard.emptyState}><ShoppingBag /><div><strong>Bạn chưa có đơn hàng mua hộ</strong><p>Tạo yêu cầu đầu tiên từ một sản phẩm Taobao, Tmall hoặc 1688.</p><a href={routes.createOrder}>Tạo yêu cầu đầu tiên</a></div></div>}
      </section>
      <aside className={dashboard.sideColumn}><CartSummary customerId={account.customer_id} routes={routes} /><section className={`${dashboard.card} ${dashboard.quickCard}`}><header className={dashboard.cardHeader}><div><span><PackagePlus /></span><div><h2>Thao tác nhanh</h2><p>Đi đến chức năng bạn cần</p></div></div></header><div className={dashboard.quickActions}>{quickActions.map(([label, description, Icon, href]) => <a href={href} key={label}><span><Icon /></span><div><strong>{label}</strong><small>{description}</small></div><ChevronRight /></a>)}</div></section></aside>
    </div>

    <div className={dashboard.secondaryGrid}><Workflow order={activeOrder} routes={routes} /><section className={`${dashboard.card} ${dashboard.attentionCard}`}><header className={dashboard.cardHeader}><div><span><CircleAlert /></span><div><h2>Cần bạn chú ý</h2><p>Chỉ hiển thị yêu cầu có trạng thái rõ ràng</p></div></div></header>{error || !statistics ? <p className={dashboard.muted}>Chưa thể kiểm tra do dữ liệu đơn hàng chưa tải đầy đủ.</p> : attentionCount > 0 ? <div className={dashboard.attention}><CircleAlert /><div><strong>{attentionCount} đơn đang có khiếu nại</strong><p>Vui lòng mở danh sách đơn để kiểm tra và liên hệ hỗ trợ nếu cần.</p><a href={routes.orders}>Kiểm tra đơn hàng</a></div></div> : <div className={dashboard.attentionClear}><Check /><span>Hiện chưa có yêu cầu nào cần bạn xử lý.</span></div>}<a className={dashboard.supportLink} href="/huong-dan"><Headphones />Mở trung tâm hướng dẫn</a></section></div>
  </div>;
}
