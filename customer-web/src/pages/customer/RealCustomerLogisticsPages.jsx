import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Boxes, Building2, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Copy, Filter, Layers3, MapPin, Package, PackageCheck, RefreshCw, Route, Search, Ship, Truck, Warehouse, Weight, X } from "lucide-react";
import { getCustomerOrderShipments, getCustomerWarehousePackage, getCustomerWarehousePackages, searchCustomerTracking } from "../../api/customerPortal.js";
import ProductThumbnail from "../../components/customer/ProductThumbnail.jsx";
import { PageHeader } from "../../components/customer/PortalComponents.jsx";
import { formatDateTime } from "../../utils/customerFormatters.js";
import styles from "../../components/customer/CustomerLogistics.module.css";

const formatWeight = (value) => value == null ? "Chưa có cân nặng" : `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 3 })} kg`;
const queryCode = () => new URLSearchParams(window.location.search).get("code") || "";
const normalizeTrackingQuery = (value) => String(value || "").normalize("NFKC").trim();
const validTrackingQuery = (value) => value.length > 0 && value.length <= 150 && ![...value].some((character) => { const code = character.charCodeAt(0); return code < 32 || code === 127; });

function LogisticsBadge({ status }) {
  return <span className={`${styles.statusBadge} ${styles[`status_${status?.key || "recorded"}`]}`}>{status?.label || "Đã ghi nhận"}</span>;
}

function LoadingRows() { return <div className={styles.loadingRows} aria-label="Đang tải dữ liệu kiện hàng"><i /><i /><i /></div>; }
function ErrorState({ message, onRetry }) { return <div className={styles.stateBox} role="alert"><AlertCircle /><strong>Không thể tải dữ liệu</strong><p>{message}</p><button type="button" onClick={onRetry}><RefreshCw />Thử lại</button></div>; }

function StatCards({ statistics, loading, error }) {
  const cards = [
    ["Tổng kiện được ghi nhận", statistics?.total, Boxes, "orange"],
    ["Đã đến kho Trung Quốc", statistics?.cn_received, Warehouse, "blue"],
    ["Đang vận chuyển về Việt Nam", statistics?.in_transit, Ship, "violet"],
    ["Đã đến kho Việt Nam", statistics?.vn_received, Building2, "green"],
  ];
  return <section className={styles.stats} aria-label="Thống kê kiện hàng">{cards.map(([label, value, Icon, tone]) => <article className={`${styles.stat} ${styles[`stat_${tone}`]}`} key={label}><span><Icon /></span><div><small>{label}</small>{loading ? <i /> : <strong>{error ? "—" : value}</strong>}</div></article>)}</section>;
}

function PackageRow({ item, routes, onDetail }) {
  const tracking = item.tracking_number || "Chưa có mã vận đơn";
  return <tr><td><button className={styles.packageCode} type="button" onClick={() => onDetail(item.id)}>{item.display_code}</button></td><td><strong className={styles.trackingCode}>{tracking}</strong><small>{item.carrier || "Chưa rõ hãng vận chuyển"}</small></td><td>{item.order ? <a href={`${routes.orderDetail}?id=${item.order.id}`}>{item.order.code}</a> : "Chưa liên kết"}</td><td><span className={styles.warehouse}><MapPin />{item.warehouse.label}</span></td><td>{formatWeight(item.weight_kg)}</td><td><LogisticsBadge status={item.status} /></td><td>{item.latest_event_at ? formatDateTime(item.latest_event_at) : "Chưa có mốc vận chuyển"}</td><td><div className={styles.rowActions}><button type="button" onClick={() => onDetail(item.id)}>Chi tiết</button><a href={`${routes.tracking}?code=${encodeURIComponent(item.tracking_number || item.id)}`}>Hành trình <ArrowRight /></a></div></td></tr>;
}

