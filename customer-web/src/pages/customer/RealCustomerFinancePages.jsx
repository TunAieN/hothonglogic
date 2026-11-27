import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Calculator, CalendarDays, CheckCircle2, CircleX, Clock3, Copy, CreditCard, Eye, FileText, Filter, History, Info, Layers3, LoaderCircle, PackageCheck, QrCode, RefreshCw, Search, SlidersHorizontal, Tags, Truck, WalletCards } from "lucide-react";
import {
  createCustomerTopupIntent, createVoucherSepayIntent, estimateCustomerPricing,
  getCustomerFinanceSummary, getCustomerPaymentIntent, getCustomerPaymentIntents,
  getCustomerPaymentVouchers, getCustomerPricing, payVoucherFromWallet, payVouchersFromWallet,
} from "../../api/customerPortal.js";
import { EmptyState, LoadingState, Modal, PageHeader } from "../../components/customer/PortalComponents.jsx";
import { formatDateTime, formatVnd } from "../../utils/customerFormatters.js";
import styles from "../../components/customer/CustomerPortal.module.css";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

const idempotencyKey = () => globalThis.crypto?.randomUUID?.() || `portal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const TOPUP_AMOUNTS = [50000, 100000, 200000, 500000, 1000000];
const EMPTY_INTENT_FILTERS = { status: "", type: "", search: "", min_amount: "", max_amount: "" };
const DEFAULT_PAGE_SIZE = 10;
const PAYMENT_POLL_INTERVAL_MS = 8000;
const TERMINAL_PAYMENT_STATES = new Set(["completed", "expired", "failed", "cancelled", "reconciliation_needed", "confirmation_delayed"]);
const VOUCHER_TYPE_META = {
  deposit: ["Đặt cọc", "deposit"], shipping: ["Phí vận chuyển", "shipping"],
  order: ["Thanh toán đơn hàng", "order"], order_payment: ["Thanh toán đơn hàng", "order"],
  surcharge: ["Phí phát sinh", "surcharge"],
};
const voucherTypeMeta = (type) => VOUCHER_TYPE_META[type] || ["Phiếu thanh toán", "other"];
const formatRemaining = (milliseconds) => {
  if (milliseconds === null) return "Đang đồng bộ";
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

const getPaginationItems = (currentPage, lastPage) => {
  if (lastPage <= 7) return Array.from({ length: lastPage }, (_, index) => index + 1);
  const pages = new Set([1, lastPage, currentPage - 1, currentPage, currentPage + 1]);
  const visible = [...pages].filter((page) => page >= 1 && page <= lastPage).sort((a, b) => a - b);
  return visible.flatMap((page, index) => index > 0 && page - visible[index - 1] > 1 ? [`gap-${page}`, page] : [page]);
};

function ErrorMessage({ message, retry }) {
  return message ? <p className={feature.error} role="alert">{message} {retry && <button type="button" className={feature.ghost} onClick={retry}><RefreshCw /> Thử lại</button>}</p> : null;
}

function CopyValue({ label, value, compact = false }) {
  const [result, setResult] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      setResult("Đã sao chép");
    } catch {
      setResult("Không thể sao chép");
    }
  };
  return <span className={`${feature.copyValue} ${compact ? feature.copyValueCompact : ""}`}><button type="button" onClick={copy} aria-label={`Sao chép ${label}`} title={`Sao chép ${label}`}><Copy />{compact ? null : (result || "Sao chép")}</button>{result && <small role="status">{result}</small>}</span>;
}

export function PaymentQr({ intent, voucher = null, onCompleted, onUpdated, webhookEnabled = false }) {
  const [current, setCurrent] = useState(intent);
  const [pollNotice, setPollNotice] = useState("");
  const [remainingMs, setRemainingMs] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const completionReported = useRef(false);
  useEffect(() => {
    if (!current?.expires_at || current.status !== "pending") return undefined;
    let interval = null;
    const tick = () => {
      const remaining = Math.max(0, new Date(current.expires_at).getTime() - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0) {
        if (interval) window.clearInterval(interval);
      }
    };
    const initial = window.setTimeout(tick, 0);
    interval = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(initial); if (interval) window.clearInterval(interval); };
  }, [current?.expires_at, current?.status]);
  useEffect(() => {
    if (!intent?.reference || intent.status !== "pending") return undefined;
    let disposed = false;
    let timer = null;
    let controller = null;
    const schedule = (delay = PAYMENT_POLL_INTERVAL_MS) => {
      if (!disposed) timer = window.setTimeout(poll, delay);
    };
    const poll = async () => {
      if (document.visibilityState === "hidden") { schedule(); return; }
      controller = new AbortController();
      try {
        const { intent: next } = await getCustomerPaymentIntent(intent.reference, { signal: controller.signal });
        if (disposed) return;
        setCurrent(next);
        onUpdated?.(next);
        setPollNotice("");
        const state = next.display_status || next.status;
        if (next.status === "completed" && !completionReported.current) {
          completionReported.current = true;
          onCompleted?.(next);
        }
        if (!TERMINAL_PAYMENT_STATES.has(state) && next.status === "pending") schedule();
      } catch (reason) {
        if (disposed || reason?.name === "AbortError") return;
        const retryDelay = reason?.status === 429 && reason.retryAfter
          ? Math.max(PAYMENT_POLL_INTERVAL_MS, reason.retryAfter * 1000)
          : PAYMENT_POLL_INTERVAL_MS;
        setPollNotice(reason?.status === 429 ? "Tạm dừng kiểm tra trạng thái do giới hạn truy cập." : "Chưa thể cập nhật trạng thái. Hệ thống sẽ thử lại sau.");
        schedule(retryDelay);
      }
    };
    schedule(refreshNonce ? 0 : PAYMENT_POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [intent?.reference, intent?.status, onCompleted, onUpdated, refreshNonce]);
  if (!current) return null;
  const displayStatus = current.display_status || current.status;
  const status = {
    pending: { label: "Đang chờ thanh toán", tone: "pending", icon: Clock3 },
    completed: { label: "Đã hoàn tất", tone: "success", icon: CheckCircle2 },
    expired: { label: "QR đã hết hạn", tone: "muted", icon: Clock3 },
    failed: { label: "Thanh toán thất bại", tone: "danger", icon: AlertCircle },
    cancelled: { label: "QR đã được thay thế", tone: "muted", icon: AlertCircle },
    reconciliation_needed: { label: "Đang cần đối soát", tone: "warning", icon: AlertCircle },
    confirmation_delayed: { label: "Chưa thể xác nhận", tone: "warning", icon: Clock3 },
  }[displayStatus] || { label: "Chưa thể xác nhận", tone: "warning", icon: AlertCircle };
  const StatusIcon = status.icon;
  const showPayableQr = displayStatus === "pending" && Boolean(current.qr_url);
  const details = [
    ...(voucher ? [
      { label: "Mã phiếu", value: voucher.code, copy: voucher.code },
      { label: "Loại hóa đơn", value: voucherTypeMeta(voucher.type)[0] },
    ] : []),
    { label: "Mã giao dịch", value: current.reference, copy: current.reference },
    { label: "Số tiền", value: formatVnd(current.amount_vnd), copy: current.amount_vnd, accent: true },
    { label: "Ngân hàng", value: current.bank?.name || "—", copy: current.bank?.name },
    { label: "Số tài khoản", value: current.bank?.account_number || "—", copy: current.bank?.account_number },
    { label: "Chủ tài khoản", value: current.bank?.account_holder || "—", copy: current.bank?.account_holder },
    { label: "Nội dung chuyển khoản", value: current.reference, copy: current.reference },
    { label: "Thời gian tạo", value: formatDateTime(current.created_at) },
  ];
  const waitingNotice = current.type === "wallet_topup"
    ? "Yêu cầu nạp ví sẽ được giữ ở trạng thái chờ cho đến khi hệ thống xác nhận thanh toán thành công hoặc mã QR hết thời gian hiển thị. Giao dịch đến muộn vẫn được backend đối soát theo quy trình hiện hành."
    : "Đơn hàng sẽ được giữ ở trạng thái chờ giao dịch cho đến khi hệ thống xác nhận thanh toán thành công hoặc mã QR hết thời gian hiển thị. Giao dịch đến muộn vẫn được backend đối soát theo quy trình hiện hành.";
  return <section className={feature.walletQrCard} aria-live="polite" data-status={status.tone}>
    <div className={feature.qrPaymentGrid}>
      <article className={feature.qrVisual}>
        <header className={feature.qrPanelTitle}><span><QrCode /></span><h3>Mã QR thanh toán</h3></header>
        <div className={feature.qrImageFrame}>{showPayableQr ? <img src={current.qr_url} alt={`QR thanh toán ${current.reference}`} /> : <div className={feature.qrUnavailable}>{displayStatus === "completed" ? <CheckCircle2 /> : <QrCode />}<span>{displayStatus === "completed" ? "Giao dịch đã hoàn tất" : "QR không còn hiệu lực"}</span></div>}</div>
        <div className={feature.qrBankCaption}><strong>{current.bank?.account_holder || "VietTrung Order"}</strong><span>{current.bank?.account_number || "—"}</span><small>{formatVnd(current.amount_vnd)}</small></div>
        <p className={feature.qrScanHint}>{showPayableQr ? "Sử dụng ứng dụng ngân hàng để quét mã QR" : displayStatus === "completed" ? (current.type === "wallet_topup" ? "Khoản nạp đã được backend xác nhận." : "Hóa đơn đã được backend xác nhận thanh toán.") : "QR đã hết thời gian hiển thị; hệ thống vẫn tiếp tục đối soát giao dịch đến muộn."}</p>
      </article>
      <article className={feature.qrTransfer}>
        <header className={feature.qrPanelTitle}><span><FileText /></span><h3>Thông tin giao dịch</h3></header>
        <div className={feature.qrStatusLine}><span>Trạng thái:</span><strong className={`${feature.qrStatusHero} ${feature[`qrStatusHero_${status.tone}`]}`}><StatusIcon />{status.label}</strong></div>
        <div className={feature.qrCountdown}><Clock3 /><span>{displayStatus === "pending" ? "Thời gian còn lại" : current.expires_at ? "Thời điểm hết hạn" : "Thời hạn"}</span><strong>{displayStatus === "pending" ? formatRemaining(remainingMs) : current.expires_at ? formatDateTime(current.expires_at) : "—"}</strong><button type="button" onClick={() => setRefreshNonce((value) => value + 1)} aria-label="Làm mới trạng thái"><RefreshCw /></button></div>
        {pollNotice && <p className={feature.qrPollNotice}>{pollNotice}</p>}
        <dl className={feature.qrVoucherDetails}>{details.map(({ label, value, copy, accent }) => <div key={label}><dt>{label}</dt><dd className={accent ? feature.transferAccent : ""}>{value}</dd>{copy !== undefined && copy !== null && copy !== "" ? <CopyValue compact label={label.toLowerCase()} value={copy} /> : <span aria-hidden="true" />}</div>)}</dl>
      </article>
    </div>
    <aside className={`${feature.qrHoldNotice} ${!webhookEnabled ? feature.qrHoldNoticeDisabled : ""}`}><Info /><p><strong>{webhookEnabled ? "Lưu ý:" : "Kênh xác nhận tự động đang tạm tắt:"}</strong> {webhookEnabled ? waitingNotice : "Không chuyển khoản bằng QR này cho đến khi VietTrung Order thông báo kênh xác nhận đã được bật."}</p></aside>
    <section className={feature.qrGuide}><header><Info /><h3>Hướng dẫn thanh toán</h3></header><ol><li><b>1</b><span>Mở ứng dụng ngân hàng trên điện thoại.</span></li><li><b>2</b><span>Chọn “Quét mã QR” hoặc “Chuyển khoản”.</span></li><li><b>3</b><span>Kiểm tra thông tin và xác nhận thanh toán.</span></li><li><b>4</b><span>Theo dõi trạng thái trên VietTrung Order.</span></li></ol></section>
  </section>;
}

function VoucherPaymentChoice({ action, summary, method, setMethod, busy, intent, onWalletPay, onBankPay, onBack, onCompleted, onUpdated }) {
  const voucher = action.voucher;
  const amount = Number(voucher.remaining_vnd) || 0;
  const balance = Number(summary?.balance_vnd) || 0;
  const shortage = Math.max(0, amount - balance);
  const bankEnabled = summary?.sepay_available === true && summary?.sepay_webhook_enabled === true
    && (voucher.type === "deposit" ? summary?.deposit_auto_confirmation_enabled === true : summary?.direct_voucher_payment_enabled === true);
  if (intent) return <div className={feature.voucherPaymentFlow}><button type="button" className={feature.paymentBack} onClick={onBack}><ArrowLeft /> Chọn phương thức khác</button><PaymentQr intent={intent} voucher={voucher} onCompleted={onCompleted} onUpdated={onUpdated} webhookEnabled={summary?.sepay_webhook_enabled === true} /></div>;
  return <div className={feature.voucherPaymentFlow}>
    <section className={feature.paymentVoucherSummary}><div><small>Mã phiếu</small><strong>{voucher.code}</strong></div><div><small>Loại hóa đơn</small><strong>{voucherTypeMeta(voucher.type)[0]}</strong></div><div><small>Số tiền cần thanh toán</small><strong>{formatVnd(amount)}</strong></div></section>
    <div className={feature.paymentMethodCards} role="radiogroup" aria-label="Phương thức thanh toán"><button type="button" role="radio" aria-checked={method === "wallet"} data-active={method === "wallet"} onClick={() => setMethod("wallet")}><span><WalletCards /></span><div><strong>Ví VietTrung</strong><small>Thanh toán ngay từ số dư khả dụng</small></div></button><button type="button" role="radio" aria-checked={method === "bank"} data-active={method === "bank"} onClick={() => setMethod("bank")}><span><QrCode /></span><div><strong>Chuyển khoản VietQR</strong><small>SePay tự động đối soát khi tiền đến</small></div></button></div>
    {method === "wallet" ? <section className={feature.paymentMethodPanel}><header><WalletCards /><div><strong>Thanh toán bằng số dư</strong><small>Backend sẽ kiểm tra lại số dư và trạng thái phiếu.</small></div></header><dl><div><dt>Số dư hiện tại</dt><dd>{formatVnd(balance)}</dd></div><div><dt>Số dư sau thanh toán</dt><dd>{balance >= amount ? formatVnd(balance - amount) : "Không đủ số dư"}</dd></div></dl>{shortage > 0 && <p className={feature.paymentShortage}><AlertCircle /> Ví còn thiếu {formatVnd(shortage)}. Bạn có thể chuyển sang VietQR mà không cần nạp ví.</p>}<button type="button" className={feature.primary} disabled={Boolean(busy) || shortage > 0} onClick={onWalletPay}>{busy ? "Đang thanh toán..." : "Xác nhận thanh toán bằng ví"}</button></section> : <section className={feature.paymentMethodPanel}><header><QrCode /><div><strong>Thanh toán trực tiếp qua ngân hàng</strong><small>Không nạp ví; QR gắn với đúng phiếu này.</small></div></header>{bankEnabled ? <><dl><div><dt>Ngân hàng nhận</dt><dd>{summary?.payment_account?.bank_name || "—"}</dd></div><div><dt>Chủ tài khoản</dt><dd>{summary?.payment_account?.account_holder || "—"}</dd></div></dl><p className={feature.paymentBankNotice}><Info /> Chỉ chuyển đúng số tiền và nội dung do backend tạo.</p><button type="button" className={feature.primary} disabled={Boolean(busy)} onClick={onBankPay}>{busy ? "Đang tạo VietQR..." : "Tiếp tục tạo mã VietQR"}</button></> : <p className={feature.paymentShortage}><AlertCircle /> Thanh toán trực tiếp qua ngân hàng đang tạm tắt.</p>}</section>}
  </div>;
}

export function RealWalletPage() {
  const [summary, setSummary] = useState(null); const [intents, setIntents] = useState([]); const [error, setError] = useState("");
  const [successNotice, setSuccessNotice] = useState(null);
  const [amount, setAmount] = useState("100000"); const [busy, setBusy] = useState(false); const [selectedIntent, setSelectedIntent] = useState(null); const [retryUntil, setRetryUntil] = useState(0);
  const [topupOpen, setTopupOpen] = useState(() => new URLSearchParams(window.location.search).get("nap-tien") === "1"); const [qrOpen, setQrOpen] = useState(false); const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_INTENT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_INTENT_FILTERS);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0, per_page: DEFAULT_PAGE_SIZE });
  const createLock = useRef(false); const requestState = useRef(null); const listRequestId = useRef(0); const completedIntents = useRef(new Set());
  const loadTransactions = useCallback(async ({ intentFilters, page, perPage }) => {
    const requestId = ++listRequestId.current;
    setLoading(true);
    setError("");
    try {
      let payments = await getCustomerPaymentIntents({ ...intentFilters, page, per_page: perPage });
      if (requestId !== listRequestId.current) return null;
      const firstMeta = payments.meta || {};
      const lastPage = Math.max(1, Number(firstMeta.last_page) || 1);
      if (page > lastPage) {
        payments = await getCustomerPaymentIntents({ ...intentFilters, page: lastPage, per_page: perPage });
        if (requestId !== listRequestId.current) return null;
      }
      const meta = payments.meta || {};
      const nextPagination = {
        current_page: Math.max(1, Number(meta.current_page) || Math.min(page, lastPage)),
        last_page: Math.max(1, Number(meta.last_page) || lastPage),
        total: Math.max(0, Number(meta.total) || 0),
        per_page: perPage,
      };
      setIntents(payments.data || []);
      setPagination(nextPagination);
      return nextPagination;
    } catch (reason) {
      if (requestId === listRequestId.current) setError(reason.message || "Không thể tải dữ liệu ví.");
      return null;
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, []);
  const loadSummary = useCallback(async () => {
    try {
      const nextSummary = await getCustomerFinanceSummary();
      setSummary(nextSummary);
      return nextSummary;
    } catch (reason) {
      setError(reason.message || "Không thể tải dữ liệu ví.");
      return null;
    }
  }, []);
  useEffect(() => {
    let active = true;
    const requestId = ++listRequestId.current;
    Promise.all([
      getCustomerFinanceSummary(),
      getCustomerPaymentIntents({ ...EMPTY_INTENT_FILTERS, page: 1, per_page: DEFAULT_PAGE_SIZE }),
    ]).then(([nextSummary, payments]) => {
      if (!active || requestId !== listRequestId.current) return;
      const meta = payments.meta || {};
      setSummary(nextSummary);
      setIntents(payments.data || []);
      setPagination({
        current_page: Math.max(1, Number(meta.current_page) || 1),
        last_page: Math.max(1, Number(meta.last_page) || 1),
        total: Math.max(0, Number(meta.total) || 0),
        per_page: DEFAULT_PAGE_SIZE,
      });
      setLoading(false);
    }).catch((reason) => {
      if (!active || requestId !== listRequestId.current) return;
      setError(reason.message || "Không thể tải dữ liệu ví.");
      setLoading(false);
    });
    return () => { active = false; listRequestId.current += 1; };
  }, []);
  useEffect(() => {
    if (!retryUntil) return undefined;
    const remaining = retryUntil - Date.now();
    if (remaining <= 0) return undefined;
    const timer = window.setTimeout(() => setRetryUntil(0), remaining);
    return () => window.clearTimeout(timer);
  }, [retryUntil]);
  useEffect(() => {
    if (!successNotice) return undefined;
    const timer = window.setTimeout(() => setSuccessNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [successNotice]);
  const chooseAmount = (value) => {
    setAmount(String(value));
    if (requestState.current?.amount !== Number(value)) requestState.current = null;
    setError("");
  };
  const createIntent = async (event) => {
    event.preventDefault();
    const normalizedAmount = Number(amount);
    if (createLock.current || retryUntil > Date.now()) return;
    const existing = intents.find((item) => item.display_status === "pending" && Number(item.amount_vnd) === normalizedAmount);
    if (existing) {
      setSelectedIntent(existing); setTopupOpen(false); setQrOpen(true);
      return;
    }
    createLock.current = true;
    setBusy(true);
    setError("");
    if (!requestState.current || requestState.current.amount !== normalizedAmount || requestState.current.succeeded) {
      requestState.current = { amount: normalizedAmount, key: idempotencyKey(), succeeded: false };
    }
    try {
      const result = await createCustomerTopupIntent({ amount_vnd: normalizedAmount, idempotency_key: requestState.current.key });
      requestState.current.succeeded = true;
      setSelectedIntent(result.intent); setTopupOpen(false); setQrOpen(true);
      await loadTransactions({ intentFilters: appliedFilters, page: 1, perPage: pagination.per_page });
    } catch (reason) {
      if (reason?.status === 429) {
        const delay = Math.max(1, reason.retryAfter || 60);
        setRetryUntil(Date.now() + delay * 1000);
        setError(`Bạn thao tác quá nhanh. Việc tạo QR được tạm dừng ${delay} giây và sẽ không tự gửi lại.`);
      } else {
        setError(reason.message || "Không thể tạo mã QR.");
      }
    } finally {
      createLock.current = false;
      setBusy(false);
    }
  };
  const coolingDown = retryUntil > 0;
  const rules = summary?.topup_rules || { min_vnd: 1000, max_vnd: 999999999999, step_vnd: 1000 };
  const quickAmounts = TOPUP_AMOUNTS.filter((value) => value >= rules.min_vnd && value <= rules.max_vnd && value % rules.step_vnd === 0);
  const statusMeta = (item) => ({
    pending: ["Đang chờ", "pending"], completed: ["Thành công", "success"], expired: ["Hết hạn", "expired"],
    failed: ["Thất bại", "failed"], cancelled: ["Đã thay thế", "expired"], reconciliation_needed: ["Cần đối soát", "warning"], confirmation_delayed: ["Chờ xác nhận", "warning"],
  }[item.display_status || item.status] || ["Chưa xác định", "warning"]);
  const typeLabel = (item) => ({ wallet_topup: "Nạp tiền", voucher_payment: "Thanh toán phiếu", wallet_voucher_payment: "Thanh toán từ ví" }[item.type] || "Giao dịch");
  const submitFilters = async (event) => { event.preventDefault(); const next = { ...filters }; setAppliedFilters(next); await loadTransactions({ intentFilters: next, page: 1, perPage: pagination.per_page }); };
  const clearFilters = async () => { const empty = { ...EMPTY_INTENT_FILTERS }; setFilters(empty); setAppliedFilters(empty); await loadTransactions({ intentFilters: empty, page: 1, perPage: pagination.per_page }); };
  const changePage = async (page) => {
    if (loading || page < 1 || page > pagination.last_page || page === pagination.current_page) return;
    await loadTransactions({ intentFilters: appliedFilters, page, perPage: pagination.per_page });
  };
  const changePageSize = async (event) => {
    const perPage = Number(event.target.value);
    await loadTransactions({ intentFilters: appliedFilters, page: 1, perPage });
  };
  const refreshTransactions = useCallback(() => loadTransactions({
    intentFilters: appliedFilters,
    page: pagination.current_page,
    perPage: pagination.per_page,
  }), [appliedFilters, loadTransactions, pagination.current_page, pagination.per_page]);
  const refreshWalletData = useCallback(async () => {
    const [nextSummary, nextPagination] = await Promise.all([loadSummary(), refreshTransactions()]);
    if (!nextSummary || !nextPagination) {
      setError("Giao dịch đã hoàn tất nhưng chưa thể làm mới đầy đủ số dư và lịch sử. Vui lòng thử lại.");
      return false;
    }
    return true;
  }, [loadSummary, refreshTransactions]);
  const handlePaymentCompleted = useCallback((completedIntent) => {
    if (!completedIntent?.reference || completedIntent.status !== "completed" || completedIntents.current.has(completedIntent.reference)) return;
    completedIntents.current.add(completedIntent.reference);
    setSelectedIntent(completedIntent);
    setIntents((rows) => rows.map((row) => row.reference === completedIntent.reference ? completedIntent : row));
    setQrOpen(false);
    setSuccessNotice({ reference: completedIntent.reference, amount_vnd: Number(completedIntent.amount_vnd), type: completedIntent.type });
    refreshWalletData();
  }, [refreshWalletData]);
  const openIntent = (item) => { setSelectedIntent(item); setQrOpen(true); };
  const updateSelectedIntent = useCallback((next) => {
    setSelectedIntent(next);
    setIntents((rows) => rows.map((row) => row.reference === next.reference ? next : row));
  }, []);
  const startAgain = (item) => { chooseAmount(item?.amount_vnd || 100000); setQrOpen(false); setTopupOpen(true); };
  const rangeStart = pagination.total ? (pagination.current_page - 1) * pagination.per_page + 1 : 0;
  const rangeEnd = Math.min(pagination.current_page * pagination.per_page, pagination.total);
  const pageItems = getPaginationItems(pagination.current_page, pagination.last_page);
  return <>
    {successNotice && <div className={feature.walletSuccessToast} role="status" aria-live="polite"><CheckCircle2 /><p><strong>{successNotice.type === "wallet_topup" ? "Nạp tiền thành công" : "Giao dịch thành công"}</strong> — {formatVnd(successNotice.amount_vnd)} {successNotice.type === "wallet_topup" ? "đã được ghi nhận vào ví" : "đã được backend xác nhận"}.</p></div>}
    <PageHeader title="Ví giao dịch" description="Quản lý nạp tiền và lịch sử giao dịch." icon={WalletCards} action={<button type="button" className={feature.walletPrimaryAction} onClick={() => setTopupOpen(true)}><WalletCards /> Nạp tiền</button>} />
    <div className={styles.walletHero}><section className={styles.walletBalance}><WalletCards /><small>Số dư khả dụng</small><strong>{formatVnd(summary?.balance_vnd)}</strong><footer><span>Cập nhật từ sổ cái tài chính</span></footer></section><section className={styles.summaryCard}><CreditCard /><h2>Công nợ cần thanh toán</h2><div className={styles.summaryRows}><div><span>Tổng còn phải trả</span><strong>{formatVnd(summary?.outstanding_vnd)}</strong></div></div></section></div>
    <ErrorMessage message={topupOpen ? "" : error} retry={refreshWalletData} />
    <section className={feature.walletFlow}><div><Info /><span><strong>Luồng xử lý giao dịch qua QR</strong><small>QR tồn tại đến thời hạn thực tế do backend cung cấp.</small></span></div><ArrowRight /><div><Clock3 /><span><strong>Đang chờ giao dịch</strong><small>Đóng modal không hủy hoặc làm mới thời hạn.</small></span></div><ArrowRight /><div><AlertCircle /><span><strong>Thành công hoặc hết hạn</strong><small>Backend và ledger quyết định trạng thái cuối cùng.</small></span></div></section>
    <form className={feature.walletFilters} onSubmit={submitFilters}><header><div><SlidersHorizontal /><span><strong>Tìm kiếm giao dịch</strong><small>Lọc payment intent thuộc tài khoản của bạn</small></span></div><div><button type="button" onClick={clearFilters}><RefreshCw /> Xóa bộ lọc</button><button type="submit"><Filter /> Áp dụng</button></div></header><div className={feature.walletFilterGrid}><label><span>Trạng thái</span><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Tất cả</option><option value="pending">Đang chờ</option><option value="completed">Thành công</option><option value="expired">Hết hạn</option><option value="failed">Thất bại</option><option value="reconciliation_needed">Cần đối soát</option></select></label><label><span>Loại giao dịch</span><select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Tất cả</option><option value="wallet_topup">Nạp tiền</option><option value="voucher_payment">Thanh toán phiếu</option><option value="wallet_voucher_payment">Thanh toán từ ví</option></select></label><label><span>Mã giao dịch</span><div><Search /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Nhập mã tham chiếu" /></div></label><label><span>Số tiền từ</span><input type="number" min="0" value={filters.min_amount} onChange={(event) => setFilters({ ...filters, min_amount: event.target.value })} placeholder="Từ..." /></label><label><span>Số tiền đến</span><input type="number" min="0" value={filters.max_amount} onChange={(event) => setFilters({ ...filters, max_amount: event.target.value })} placeholder="Đến..." /></label></div></form>
    <section className={feature.walletTransactions}>
      <header><div><History /><span><strong>Ví giao dịch</strong><small>{pagination.total} giao dịch trong kết quả hiện tại</small></span></div><button type="button" onClick={refreshTransactions} disabled={loading}><RefreshCw /> Làm mới</button></header>
      {loading && !intents.length ? <LoadingState /> : intents.length ? <>
        <div className={`${feature.walletTableWrap} ${loading ? feature.walletTableLoading : ""}`} aria-busy={loading}>
          {loading && <span className={feature.walletLoadingNotice} role="status"><LoaderCircle className={feature.spin} /> Đang tải trang...</span>}
          <table><thead><tr><th>Loại</th><th>Mã giao dịch</th><th>Số tiền</th><th>Phí</th><th>Trạng thái</th><th>Phương thức</th><th>Ghi chú</th><th>Thời gian</th><th>Thao tác</th></tr></thead><tbody>{intents.map((item) => { const [label, tone] = statusMeta(item); return <tr key={item.reference}><td><span className={feature.transactionType}>{typeLabel(item)}</span></td><td><code>{item.reference}</code></td><td><strong>{formatVnd(item.amount_vnd)}</strong></td><td>—</td><td><span className={`${feature.transactionStatus} ${feature[`transactionStatus_${tone}`]}`}>{label}</span></td><td>VietQR {item.bank?.code ? `(${item.bank.code})` : ""}</td><td>{tone === "expired" ? "QR đã hết hạn" : tone === "success" ? "Đã xác nhận thanh toán" : tone === "warning" ? "Giao dịch cần kiểm tra" : "Yêu cầu nạp tiền"}</td><td>{formatDateTime(item.created_at)}</td><td><div className={feature.transactionActions}><button type="button" onClick={() => openIntent(item)}><Eye /> {tone === "pending" ? "Mở QR" : "Chi tiết"}</button>{tone === "expired" && <button type="button" onClick={() => startAgain(item)}><RefreshCw /> Tạo mới</button>}</div></td></tr>; })}</tbody></table>
        </div>
        <footer className={feature.walletPagination}>
          <span>Hiển thị {rangeStart}–{rangeEnd} trong tổng số {pagination.total} giao dịch</span>
          <div className={feature.walletPageButtons}>
            <button type="button" onClick={() => changePage(pagination.current_page - 1)} disabled={loading || pagination.current_page === 1}>Trước</button>
            {pageItems.map((item) => typeof item === "string" ? <span key={item} className={feature.walletPageGap}>…</span> : <button type="button" key={item} aria-label={`Trang ${item}`} aria-current={item === pagination.current_page ? "page" : undefined} className={item === pagination.current_page ? feature.walletActivePage : ""} onClick={() => changePage(item)} disabled={loading || item === pagination.current_page}>{item}</button>)}
            <button type="button" onClick={() => changePage(pagination.current_page + 1)} disabled={loading || pagination.current_page === pagination.last_page}>Sau</button>
          </div>
          <label className={feature.walletPageSize}>Số dòng <select aria-label="Số dòng mỗi trang" value={pagination.per_page} onChange={changePageSize} disabled={loading}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label>
        </footer>
      </> : <EmptyState title="Chưa có giao dịch" description="Không tìm thấy payment intent phù hợp với bộ lọc." />}
    </section>
    <Modal open={topupOpen} onClose={() => { if (!busy) setTopupOpen(false); }} title="Nạp tiền" description="Chuyển khoản ngân hàng qua SePay/VietQR" className={feature.topupModal}><form onSubmit={createIntent} className={feature.topupModalForm}><section className={feature.paymentMethod}><CreditCard /><span><strong>Chuyển khoản ngân hàng (SePay)</strong><small>{summary?.payment_account ? `${summary.payment_account.bank_name} (${summary.payment_account.bank_code})` : "Tài khoản nhận tiền đang được kiểm tra"}</small></span></section><label className={feature.modalAmount}><span>Số tiền nạp</span><div><input type="number" required min={rules.min_vnd} max={rules.max_vnd} step={rules.step_vnd} value={amount} onChange={(event) => chooseAmount(event.target.value)} /><b>VND</b></div></label><div className={feature.modalQuickAmounts}>{quickAmounts.map((value) => <button type="button" key={value} onClick={() => chooseAmount(value)} className={Number(amount) === value ? feature.active : ""}>{formatVnd(value)}</button>)}</div><aside className={feature.modalGuidance}><Info /><div><strong>Hướng dẫn thanh toán</strong><p>Số tiền hợp lệ từ {formatVnd(rules.min_vnd)} đến {formatVnd(rules.max_vnd)}, theo bước {formatVnd(rules.step_vnd)}. Chỉ tạo QR khi bạn nhấn tiếp tục.</p></div></aside>{!summary?.sepay_webhook_enabled && <aside className={feature.modalWarning}><AlertCircle /><div><strong>Kênh xác nhận tự động đang tạm tắt</strong><p>Chỉ chuẩn bị QR để kiểm thử; không chuyển khoản cho đến khi hệ thống thông báo đã bật.</p></div></aside>}<ErrorMessage message={error} /><button className={feature.modalSubmit} disabled={busy || coolingDown || !summary?.sepay_available}>{busy ? <LoaderCircle className={feature.spin} /> : <QrCode />}{busy ? "Đang tạo mã QR..." : coolingDown ? "Vui lòng chờ" : "Tiếp tục tạo mã QR"}</button></form></Modal>
    <Modal open={qrOpen} onClose={() => setQrOpen(false)} title="Thanh toán" description="Quét mã QR để hoàn tất thanh toán" className={feature.paymentModal} icon={WalletCards}>{selectedIntent && <div className={feature.paymentModalBody}><PaymentQr key={selectedIntent.reference} intent={selectedIntent} onCompleted={handlePaymentCompleted} onUpdated={updateSelectedIntent} webhookEnabled={summary?.sepay_webhook_enabled === true} />{selectedIntent.display_status === "expired" && <button type="button" className={feature.modalSubmit} onClick={() => startAgain(selectedIntent)}><RefreshCw /> Tạo yêu cầu nạp tiền mới</button>}</div>}</Modal>
  </>;
}

export function RealOrderPaymentsPage() {
  const [summary, setSummary] = useState(null); const [vouchers, setVouchers] = useState([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(null); const [intent, setIntent] = useState(null); const [paymentAction, setPaymentAction] = useState(null); const [paymentMethod, setPaymentMethod] = useState("wallet");
  const [filters, setFilters] = useState({ tab: "all", search: "", type: "", status: "", from: "", to: "" });
  const [selected, setSelected] = useState([]); const [page, setPage] = useState(1); const [perPage, setPerPage] = useState(10); const [checkout, setCheckout] = useState(null); const [detail, setDetail] = useState(null);
  const [referenceTime] = useState(() => Date.now());
  const load = useCallback(async () => { await Promise.resolve(); setError(""); try { const [s, v] = await Promise.all([getCustomerFinanceSummary(), getCustomerPaymentVouchers({ per_page: 100 })]); setSummary(s); setVouchers(v.data); } catch (reason) { setError(reason.message || "Không thể tải phiếu thanh toán."); } }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);
  const openPayment = (voucher) => { setIntent(null); setPaymentMethod("wallet"); setPaymentAction({ voucher, idempotencyKey: idempotencyKey() }); };
  const walletPay = async () => { const action = paymentAction; if (!action) return; setBusy(`wallet-${action.voucher.id}`); setError(""); try { await payVoucherFromWallet(action.voucher.id, { idempotency_key: action.idempotencyKey }); setPaymentAction(null); setIntent(null); await load(); } catch (reason) { setError(reason.message); } finally { setBusy(null); } };
  const sepayPay = async () => { const action = paymentAction; if (!action) return; setBusy(`sepay-${action.voucher.id}`); setError(""); try { const result = await createVoucherSepayIntent(action.voucher.id, { idempotency_key: action.idempotencyKey }); setIntent(result.intent); } catch (reason) { setError(reason.message); } finally { setBusy(null); } };
  const isExpired = (voucher) => voucher.status !== "paid" && voucher.status !== "cancelled" && voucher.expires_at && new Date(voucher.expires_at).getTime() <= referenceTime;
  const isEligible = (voucher) => ["waiting_payment", "partial_paid"].includes(voucher.status) && !isExpired(voucher) && Number(voucher.remaining_vnd) > 0;
  const statusKey = (voucher) => isExpired(voucher) ? "expired" : voucher.status;
  const typeMeta = (type) => ({ deposit: ["Đặt cọc", "deposit"], shipping: ["Phí vận chuyển", "shipping"], order: ["Thanh toán đơn hàng", "order"], order_payment: ["Thanh toán đơn hàng", "order"], surcharge: ["Phí phát sinh", "surcharge"] }[type] || [type || "Loại khác", "other"]);
  const statusMeta = (voucher) => ({ waiting_payment: ["Chờ thanh toán", "pending"], partial_paid: ["Thanh toán một phần", "pending"], paid: ["Đã thanh toán", "success"], cancelled: ["Đã hủy", "cancelled"], expired: ["Hết hạn", "expired"], draft: ["Bản nháp", "muted"] }[statusKey(voucher)] || [voucher.status, "muted"]);
  const last30 = referenceTime - 30 * 24 * 60 * 60 * 1000;
  const stats = vouchers.reduce((acc, voucher) => { const key = statusKey(voucher); const amount = Number(voucher.remaining_vnd) || 0; if (["waiting_payment", "partial_paid"].includes(key)) { acc.pendingCount += 1; acc.pending += amount; } if (key === "paid" && voucher.paid_at && new Date(voucher.paid_at).getTime() >= last30) { acc.paidCount += 1; acc.paid += Number(voucher.paid_vnd) || Number(voucher.total_vnd) || 0; } if (["expired", "cancelled"].includes(key)) { acc.closedCount += 1; acc.closed += amount; } return acc; }, { pending: 0, pendingCount: 0, paid: 0, paidCount: 0, closed: 0, closedCount: 0 });
  const counts = vouchers.reduce((acc, voucher) => { const key = statusKey(voucher); acc.all += 1; if (["waiting_payment", "partial_paid"].includes(key)) acc.pending += 1; if (key === "paid") acc.paid += 1; if (key === "expired") acc.expired += 1; if (key === "cancelled") acc.cancelled += 1; return acc; }, { all: 0, pending: 0, paid: 0, expired: 0, cancelled: 0 });
  const filtered = vouchers.filter((voucher) => {
    const key = statusKey(voucher); const query = filters.search.trim().toLocaleLowerCase("vi");
    const tabMatches = filters.tab === "all" || (filters.tab === "pending" ? ["waiting_payment", "partial_paid"].includes(key) : key === filters.tab);
    const statusMatches = !filters.status || (filters.status === "pending" ? ["waiting_payment", "partial_paid"].includes(key) : key === filters.status);
    const searchMatches = !query || [voucher.code, voucher.order_code, voucher.content].some((value) => String(value || "").toLocaleLowerCase("vi").includes(query));
    const created = voucher.created_at ? new Date(voucher.created_at) : null;
    return tabMatches && statusMatches && (!filters.type || voucher.type === filters.type) && searchMatches && (!filters.from || (created && created >= new Date(`${filters.from}T00:00:00`))) && (!filters.to || (created && created <= new Date(`${filters.to}T23:59:59`)));
  });
  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage)); const safePage = Math.min(page, lastPage); const pageRows = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  const selectedRows = vouchers.filter((voucher) => selected.includes(voucher.id) && isEligible(voucher)); const selectedTotal = selectedRows.reduce((sum, voucher) => sum + Number(voucher.remaining_vnd), 0); const pageEligible = pageRows.filter(isEligible); const allPageSelected = pageEligible.length > 0 && pageEligible.every((voucher) => selected.includes(voucher.id));
  const updateFilters = (next) => { setFilters((value) => ({ ...value, ...next })); setPage(1); };
  const togglePage = () => setSelected((current) => allPageSelected ? current.filter((id) => !pageEligible.some((voucher) => voucher.id === id)) : [...new Set([...current, ...pageEligible.map((voucher) => voucher.id)])]);
  const batchPay = async () => { if (!checkout) return; setBusy("checkout"); setError(""); try { await payVouchersFromWallet({ voucher_ids: checkout.voucherIds, idempotency_key: checkout.idempotencyKey }); setCheckout(null); setSelected([]); await load(); } catch (reason) { setError(reason.message || "Không thể thanh toán các phiếu đã chọn."); } finally { setBusy(null); } };
  const cards = [
    { label: "Số dư ví", value: summary?.balance_vnd, note: "Số dư khả dụng", icon: WalletCards, tone: "wallet" },
    { label: "Tổng phải thanh toán", value: summary?.outstanding_vnd, note: `${stats.pendingCount} phiếu còn công nợ`, icon: FileText, tone: "total" },
    { label: "Đã thanh toán (30 ngày)", value: stats.paid, note: `${stats.paidCount} phiếu`, icon: CheckCircle2, tone: "paid" },
    { label: "Đang chờ thanh toán", value: stats.pending, note: `${stats.pendingCount} phiếu`, icon: Clock3, tone: "pending" },
    { label: "Hết hạn / Đã hủy", value: stats.closed, note: `${stats.closedCount} phiếu`, icon: CircleX, tone: "closed" },
  ];
  return <><PageHeader title="Thanh toán đơn hàng" description="Quản lý và thanh toán các phiếu đặt cọc, đơn hàng, vận chuyển và phí phát sinh." icon={CreditCard} action={<div className={feature.paymentHeaderActions}><a href="/tai-khoan/vi/"><History /> Lịch sử giao dịch</a><a className={feature.paymentHeaderPrimary} href="/tai-khoan/vi/?nap-tien=1"><WalletCards /> Nạp tiền</a></div>} />
    <div className={feature.paymentStats}>{cards.map(({ label, value, note, icon: Icon, tone }) => <article key={label} data-tone={tone}><span><Icon /></span><div><small>{label}</small><strong>{formatVnd(value)}</strong><p>{note}</p></div></article>)}</div>
    <ErrorMessage message={error} retry={load} />
    <section className={feature.voucherFilters}><div className={feature.voucherTabs}>{[["all", "Tất cả", counts.all], ["pending", "Chờ thanh toán", counts.pending], ["paid", "Đã thanh toán", counts.paid], ["expired", "Hết hạn", counts.expired], ["cancelled", "Đã hủy", counts.cancelled]].map(([key, label, count]) => <button type="button" key={key} aria-selected={filters.tab === key} onClick={() => updateFilters({ tab: key })}>{label} <b>({count})</b></button>)}</div><div className={feature.voucherFilterGrid}><label className={feature.voucherSearch}><Search /><input aria-label="Tìm phiếu thanh toán" value={filters.search} onChange={(event) => updateFilters({ search: event.target.value })} placeholder="Tìm mã phiếu, mã đơn, nội dung..." /></label><label><span>Loại phiếu</span><select aria-label="Loại phiếu" value={filters.type} onChange={(event) => updateFilters({ type: event.target.value })}><option value="">Tất cả</option>{[...new Set(vouchers.map((item) => item.type).filter(Boolean))].map((type) => <option key={type} value={type}>{typeMeta(type)[0]}</option>)}</select></label><label><span>Trạng thái</span><select aria-label="Trạng thái phiếu" value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}><option value="">Tất cả</option><option value="pending">Chờ thanh toán</option><option value="paid">Đã thanh toán</option><option value="expired">Hết hạn</option><option value="cancelled">Đã hủy</option></select></label><div className={feature.voucherDates}><CalendarDays /><input aria-label="Từ ngày" type="date" value={filters.from} onChange={(event) => updateFilters({ from: event.target.value })} /><ArrowRight /><input aria-label="Đến ngày" type="date" value={filters.to} onChange={(event) => updateFilters({ to: event.target.value })} /></div></div></section>
    {selectedRows.length > 0 && <section className={feature.checkoutBar}><div><CheckCircle2 /><span>Đã chọn <b>{selectedRows.length} phiếu</b></span><i /><span>Tổng tiền: <strong>{formatVnd(selectedTotal)}</strong></span></div><button type="button" onClick={() => setCheckout({ voucherIds: selectedRows.map((item) => item.id), idempotencyKey: idempotencyKey() })}><CreditCard /> Thanh toán (Checkout)</button></section>}
    <section className={feature.voucherPanel}>{!summary && !error ? <LoadingState /> : pageRows.length ? <><div className={feature.voucherTableWrap}><table><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả phiếu hợp lệ trên trang" checked={allPageSelected} onChange={togglePage} /></th><th>Mã phiếu</th><th>Loại phiếu</th><th>Ngày tạo</th><th>Nội dung</th><th>Số tiền</th><th>Trạng thái</th><th>Còn lại</th><th>Thao tác</th></tr></thead><tbody>{pageRows.map((voucher) => { const [typeLabel, typeTone] = typeMeta(voucher.type); const [statusLabel, statusTone] = statusMeta(voucher); const eligible = isEligible(voucher); return <tr key={voucher.id} className={selected.includes(voucher.id) ? feature.voucherSelected : ""}><td><input type="checkbox" aria-label={`Chọn phiếu ${voucher.code}`} disabled={!eligible} checked={selected.includes(voucher.id)} onChange={() => setSelected((current) => current.includes(voucher.id) ? current.filter((id) => id !== voucher.id) : [...current, voucher.id])} /></td><td><strong>{voucher.code}</strong></td><td><span className={`${feature.voucherType} ${feature[`voucherType_${typeTone}`]}`}>{typeLabel}</span></td><td>{formatDateTime(voucher.created_at)}</td><td>{voucher.content || voucher.order_code || "—"}</td><td><strong>{formatVnd(voucher.total_vnd)}</strong></td><td><span className={`${feature.voucherStatus} ${feature[`voucherStatus_${statusTone}`]}`}>{statusLabel}</span></td><td><strong>{formatVnd(voucher.remaining_vnd)}</strong></td><td><div className={feature.voucherActions}>{eligible && <button type="button" disabled={busy} onClick={() => openPayment(voucher)}>Thanh toán</button>}<button type="button" aria-label={`Xem chi tiết ${voucher.code}`} onClick={() => setDetail(voucher)}><Eye /></button></div></td></tr>; })}</tbody></table></div><footer className={feature.voucherPagination}><span>Hiển thị {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)} trong {filtered.length} phiếu</span><label>Số dòng/trang <select aria-label="Số phiếu mỗi trang" value={perPage} onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label><div><button type="button" aria-label="Trang trước" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}><ArrowLeft /></button>{Array.from({ length: lastPage }, (_, index) => index + 1).map((value) => <button type="button" key={value} aria-current={safePage === value ? "page" : undefined} onClick={() => setPage(value)}>{value}</button>)}<button type="button" aria-label="Trang sau" disabled={safePage === lastPage} onClick={() => setPage(safePage + 1)}><ArrowRight /></button></div></footer></> : <EmptyState title="Không có phiếu phù hợp" description="Thử thay đổi bộ lọc để xem các phiếu khác." />}</section>
    <Modal open={Boolean(paymentAction)} onClose={() => { if (!busy) { setPaymentAction(null); setIntent(null); } }} title={intent ? "Thanh toán qua VietQR" : "Chọn phương thức thanh toán"} description={intent ? "Theo dõi trạng thái thanh toán và chờ SePay đối soát tự động." : "Thanh toán bằng Ví VietTrung hoặc chuyển khoản trực tiếp qua VietQR/SePay."} className={`${feature.paymentChoiceModal} ${intent ? `${feature.paymentModal} ${feature.vietqrModal}` : ""}`} icon={CreditCard}>{paymentAction && <VoucherPaymentChoice action={paymentAction} summary={summary} method={paymentMethod} setMethod={setPaymentMethod} busy={busy} intent={intent} onWalletPay={walletPay} onBankPay={sepayPay} onBack={() => setIntent(null)} onUpdated={setIntent} onCompleted={() => { setPaymentAction(null); setIntent(null); load(); }} />}</Modal>
    <Modal open={Boolean(checkout)} onClose={() => { if (!busy) setCheckout(null); }} title="Xác nhận checkout nhiều phiếu" description="Các phiếu được thanh toán nguyên tử bằng số dư ví; nếu một phiếu lỗi, toàn bộ checkout được hoàn tác.">{checkout && <div className={feature.batchCheckout}><div className={feature.batchVoucherList}>{selectedRows.map((voucher) => <div key={voucher.id}><span><b>{voucher.code}</b><small>{typeMeta(voucher.type)[0]}</small></span><strong>{formatVnd(voucher.remaining_vnd)}</strong></div>)}</div><dl><div><dt>Tổng thanh toán</dt><dd>{formatVnd(selectedTotal)}</dd></div><div><dt>Số dư ví</dt><dd>{formatVnd(summary.balance_vnd)}</dd></div><div><dt>Số dư sau thanh toán</dt><dd>{formatVnd(summary.balance_vnd - selectedTotal)}</dd></div></dl><p><Info /> SePay hiện chỉ liên kết một intent với một phiếu. Checkout nhiều phiếu dùng phương thức ví để không làm sai quan hệ đối soát.</p><div className={feature.actions}><button type="button" className={feature.secondary} disabled={busy} onClick={() => setCheckout(null)}>Hủy</button><button type="button" className={feature.primary} disabled={busy || summary.balance_vnd < selectedTotal} onClick={batchPay}>{busy === "checkout" ? "Đang thanh toán..." : "Thanh toán bằng số dư ví"}</button></div></div>}</Modal>
    <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Chi tiết phiếu thanh toán" description={detail?.code}>{detail && <div className={feature.confirmPayment}><dl><div><dt>Loại phiếu</dt><dd>{typeMeta(detail.type)[0]}</dd></div><div><dt>Nội dung</dt><dd>{detail.content || "—"}</dd></div><div><dt>Tổng tiền</dt><dd>{formatVnd(detail.total_vnd)}</dd></div><div><dt>Đã thanh toán</dt><dd>{formatVnd(detail.paid_vnd)}</dd></div><div><dt>Còn lại</dt><dd>{formatVnd(detail.remaining_vnd)}</dd></div></dl></div>}</Modal>
  </>;
}

export function RealCustomerPricingPage() {
  const [config, setConfig] = useState(null); const [form, setForm] = useState({ product_price_cny: "", quantity: "1", weight_kg: "" }); const [result, setResult] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { getCustomerPricing().then(setConfig).catch((reason) => setError(reason.message)); }, []);
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(""); setResult(null); try { const data = await estimateCustomerPricing(form); setResult(data.estimate); } catch (reason) { setError(reason.message); } finally { setBusy(false); } };
  const resultValue = (value) => value === null || value === undefined ? "Chưa có dữ liệu" : formatVnd(value);
  return <div className={feature.pricingPage}><PageHeader title="Bảng giá & ước tính chi phí" description="Dữ liệu tỷ giá và cước đang hiệu lực lấy trực tiếp từ hệ thống nghiệp vụ." icon={Tags} /><div className={feature.pricingLayout}><section className={`${feature.contentCard} ${feature.pricingConfig}`}><header className={feature.cardHeader}><h2><Layers3 /> Cấu hình đang áp dụng</h2></header><div className={feature.priceCategories}><div className={feature.priceCategory}><span><ArrowRight /></span><div><strong>Tỷ giá CNY/VND</strong><small>{config?.exchange_rate ? `Hiệu lực ${formatDateTime(config.exchange_rate.effective_from)}` : "Chưa có tỷ giá đang hiệu lực"}</small></div><b>{config?.exchange_rate?.rate || "Chưa có"}</b></div><div className={feature.priceCategory}><span><Truck /></span><div><strong>Cước vận chuyển</strong><small>{config?.shipping_rate?.name || "Chưa có bảng cước đang áp dụng"}</small></div><b>{config?.shipping_rate ? `${config.shipping_rate.details?.length || 0} khung` : "Chưa có"}</b></div></div></section><aside className={`${feature.contentCard} ${feature.pricingNote}`}><div><header className={feature.cardHeader}><h2><Info /> Lưu ý</h2><p>Ước tính không tự điền 0 cho phí chưa được cấu hình và không phải báo giá chốt đơn.</p></header><Calculator /></div></aside></div><section className={feature.calculator}><form className={`${feature.calculatorInput} ${feature.pricingForm}`} onSubmit={submit}><header className={feature.cardHeader}><h2><Calculator /> Nhập thông tin</h2><p>Nhập thông tin sản phẩm để ước tính chi phí dự kiến.</p></header><div className={feature.formGrid}><label className={feature.field}><span>Giá sản phẩm (CNY)</span><div className={feature.iconInput}><PackageCheck /><input required min="0.01" inputMode="decimal" value={form.product_price_cny} onChange={(e) => setForm({ ...form, product_price_cny: e.target.value })} placeholder="Nhập giá sản phẩm" /></div></label><label className={feature.field}><span>Số lượng</span><div className={feature.iconInput}><Layers3 /><input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div></label><label className={`${feature.field} ${feature.fullField}`}><span>Trọng lượng (kg)</span><div className={feature.iconInput}><PackageCheck /><input required min="0.001" inputMode="decimal" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} placeholder="Nhập trọng lượng (kg)" /></div></label></div><div className={feature.actions}><button className={feature.primary} disabled={busy}><Calculator />{busy ? "Đang tính..." : "Ước tính"}<ArrowRight /></button></div><ErrorMessage message={error} /></form><aside className={`${feature.calculatorResult} ${feature.pricingResult}`}><header className={feature.cardHeader}><h2><SlidersHorizontal /> Kết quả</h2></header><div className={feature.breakdown}><div><span><Layers3 /> Tiền hàng</span><strong>{resultValue(result?.goods_value_vnd)}</strong></div><div><span><Truck /> Phí vận chuyển</span><strong>{resultValue(result?.shipping_fee_vnd)}</strong></div><div><span><WalletCards /> Phí mua hộ</span><strong>{result ? "Chưa cấu hình" : "—"}</strong></div><div><span><Calculator /> Tổng các khoản đã biết</span><strong>{resultValue(result?.known_total_vnd)}</strong></div></div>{result?.notice && <p className={feature.notice}>{result.notice}</p>}</aside></section></div>;
}
