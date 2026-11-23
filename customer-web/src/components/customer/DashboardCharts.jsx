import { useMemo, useState } from "react";
import { AlertCircle, BarChart3, LineChart, PieChart, RefreshCw } from "lucide-react";
import styles from "./DashboardCharts.module.css";

const STATUS_GROUPS = [
  { key: "processing", label: "Chờ tiếp nhận / xử lý", color: "#ff7445", statuses: ["pending", "processing", "awaiting_deposit", "deposited", "awaiting_tracking"] },
  { key: "purchasing", label: "Đang mua hàng", color: "#f5aa22", statuses: ["purchasing"] },
  { key: "shipping", label: "Đang vận chuyển", color: "#7959e8", statuses: ["shipping", "in_transit", "shipped", "receiving", "waiting_cn_warehouse"] },
  { key: "complete", label: "Hoàn tất", color: "#36b86d", statuses: ["completed", "delivered"] },
  { key: "cancelled", label: "Đã hủy / khiếu nại", color: "#e55252", statuses: ["cancelled", "canceled", "complaint"] },
];

const monthLabel = (month) => {
  const [year, value] = month.split("-");
  return `T${Number(value)}/${year.slice(2)}`;
};
const axisMonthLabel = (month) => `T${Number(month.split("-")[1])}`;
const formatCny = (value) => Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const sumStatuses = (source, statuses) => statuses.reduce((sum, status) => sum + Number(source?.[status] || 0), 0);

function ChartState({ loading, error, empty, onRetry }) {
  if (loading) return <div className={styles.chartLoading} aria-label="Đang tải biểu đồ"><i /><i /><i /><i /></div>;
  if (error) return <div className={styles.chartMessage} role="alert"><AlertCircle /><strong>Không thể tải biểu đồ</strong><span>{error}</span><button type="button" onClick={onRetry}><RefreshCw /> Thử lại</button></div>;
  if (empty) return <div className={styles.chartMessage}><BarChart3 /><strong>Chưa có dữ liệu trong kỳ</strong><span>Biểu đồ sẽ xuất hiện khi tài khoản có đơn hàng.</span></div>;
  return null;
}

function Tooltip({ point }) {
  if (!point) return null;
  return <output className={styles.chartTooltip} style={{ left: `${point.left}%`, top: `${point.top}%` }}>{point.label}<strong>{point.value}</strong></output>;
}

function LineTrend({ monthly }) {
  const [active, setActive] = useState(null);
  const values = monthly.map((entry) => Number(entry.order_count));
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => ({ x: monthly.length === 1 ? 50 : 8 + index * (84 / (monthly.length - 1)), y: 82 - value * (62 / max), value, month: monthly[index].month }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = `${path} L${points.at(-1).x},86 L${points[0].x},86 Z`;
  return <div className={styles.chartPlot} onMouseLeave={() => setActive(null)}>
    <svg viewBox="0 0 100 100" role="img" aria-label="Biểu đồ đường số đơn theo tháng" preserveAspectRatio="none">
      {[20, 40, 60, 80].map((y) => <line className={styles.gridLine} x1="7" x2="94" y1={y} y2={y} key={y} />)}
      <path className={styles.lineArea} d={area} /><path className={styles.linePath} d={path} />
      {points.map((point, index) => <circle key={point.month} className={styles.linePoint} cx={point.x} cy={point.y} r="1.8" tabIndex="0" onFocus={() => setActive(index)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(index)}><title>{`${monthLabel(point.month)}: ${point.value} đơn`}</title></circle>)}
    </svg>
    {active !== null && <Tooltip point={{ left: points[active].x, top: points[active].y, label: monthLabel(points[active].month), value: `${points[active].value} đơn` }} />}
    <div className={styles.axisLabels}>{monthly.map((entry) => <span key={entry.month}>{axisMonthLabel(entry.month)}</span>)}</div>
  </div>;
}

function ValueBars({ monthly }) {
  const [active, setActive] = useState(null);
  const values = monthly.map((entry) => entry.reference_value_cny === null ? null : Number(entry.reference_value_cny));
  const max = Math.max(...values.filter((value) => value !== null), 1);
  return <div className={`${styles.chartPlot} ${styles.barPlot}`} onMouseLeave={() => setActive(null)}>
    <div className={styles.bars} role="img" aria-label="Biểu đồ cột giá trị tham khảo CNY theo tháng">{monthly.map((entry, index) => {
      const value = values[index];
      const height = value === null ? 0 : Math.max(3, value * 100 / max);
      return <button type="button" className={value === null ? styles.barUnknown : ""} style={{ "--bar-height": `${height}%` }} key={entry.month} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(index)} aria-label={`${monthLabel(entry.month)}: ${value === null ? "chưa xác định" : `${formatCny(value)} CNY`}`}><i />{entry.reference_value_completeness === "partial" && <em>Thiếu</em>}</button>;
    })}</div>
    {active !== null && <Tooltip point={{ left: (active + .5) * 100 / monthly.length, top: 18, label: monthLabel(monthly[active].month), value: values[active] === null ? "Chưa xác định" : `${formatCny(values[active])} CNY${monthly[active].unknown_item_count ? " · dữ liệu chưa đủ" : ""}` }} />}
    <div className={styles.axisLabels}>{monthly.map((entry) => <span key={entry.month}>{axisMonthLabel(entry.month)}</span>)}</div>
  </div>;
}