function PackageCard({ item, routes, onDetail }) {
  return <article className={styles.mobilePackage}><header><button type="button" onClick={() => onDetail(item.id)}>{item.display_code}</button><LogisticsBadge status={item.status} /></header><strong>{item.tracking_number || "Chưa có mã vận đơn"}</strong><dl><div><dt>Đơn mua hộ</dt><dd>{item.order?.code || "Chưa liên kết"}</dd></div><div><dt>Kho hiện tại</dt><dd>{item.warehouse.label}</dd></div><div><dt>Trọng lượng</dt><dd>{formatWeight(item.weight_kg)}</dd></div><div><dt>Cập nhật</dt><dd>{item.latest_event_at ? formatDateTime(item.latest_event_at) : "Chưa có"}</dd></div></dl><div><button type="button" onClick={() => onDetail(item.id)}>Xem chi tiết</button><a href={`${routes.tracking}?code=${encodeURIComponent(item.tracking_number || item.id)}`}>Xem hành trình</a></div></article>;
}

function Timeline({ events = [] }) {
  if (!events.length) return <p className={styles.noTimeline}>Chưa có mốc vận chuyển thực tế ngoài thông tin đã ghi nhận.</p>;
  return <ol className={styles.timeline}>{events.map((event) => <li className={event.kind === "estimate" ? styles.estimate : ""} key={event.key}><span>{event.kind === "estimate" ? <Clock3 /> : <Check />}</span><div><strong>{event.label}</strong><small>{formatDateTime(event.occurred_at)}{event.location ? ` · ${event.location}` : ""}</small>{event.kind === "estimate" && <em>Dự kiến, chưa phải sự kiện đã hoàn thành</em>}</div></li>)}</ol>;
}

const eventDescriptions = {
  seller_dispatched: "Người bán đã bàn giao hàng cho đơn vị vận chuyển.",
  tracking_recorded: "Nhân viên VietTrung Order đã ghi nhận mã vận đơn.",
  cn_received: "Kiện hàng đã được tiếp nhận tại kho Trung Quốc.",
  batch_joined: "Kiện hàng đã được ghép vào lô vận chuyển.",
  batch_departed: "Lô hàng đã xuất kho Trung Quốc để vận chuyển về Việt Nam.",
  batch_arrived: "Lô vận chuyển đã đến Việt Nam.",
  batch_eta: "Mốc dự kiến, chưa phải thời gian đến thực tế.",
};
const eventDescription = (event) => eventDescriptions[event.key] || (event.key?.startsWith("vn_scanned_") ? "Kho Việt Nam đã quét nhận diện kiện hàng." : event.key?.startsWith("vn_received_") ? "Kiện hàng đã được kho Việt Nam tiếp nhận." : "Sự kiện kho vận đã được hệ thống ghi nhận.");
const shortDate = (value) => value ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(value)) : "";
const findEvent = (events, key) => events.find((event) => event.key === key || event.key?.startsWith(`${key}_`));
const batchStatusLabel = (status) => ({ pending: "Chờ xuất", exporting: "Đang vận chuyển", arrived_vn: "Đã đến Việt Nam", completed: "Hoàn tất", cancelled: "Đã hủy" })[status] || status || "Chưa cập nhật";

function TrackingProgress({ events, packageItem }) {
  const delivery = packageItem?.domestic_delivery;
  const steps = [
    { key: "tracking_recorded", label: "Ghi nhận vận đơn", Icon: Package },
    { key: "cn_received", label: "Nhận tại kho TQ", Icon: Warehouse },
    { key: "batch_joined", label: "Ghép lô", Icon: Layers3 },
    { key: "batch_departed", label: "Xuất kho TQ", Icon: Truck },
    { key: "vn_received", label: "Đến kho Việt Nam", Icon: Building2 },
    { key: "delivery", label: "Giao hàng", Icon: PackageCheck },
  ].map((step) => {
    const event = step.key === "vn_received" ? findEvent(events, "vn_received") || findEvent(events, "vn_scanned") : findEvent(events, step.key);
    const deliveryVerified = step.key === "delivery" && ["in_transit", "completed"].includes(delivery?.status);
    return { ...step, event, verified: Boolean(event || deliveryVerified), terminal: step.key === "delivery" && delivery?.status === "completed" };
  });
  const lastVerified = steps.reduce((latest, step, index) => step.verified ? index : latest, -1);
  return <ol className={styles.progressRail} aria-label="Tiến trình vận chuyển">{steps.map((step, index) => {
    const state = step.terminal || (step.verified && index < lastVerified) ? "done" : step.verified && index === lastVerified ? "current" : "pending";
    return <li className={styles[`progress_${state}`]} key={step.key} data-state={state}><span className={styles.progressIcon}>{state === "done" ? <Check /> : <step.Icon />}</span><strong>{step.label}</strong><small>{step.event ? shortDate(step.event.occurred_at) : step.key === "delivery" && step.verified ? "Đang xử lý" : "Chưa xác minh"}</small></li>;
  })}</ol>;
}

function DetailedJourney({ events, domesticDelivery }) {
  if (!events.length && !domesticDelivery) return <div className={styles.trackingEmptyCard}><Clock3 /><strong>Chưa có mốc vận chuyển</strong><p>Các sự kiện sẽ xuất hiện khi được nhân viên hoặc hệ thống kho ghi nhận.</p></div>;
  const lastRealIndex = events.reduce((last, event, index) => event.kind !== "estimate" ? index : last, -1);
  return <ol className={styles.detailedTimeline}>{events.map((event, index) => {
    const isEstimate = event.kind === "estimate"; const isCurrent = !isEstimate && index === lastRealIndex;
    const Icon = event.key === "cn_received" ? Warehouse : event.key === "batch_joined" ? Layers3 : event.key === "batch_departed" ? Truck : event.key?.startsWith("vn_") || event.key === "batch_arrived" ? Building2 : isEstimate ? Clock3 : Package;
    return <li className={`${isEstimate ? styles.timelineEstimate : ""} ${isCurrent ? styles.timelineCurrent : ""}`} key={event.key}><span><Icon /></span><div><header><strong>{event.label}</strong><time>{formatDateTime(event.occurred_at)}</time></header><p>{eventDescription(event)}</p>{event.location && <small><MapPin />{event.location}</small>}{isEstimate && <em>Dự kiến · không phải sự kiện đã hoàn thành</em>}</div></li>;
  })}{domesticDelivery && <li className={styles.timelineDelivery}><span><Truck /></span><div><header><strong>{domesticDelivery.label}</strong><time>Chưa có timestamp</time></header><p>Trạng thái giao nội địa hiện tại; chưa tạo mốc thời gian vì hệ thống không lưu thời điểm chuyển trạng thái.</p>{domesticDelivery.carrier && <small>{domesticDelivery.carrier}</small>}</div></li>}</ol>;
}

function BatchInformation({ batch }) {
  if (!batch) return <section className={styles.sideInfoCard}><header><Layers3 /><h3>Thông tin lô hàng</h3></header><div className={styles.sideEmpty}><Layers3 /><p>Kiện hàng chưa được ghép lô vận chuyển.</p></div></section>;
  const rows = [["Mã lô hàng", batch.code], ["Tuyến vận chuyển", batch.route_name], ["Kho xuất phát", batch.origin], ["Kho đích", batch.destination], ["Ngày xuất kho TQ", batch.departed_at && formatDateTime(batch.departed_at)], ["Ngày dự kiến đến", batch.expected_arrival_at && formatDateTime(batch.expected_arrival_at)], ["Ngày đến thực tế", batch.arrived_at && formatDateTime(batch.arrived_at)], ["Trạng thái lô", batchStatusLabel(batch.status)]].filter(([, value]) => value);
  return <section className={styles.sideInfoCard}><header><Layers3 /><h3>Thông tin lô hàng</h3></header><dl className={styles.batchDetails}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}