function StatusDonut({ distribution, total }) {
  const [active, setActive] = useState(null);
  const grouped = useMemo(() => {
    const raw = Object.fromEntries(distribution.map((entry) => [entry.status, entry.count]));
    const known = new Set(STATUS_GROUPS.flatMap((group) => group.statuses));
    const entries = STATUS_GROUPS.map((group) => ({ ...group, count: sumStatuses(raw, group.statuses) }));
    const other = distribution.filter((entry) => !known.has(entry.status)).reduce((sum, entry) => sum + Number(entry.count), 0);
    return other ? [...entries, { key: "other", label: "Khác", color: "#8793a1", count: other }] : entries;
  }, [distribution]);
  const visible = grouped.filter((entry) => entry.count);
  const segments = visible.map((entry, index) => ({
    ...entry,
    length: entry.count / total * 100,
    offset: -visible.slice(0, index).reduce((sum, previous) => sum + previous.count / total * 100, 0),
  }));
  return <div className={styles.donutLayout}>
    <div className={styles.donutWrap} onMouseLeave={() => setActive(null)}>
      <svg viewBox="0 0 42 42" role="img" aria-label="Biểu đồ tròn phân bổ trạng thái đơn"><circle className={styles.donutTrack} cx="21" cy="21" r="15.9" />{segments.map((entry, index) => <circle key={entry.key} className={styles.donutSegment} cx="21" cy="21" r="15.9" stroke={entry.color} strokeDasharray={`${entry.length} ${100 - entry.length}`} strokeDashoffset={entry.offset} tabIndex="0" onFocus={() => setActive(index)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(index)}><title>{`${entry.label}: ${entry.count} đơn (${(entry.count / total * 100).toFixed(1)}%)`}</title></circle>)}</svg>
      <div className={styles.donutCenter}><strong>{total}</strong><span>đơn trong kỳ</span></div>
    </div>
    <ul className={styles.donutLegend}>{visible.map((entry, index) => <li className={active === index ? styles.legendActive : ""} key={entry.key} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}><i style={{ background: entry.color }} /><span>{entry.label}</span><strong>{entry.count}</strong><small>{(entry.count / total * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</small></li>)}</ul>
  </div>;
}

export function Sparkline({ values, tone }) {
  if (!values?.length || values.every((value) => value === 0)) return <small className={styles.noTrend}>Chưa đủ dữ liệu xu hướng</small>;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${index * (48 / Math.max(1, values.length - 1))},${20 - value * 17 / max}`).join(" ");
  return <span className={`${styles.sparkline} ${styles[`spark_${tone}`]}`}><svg viewBox="0 0 48 23" role="img" aria-label="Xu hướng theo tháng"><polyline points={points} /></svg><small>{values.length} tháng gần đây</small></span>;
}

export default function DashboardCharts({ analytics, loading, error, months, onMonthsChange, onRetry }) {
  const monthly = analytics?.monthly || [];
  const total = Number(analytics?.totals?.orders || 0);
  const hasOrders = total > 0;
  const hasValue = hasOrders && monthly.some((entry) => entry.reference_value_cny !== null);
  return <section className={styles.analyticsSection} aria-labelledby="analytics-title">
    <header className={styles.analyticsHeader}><div><h2 id="analytics-title">Phân tích hoạt động mua hộ</h2><p>Dữ liệu theo tháng, phạm vi UTC do hệ thống ghi nhận.</p></div><div className={styles.periodTabs} aria-label="Khoảng thời gian biểu đồ">{[3, 6, 12].map((value) => <button type="button" key={value} aria-pressed={months === value} onClick={() => onMonthsChange(value)}>{value} tháng</button>)}</div></header>
    <div className={styles.chartGrid}>
      <article className={styles.chartCard}><header><span><LineChart /></span><div><h3>Biến động đơn hàng</h3><p>Số yêu cầu mua hộ được tạo theo tháng</p></div>{analytics && <b>{total} đơn</b>}</header><ChartState loading={loading} error={error} empty={!hasOrders} onRetry={onRetry} />{!loading && !error && hasOrders && <LineTrend monthly={monthly} />}</article>
      <article className={styles.chartCard}><header><span><BarChart3 /></span><div><h3>Giá trị tham khảo theo tháng</h3><p>Giá sản phẩm × số lượng, đơn vị CNY</p></div>{analytics && <b>{analytics.totals.reference_value_cny === null ? "—" : `${formatCny(analytics.totals.reference_value_cny)} CNY`}</b>}</header><ChartState loading={loading} error={error} empty={!hasValue} onRetry={onRetry} />{!loading && !error && hasValue && <><ValueBars monthly={monthly} />{Number(analytics.totals.unknown_item_count) > 0 && <p className={styles.dataCaveat}>Có {analytics.totals.unknown_item_count} mặt hàng chưa xác định giá; tổng trong kỳ chỉ gồm phần đã biết.</p>}</>}</article>
      <article className={styles.chartCard}><header><span><PieChart /></span><div><h3>Phân bổ trạng thái đơn</h3><p>Trong {months} tháng đang chọn</p></div></header><ChartState loading={loading} error={error} empty={!hasOrders} onRetry={onRetry} />{!loading && !error && hasOrders && <StatusDonut distribution={analytics.status_distribution} total={total} />}</article>
    </div>
  </section>;
}