function PackageProducts({ products = [], order, routes }) {
  return <section className={styles.sideInfoCard}><header><Package /><h3>Sản phẩm trong kiện ({products.length})</h3></header>{products.length ? <div className={styles.trackingProducts}>{products.map((product) => <article key={product.id}><ProductThumbnail src={product.image} alt={product.name} size="medium" /><div><strong>{product.name}</strong><small>{product.variant || "Chưa có phân loại"}</small>{order && <a href={`${routes.orderDetail}?id=${order.id}`}>Xem trong đơn mua hộ</a>}</div><b>×{product.quantity}</b></article>)}</div> : <div className={styles.sideEmpty}><Package /><p>Chưa có thông tin đối chiếu sản phẩm trong kiện.</p></div>}</section>;
}

function PackageDetail({ packageId, onClose, routes }) {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [retry, setRetry] = useState(0); const [copied, setCopied] = useState(false);
  useEffect(() => { let active = true; Promise.resolve().then(() => { if (active) { setData(null); setError(""); } return getCustomerWarehousePackage(packageId); }).then((result) => { if (active) setData(result.package); }).catch((reason) => { if (active) setError(reason?.message || "Không thể tải chi tiết kiện."); }); return () => { active = false; }; }, [packageId, retry]);
  const copy = async () => { if (!data?.tracking_number) return; try { await navigator.clipboard.writeText(data.tracking_number); setCopied(true); } catch { setCopied(false); } };
  return <div className={styles.detailBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className={styles.detailPanel} role="dialog" aria-modal="true" aria-label="Chi tiết kiện hàng"><header><div><span>Chi tiết kiện hàng</span><h2>{data?.display_code || `ID kiện #${packageId}`}</h2></div><button type="button" onClick={onClose} aria-label="Đóng chi tiết"><X /></button></header>{error ? <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} /> : !data ? <LoadingRows /> : <div className={styles.detailBody}><div className={styles.detailTop}><div><small>Mã vận đơn</small><strong>{data.tracking_number || "Chưa có mã"}</strong>{data.tracking_number && <button type="button" onClick={copy}><Copy />{copied ? "Đã sao chép" : "Sao chép"}</button>}</div><LogisticsBadge status={data.status} /></div><dl className={styles.detailFacts}><div><dt>Đơn mua hộ</dt><dd>{data.order ? <a href={`${routes.orderDetail}?id=${data.order.id}`}>{data.order.code}</a> : "Chưa liên kết"}</dd></div><div><dt>Hãng vận chuyển</dt><dd>{data.carrier || "Chưa cập nhật"}</dd></div><div><dt>Kho hiện tại</dt><dd>{data.warehouse.label}</dd></div><div><dt>Trọng lượng</dt><dd>{formatWeight(data.weight_kg)}</dd></div>{data.batch && <><div><dt>Mã lô</dt><dd>{data.batch.code}</dd></div><div><dt>Tuyến</dt><dd>{data.batch.route_name || data.batch.destination || "Chưa cập nhật"}</dd></div></>}</dl>{data.products.length > 0 && <section><h3>Sản phẩm liên quan</h3><div className={styles.detailProducts}>{data.products.map((product) => <article key={product.id}><ProductThumbnail src={product.image} alt={product.name} size="small" /><div><strong>{product.name}</strong><small>Số lượng liên kết: {product.quantity}</small></div></article>)}</div></section>}<section><h3>Hành trình đã ghi nhận</h3><Timeline events={data.timeline} /></section>{data.domestic_delivery && <p className={styles.deliveryNote}><Truck /><span>Giao nội địa: <strong>{data.domestic_delivery.label}</strong>. Hệ thống chưa có timestamp chuyển trạng thái để tạo mốc timeline.</span></p>}</div>}</aside></div>;
}

export function RealConsignmentsPage({ routes }) {
  const [result, setResult] = useState(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [page, setPage] = useState(1); const [retry, setRetry] = useState(0); const [detailId, setDetailId] = useState(null);
  const [draft, setDraft] = useState({ tracking_number: "", package_id: "", order_code: "", status: "", warehouse: "", recorded_from: "", recorded_to: "" });
  const [filters, setFilters] = useState(draft);
  useEffect(() => { let active = true; Promise.resolve().then(() => { if (active) { setLoading(true); setError(""); } return getCustomerWarehousePackages({ ...filters, page, per_page: 10 }); }).then((data) => { if (active) setResult(data); }).catch((reason) => { if (active) setError(reason?.message || "Không thể tải danh sách kiện."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [filters, page, retry]);
  const submit = (event) => { event.preventDefault(); setPage(1); setResult(null); setFilters(draft); };
  const clear = () => { const empty = { tracking_number: "", package_id: "", order_code: "", status: "", warehouse: "", recorded_from: "", recorded_to: "" }; setDraft(empty); setFilters(empty); setPage(1); };
  const packages = result?.packages || []; const pagination = result?.pagination || {};
  return <><PageHeader title="Danh sách ký gửi" description="Theo dõi các kiện hàng và mã vận đơn được nhân viên VietTrung Order ghi nhận." /><StatCards statistics={result?.statistics} loading={loading && !result} error={error} /><form className={styles.filters} onSubmit={submit}><label><span>Mã vận đơn</span><div><Search /><input value={draft.tracking_number} onChange={(event) => setDraft((value) => ({ ...value, tracking_number: event.target.value }))} placeholder="VD: YT123..." /></div></label><label><span>ID kiện</span><input type="number" min="1" value={draft.package_id} onChange={(event) => setDraft((value) => ({ ...value, package_id: event.target.value }))} placeholder="ID hệ thống" /></label><label><span>Mã đơn mua hộ</span><input value={draft.order_code} onChange={(event) => setDraft((value) => ({ ...value, order_code: event.target.value }))} placeholder="REQ-..." /></label><label><span>Trạng thái</span><select value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value }))}><option value="">Tất cả</option><option value="recorded">Đã ghi nhận</option><option value="cn_received">Đến kho Trung Quốc</option><option value="in_transit">Đang về Việt Nam</option><option value="vn_received">Đến kho Việt Nam</option><option value="delivered">Đã giao</option></select></label><label><span>Kho hiện tại</span><select value={draft.warehouse} onChange={(event) => setDraft((value) => ({ ...value, warehouse: event.target.value }))}><option value="">Tất cả</option><option value="cn">Kho Trung Quốc</option><option value="transit">Đang vận chuyển</option><option value="vn">Kho Việt Nam</option></select></label><label className={styles.dateFilter}><span>Ngày ghi nhận</span><div><CalendarDays /><input aria-label="Từ ngày ghi nhận" type="date" value={draft.recorded_from} onChange={(event) => setDraft((value) => ({ ...value, recorded_from: event.target.value }))} /><i>–</i><input aria-label="Đến ngày ghi nhận" type="date" min={draft.recorded_from || undefined} value={draft.recorded_to} onChange={(event) => setDraft((value) => ({ ...value, recorded_to: event.target.value }))} /></div></label><div className={styles.filterActions}><button type="submit"><Filter />Lọc</button><button type="button" onClick={clear}><X />Xóa lọc</button></div></form><section className={styles.listPanel}>{error ? <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} /> : loading && !result ? <LoadingRows /> : packages.length ? <><div className={styles.tableWrap}><table><thead><tr><th>Mã kiện</th><th>Mã vận đơn</th><th>Đơn mua hộ</th><th>Kho hiện tại</th><th>Trọng lượng</th><th>Trạng thái</th><th>Cập nhật</th><th>Thao tác</th></tr></thead><tbody>{packages.map((item) => <PackageRow item={item} routes={routes} onDetail={setDetailId} key={item.id} />)}</tbody></table></div><div className={styles.mobileList}>{packages.map((item) => <PackageCard item={item} routes={routes} onDetail={setDetailId} key={item.id} />)}</div><footer><span>Hiển thị {packages.length} trên {pagination.total} kiện</span><div><button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></button><strong>Trang {page}/{pagination.last_page}</strong><button type="button" aria-label="Trang sau" disabled={page >= pagination.last_page} onClick={() => setPage((value) => value + 1)}><ChevronRight /></button></div></footer></> : <div className={styles.stateBox}><Boxes /><strong>Bạn chưa có kiện hàng nào được hệ thống ghi nhận</strong><p>Kiện hàng sẽ xuất hiện sau khi nhân viên xử lý đơn và có thông tin vận chuyển.</p><a href={routes.orders}>Xem đơn mua hộ</a></div>}</section>{detailId && <PackageDetail packageId={detailId} onClose={() => setDetailId(null)} routes={routes} />}</>;
}

export function RealTrackingPage({ routes }) {
  const initial = normalizeTrackingQuery(queryCode()); const [code, setCode] = useState(initial); const [submitted, setSubmitted] = useState(initial); const [result, setResult] = useState(null); const [loading, setLoading] = useState(Boolean(initial)); const [error, setError] = useState(""); const [validationError, setValidationError] = useState(""); const [retry, setRetry] = useState(0); const [selected, setSelected] = useState({ group: 0, package: 0 }); const [copied, setCopied] = useState(false); const [composing, setComposing] = useState(false); const requestId = useRef(0); const activeController = useRef(null);
  useEffect(() => {
    if (composing) return undefined;
    const value = normalizeTrackingQuery(code);
    if (!value) {
      activeController.current?.abort(); requestId.current += 1;
      Promise.resolve().then(() => { setSubmitted(""); setResult(null); setError(""); setValidationError(""); setLoading(false); setSelected({ group: 0, package: 0 }); });
      return undefined;
    }
    if (value !== submitted) {
      activeController.current?.abort(); requestId.current += 1;
      Promise.resolve().then(() => setLoading(false));
    }
    if (!validTrackingQuery(value)) { Promise.resolve().then(() => setValidationError("Mã tra cứu không hợp lệ hoặc vượt quá 150 ký tự.")); return undefined; }
    Promise.resolve().then(() => setValidationError(""));
    if (value === submitted) return undefined;
    const timer = window.setTimeout(() => { setCopied(false); setSubmitted(value); }, 600);
    return () => window.clearTimeout(timer);
  }, [code, composing, submitted]);
  useEffect(() => {
    if (!submitted) return undefined;
    activeController.current?.abort();
    const controller = new AbortController(); const currentRequest = requestId.current + 1;
    activeController.current = controller; requestId.current = currentRequest;
    Promise.resolve().then(() => { if (requestId.current === currentRequest) { setLoading(true); setError(""); setResult(null); } return searchCustomerTracking(submitted, { signal: controller.signal }); }).then((data) => { if (!controller.signal.aborted && requestId.current === currentRequest) { setResult(data); setSelected({ group: 0, package: 0 }); } }).catch((reason) => { if (!controller.signal.aborted && requestId.current === currentRequest && reason?.name !== "AbortError") setError(reason?.message || "Không thể tra cứu hành trình."); }).finally(() => { if (!controller.signal.aborted && requestId.current === currentRequest) setLoading(false); });
    return () => controller.abort();
  }, [submitted, retry]);
  const search = (event) => { event.preventDefault(); if (composing) return; const value = normalizeTrackingQuery(code); if (!value || !validTrackingQuery(value)) return; setValidationError(""); setCopied(false); if (value === submitted) setRetry((current) => current + 1); else setSubmitted(value); };
  const clearSearch = () => { activeController.current?.abort(); requestId.current += 1; setCode(""); setSubmitted(""); setResult(null); setError(""); setValidationError(""); setLoading(false); setCopied(false); setSelected({ group: 0, package: 0 }); };
  const groups = result?.results || []; const group = groups[selected.group]; const packageItem = group?.packages?.[selected.package]; const events = packageItem?.timeline || group?.timeline || [];
  const trackingCode = group?.tracking?.number || packageItem?.tracking_number; const latestAt = packageItem?.latest_event_at || group?.tracking?.dispatched_at || group?.tracking?.recorded_at;
  const copyTracking = async () => { if (!trackingCode) return; try { await navigator.clipboard.writeText(trackingCode); setCopied(true); } catch { setCopied(false); } };
  return <div className={styles.trackingPage}>
    <section className={styles.trackingBanner}><div className={styles.bannerTitle}><span><Truck /></span><div><h1>Tra cứu hành trình</h1><p>Nhập mã vận đơn, mã kiện hoặc mã đơn mua hộ để theo dõi quá trình vận chuyển.</p></div></div><form className={styles.bannerSearch} onSubmit={search}><Search /><input aria-label="Mã cần tra cứu" value={code} onChange={(event) => { setCode(event.target.value); if (validationError) setValidationError(""); }} onCompositionStart={() => { activeController.current?.abort(); requestId.current += 1; setLoading(false); setComposing(true); }} onCompositionEnd={(event) => { setComposing(false); setCode(event.currentTarget.value); }} placeholder="Nhập mã vận đơn, mã kiện hoặc mã đơn mua hộ..." />{loading && <span className={styles.searchSpinner} role="status"><RefreshCw />Đang tra cứu...</span>}{code && <button className={styles.clearSearch} type="button" onClick={clearSearch} aria-label="Xóa mã tra cứu"><X /></button>}</form><div className={styles.bannerArt} aria-hidden="true"><MapPin /><Boxes /><Truck /></div>{validationError && <p className={styles.searchValidation} role="alert">{validationError}</p>}</section>
    {error ? <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} /> : loading ? <section className={styles.trackingLoading}><LoadingRows /></section> : !submitted ? <section className={styles.trackingIntro}><Package /><h2>Theo dõi từ dữ liệu kho vận thực tế</h2><p>Bạn có thể nhập mã vận đơn do nhân viên cập nhật, ID kiện hoặc mã đơn mua hộ.</p><a href={routes.consignments}>Chọn từ danh sách ký gửi</a></section> : groups.length === 0 ? <section className={styles.trackingIntro}><Search /><h2>Không tìm thấy hành trình phù hợp trong tài khoản của bạn</h2><p>Kiểm tra lại mã hoặc chọn một kiện từ danh sách ký gửi. Kết quả chỉ bao gồm dữ liệu thuộc tài khoản của bạn.</p><a href={routes.consignments}>Mở danh sách ký gửi</a></section> : <section className={styles.trackingWorkspace}>
      <aside className={styles.trackingResults}><h2>Kết quả tra cứu ({groups.length})</h2><div>{groups.map((entry, groupIndex) => { const firstPackage = entry.packages[0]; return <button className={selected.group === groupIndex ? styles.selected : ""} type="button" key={entry.key} onClick={() => { setSelected({ group: groupIndex, package: 0 }); setCopied(false); }}><span><Package /></span><div><strong>{entry.tracking?.number || firstPackage?.display_code || "Vận đơn đã ghi nhận"}</strong><small>{entry.order?.code || "Chưa liên kết đơn"}</small><em>{entry.packages.length} kiện hàng</em></div>{firstPackage ? <LogisticsBadge status={firstPackage.status} /> : <span className={styles.resultRecorded}>Đã ghi nhận</span>}</button>; })}</div></aside>
      <div className={styles.trackingDetail}>
        <section className={styles.trackingOverview}><header><div className={styles.trackingIdentity}><span><Package /></span><div><small>Mã vận đơn</small><h2>{trackingCode || "Chưa có mã vận đơn"}{trackingCode && <button type="button" onClick={copyTracking} aria-label="Sao chép mã vận đơn"><Copy /></button>}</h2><p>{group?.tracking?.carrier || packageItem?.carrier || "Chưa cập nhật hãng vận chuyển"}{copied && <b role="status">Đã sao chép</b>}</p></div></div><div className={styles.trackingCurrent}>{packageItem ? <LogisticsBadge status={packageItem.status} /> : <span className={styles.statusBadge}>Đã ghi nhận vận đơn</span>}<small>Cập nhật: {latestAt ? formatDateTime(latestAt) : "Chưa có mốc thời gian"}</small></div></header>
          {group.packages.length > 1 && <div className={styles.packageTabs}><span>Chọn kiện:</span>{group.packages.map((entry, index) => <button type="button" className={selected.package === index ? styles.selected : ""} onClick={() => setSelected((value) => ({ ...value, package: index }))} key={entry.id}>{entry.display_code}</button>)}</div>}
          <dl className={styles.overviewFacts}><div><span><Package /></span><dt>Đơn mua hộ</dt><dd>{group.order ? <a href={`${routes.orderDetail}?id=${group.order.id}`}>{group.order.code}<ChevronRight /></a> : "Chưa liên kết"}</dd></div><div><span><Boxes /></span><dt>Kiện hàng</dt><dd>{packageItem?.display_code || "Chưa hình thành kiện"}</dd></div><div><span><MapPin /></span><dt>Vị trí hiện tại</dt><dd>{packageItem?.warehouse?.label || "Chưa cập nhật"}</dd></div><div><span><Weight /></span><dt>Trọng lượng</dt><dd>{formatWeight(packageItem?.weight_kg)}</dd></div></dl>
          <TrackingProgress events={events} packageItem={packageItem} />
        </section>
        <div className={styles.trackingLower}><section className={styles.journeyCard}><header><Route /><h3>Hành trình chi tiết</h3></header><DetailedJourney events={events} domesticDelivery={packageItem?.domestic_delivery} /></section><aside className={styles.trackingSide}><BatchInformation batch={packageItem?.batch} /><PackageProducts products={packageItem?.products} order={group.order} routes={routes} /></aside></div>
      </div>
    </section>}
  </div>;
}

export function ConsignmentComingSoon({ routes }) {
  return <><PageHeader title="Khai báo ký gửi" description="Chức năng tự khai báo ký gửi chưa được kích hoạt." /><section className={styles.trackingIntro}><Clock3 /><h2>Tạm hoãn triển khai</h2><p>VietTrung Order hiện chỉ hiển thị kiện do nhân viên và hệ thống kho ghi nhận cho đơn mua hộ. Khách hàng không cần tự nhập mã vận đơn.</p><a href={routes.consignments}>Xem danh sách ký gửi</a></section></>;
}

export function OrderShipmentPanel({ orderId, routes }) {
  const [result, setResult] = useState(null); const [error, setError] = useState("");
  useEffect(() => { let active = true; getCustomerOrderShipments(orderId).then((data) => { if (active) setResult(data); }).catch((reason) => { if (active) setError(reason?.message || "Không thể tải vận đơn."); }); return () => { active = false; }; }, [orderId]);
  const groups = result?.results || [];
  return <section className={styles.orderShipments}><header><div><Truck /><h2>Vận đơn & kiện hàng</h2></div>{groups.length > 0 && <a href={`${routes.tracking}?code=${encodeURIComponent(groups[0].order.code)}`}>Theo dõi vận chuyển <ArrowRight /></a>}</header>{error ? <p role="alert">{error}</p> : !result ? <LoadingRows /> : groups.length ? <div>{groups.map((entry) => <article key={entry.key}><div><strong>{entry.tracking?.number || entry.packages[0]?.display_code}</strong><small>{entry.tracking?.carrier || "Chưa cập nhật hãng"} · {entry.packages.length} kiện</small></div><a href={`${routes.tracking}?code=${encodeURIComponent(entry.tracking?.number || entry.packages[0]?.id)}`}>Xem hành trình</a></article>)}</div> : <p>Nhân viên chưa cập nhật mã vận đơn.</p>}</section>;
}
