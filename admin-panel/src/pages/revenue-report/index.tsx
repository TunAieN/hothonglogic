import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Drawer,
  Empty,
  Select,
  Skeleton,
  Table,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { TablePaginationConfig } from "antd";
import type { ColumnsType, SorterResult } from "antd/es/table/interface";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import {
  BarChartOutlined,
  DownloadOutlined,
  FileSearchOutlined,
  LineChartOutlined,
  ReloadOutlined,
  RiseOutlined,
  ShoppingCartOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { formatVnd } from "../../shared/utils/currency";
import {
  fetchRevenueReport,
  fetchRevenueReportDrilldown,
  fetchVnWarehouses,
  type RevenueDetailRow,
  type RevenueDrilldownItem,
  type RevenueGroupBy,
  type RevenueMetric,
  type RevenueReport,
  type RevenueReportInput,
  type VnWarehouseOption,
} from "./api";
import "./revenue-report.css";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

type RangePreset = "today" | "7d" | "30d" | "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "custom";
type DateRange = [Dayjs, Dayjs];

const API_DATE_FORMAT = "YYYY-MM-DD";
const DISPLAY_DATE_FORMAT = "DD/MM/YYYY";

const rangeOptions: Array<{ label: string; value: RangePreset }> = [
  { label: "Hôm nay", value: "today" },
  { label: "7 ngày gần nhất", value: "7d" },
  { label: "30 ngày gần nhất", value: "30d" },
  { label: "Tháng này", value: "thisMonth" },
  { label: "Tháng trước", value: "lastMonth" },
  { label: "Quý này", value: "thisQuarter" },
  { label: "Năm nay", value: "thisYear" },
  { label: "Tùy chỉnh", value: "custom" },
];

const groupOptions: Array<{ label: string; value: RevenueGroupBy }> = [
  { label: "Ngày", value: "DAY" },
  { label: "Tuần", value: "WEEK" },
  { label: "Tháng", value: "MONTH" },
  { label: "Quý", value: "QUARTER" },
  { label: "Năm", value: "YEAR" },
];

const getRangeByPreset = (preset: RangePreset): DateRange => {
  const today = dayjs();

  switch (preset) {
    case "today":
      return [today.startOf("day"), today.endOf("day")];
    case "7d":
      return [today.subtract(6, "day").startOf("day"), today.endOf("day")];
    case "thisMonth":
      return [today.startOf("month"), today.endOf("day")];
    case "lastMonth": {
      const lastMonth = today.subtract(1, "month");
      return [lastMonth.startOf("month"), lastMonth.endOf("month")];
    }
    case "thisQuarter":
      return [today.month(Math.floor(today.month() / 3) * 3).startOf("month"), today.endOf("day")];
    case "thisYear":
      return [today.startOf("year"), today.endOf("day")];
    case "30d":
    case "custom":
    default:
      return [today.subtract(29, "day").startOf("day"), today.endOf("day")];
  }
};

const compactNumber = (value?: number | null) => Math.round(Number(value ?? 0)).toLocaleString("vi-VN");
const formatMoney = (value?: number | null) => (value === null || value === undefined ? "Chưa có dữ liệu" : formatVnd(value));
const formatPercent = (value?: number | null) =>
  value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

const htmlEscape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const metricTone = (metric: RevenueMetric) =>
  metric.changePercent === null ? "neutral" : metric.changePercent >= 0 ? "up" : "down";

const MiniSparkline = ({ values, color }: { values: number[]; color: string }) => {
  const width = 150;
  const height = 38;
  const max = Math.max(...values, 1);
  const points = values.length ? values : [0];
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const path = points
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="revenue-report__sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={color} opacity="0.1" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
};

const KpiCard = ({
  label,
  metric,
  caption,
  icon,
  color,
  sparkline,
  isCount = false,
}: {
  label: string;
  metric: RevenueMetric;
  caption?: string;
  icon: React.ReactNode;
  color: string;
  sparkline: number[];
  isCount?: boolean;
}) => {
  const tone = metricTone(metric);

  return (
    <Card className="revenue-report__kpi-card">
      <div className="revenue-report__kpi-top">
        <Text>{label}</Text>
        <span className="revenue-report__kpi-icon" style={{ color, backgroundColor: `${color}18` }}>
          {icon}
        </span>
      </div>
      <strong>{isCount ? compactNumber(metric.current) : formatMoney(metric.current)}</strong>
      <span className={`revenue-report__metric-change revenue-report__metric-change--${tone}`}>
        {formatPercent(metric.changePercent)} so với kỳ trước
      </span>
      {caption ? <small>{caption}</small> : null}
      <MiniSparkline values={sparkline} color={color} />
    </Card>
  );
};

const RevenueLineChart = ({ report }: { report?: RevenueReport }) => {
  const data = report?.timeline ?? [];
  const width = 760;
  const height = 280;
  const max = Math.max(...data.flatMap((point) => [point.revenue, point.previousRevenue]), 1);
  const grid = [1, 0.75, 0.5, 0.25, 0];
  const pathFor = (selector: (point: (typeof data)[number]) => number) =>
    data
      .map((point, index) => {
        const x = data.length > 1 ? (width / (data.length - 1)) * index : width / 2;
        const y = height - (selector(point) / max) * height;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  if (!data.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu doanh thu trong khoảng thời gian này." />;
  }

  return (
    <div className="revenue-report__line-chart" role="img" aria-label="Biểu đồ doanh thu theo thời gian">
      <svg viewBox={`0 0 ${width + 78} ${height + 64}`} preserveAspectRatio="none">
        {grid.map((ratio) => {
          const y = 18 + height * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1="64" x2={width + 64} y1={y} y2={y} className="revenue-report__grid-line" />
              <text x="0" y={y + 4} className="revenue-report__axis-label">
                {compactNumber(max * ratio)}
              </text>
            </g>
          );
        })}
        <path d={`${pathFor((point) => point.revenue)} L${width},${height} L0,${height} Z`} transform="translate(64 18)" className="revenue-report__area-path" />
        <path d={pathFor((point) => point.previousRevenue)} transform="translate(64 18)" className="revenue-report__previous-path" />
        <path d={pathFor((point) => point.revenue)} transform="translate(64 18)" className="revenue-report__current-path" />
        {data.map((point, index) => {
          const x = 64 + (data.length > 1 ? (width / (data.length - 1)) * index : width / 2);
          const y = 18 + height - (point.revenue / max) * height;
          const showLabel = data.length <= 16 || index % Math.ceil(data.length / 10) === 0 || index === data.length - 1;

          return (
            <g key={point.periodKey}>
              <circle cx={x} cy={y} r="4" className="revenue-report__current-dot" />
              <title>{`${point.label}\nDoanh thu: ${formatMoney(point.revenue)}\nKỳ trước: ${formatMoney(point.previousRevenue)}\nTăng: ${formatPercent(point.changePercent)}`}</title>
              {showLabel ? (
                <text x={x} y={height + 52} textAnchor="middle" className="revenue-report__axis-label">
                  {point.label.replace("/202", "/2")}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const WarehouseDonut = ({ report, onSelectWarehouse }: { report?: RevenueReport; onSelectWarehouse: (id: string) => void }) => {
  const data = report?.warehouses ?? [];
  const total = data.reduce((sum, item) => sum + item.revenue, 0);
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const colors = ["#1677ff", "#52c783", "#f6b84f", "#9d5cff", "#ef6f6c"];

  if (!data.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu theo kho." />;
  }

  return (
    <div className="revenue-report__donut-layout">
      <div className="revenue-report__donut">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} className="revenue-report__donut-bg" />
          {data.map((item, index) => {
            const dash = total > 0 ? (item.revenue / total) * circumference : 0;
            const currentOffset = data
              .slice(0, index)
              .reduce(
                (sum, previousItem) =>
                  sum + (total > 0 ? (previousItem.revenue / total) * circumference : 0),
                0,
              );
            return (
              <circle
                key={item.warehouseId}
                cx="60"
                cy="60"
                r={radius}
                stroke={colors[index % colors.length]}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-currentOffset}
                className="revenue-report__donut-slice"
              />
            );
          })}
        </svg>
        <div className="revenue-report__donut-center">
          <strong>{formatMoney(total)}</strong>
          <span>Tổng doanh thu</span>
        </div>
      </div>
      <div className="revenue-report__donut-legend">
        {data.map((item, index) => (
          <button key={item.warehouseId} type="button" onClick={() => onSelectWarehouse(item.warehouseId)}>
            <span style={{ backgroundColor: colors[index % colors.length] }} />
            <em>{item.warehouseName}</em>
            <strong>{item.percent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</strong>
            <small>{formatMoney(item.revenue)}</small>
          </button>
        ))}
      </div>
    </div>
  );
};

const ServiceBreakdown = ({ report }: { report?: RevenueReport }) => {
  const data = report?.services ?? [];

  if (!data.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu theo loại dịch vụ." />;
  }

  return (
    <div className="revenue-report__service-list">
      {data.map((item, index) => (
        <div key={item.serviceType} className="revenue-report__service-row">
          <div>
            <strong>{item.serviceName}</strong>
            <span>{formatMoney(item.revenue)}</span>
          </div>
          <em>{item.percent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</em>
          <div className="revenue-report__service-bar">
            <span style={{ width: `${item.percent}%`, backgroundColor: ["#1677ff", "#52c783", "#f6b84f", "#9d5cff"][index % 4] }} />
          </div>
        </div>
      ))}
    </div>
  );
};

export const RevenueReportPage = () => {
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [range, setRange] = useState<DateRange>(() => getRangeByPreset("30d"));
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<RevenueGroupBy>("DAY");
  const [revenueType, setRevenueType] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState("period");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [warehouses, setWarehouses] = useState<VnWarehouseOption[]>([]);
  const [report, setReport] = useState<RevenueReport>();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<RevenueDetailRow | null>(null);
  const [drilldownRows, setDrilldownRows] = useState<RevenueDrilldownItem[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  const input = useMemo<RevenueReportInput>(
    () => ({
      warehouseId,
      dateFrom: range[0].format(API_DATE_FORMAT),
      dateTo: range[1].format(API_DATE_FORMAT),
      groupBy,
      revenueType,
      detailPage: page,
      detailPageSize: pageSize,
      detailSortField: sortField,
      detailSortDirection: sortDirection,
    }),
    [groupBy, page, pageSize, range, revenueType, sortDirection, sortField, warehouseId],
  );

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextReport, nextWarehouses] = await Promise.all([fetchRevenueReport(input), fetchVnWarehouses()]);
      setReport(nextReport);
      setWarehouses(nextWarehouses);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tải báo cáo doanh thu.");
    } finally {
      setLoading(false);
    }
  }, [input]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const serviceOptions = useMemo(
    () => [
      { label: "Tất cả", value: "all" },
      ...(report?.services ?? []).map((service) => ({ label: service.serviceName, value: service.serviceType })),
    ],
    [report?.services],
  );

  const kpiSparkline = report?.timeline.map((point) => point.revenue) ?? [];
  const canRenderReport = Boolean(report);
  const warehouseOptions = [{ label: "Tất cả kho", value: "all" }, ...warehouses.map((warehouse) => ({ label: warehouse.name, value: warehouse.id }))];

  const openDrilldown = async (row: RevenueDetailRow) => {
    setSelectedRow(row);
    setDrawerOpen(true);
    setDrilldownLoading(true);
    try {
      setDrilldownRows(await fetchRevenueReportDrilldown({ ...input, detailPage: undefined, detailPageSize: undefined }, row.periodKey));
    } catch {
      message.error("Không thể tải chi tiết doanh thu.");
    } finally {
      setDrilldownLoading(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const exportReport = await fetchRevenueReport({ ...input, detailPage: 1, detailPageSize: 1000 });
      const warehouseName = warehouseId ? warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? warehouseId : "Tất cả kho";
      const rows = [
        ["Khoảng thời gian", `${range[0].format(DISPLAY_DATE_FORMAT)} - ${range[1].format(DISPLAY_DATE_FORMAT)}`],
        ["Kho", warehouseName],
        ["Tổng doanh thu", exportReport.summary.revenue.current ?? 0],
        ["Đã thu", exportReport.summary.paid.current ?? 0],
        ["Chi phí", "Chưa có dữ liệu"],
        ["Lợi nhuận", "Chưa có dữ liệu"],
        ["Số đơn", exportReport.summary.orders.current ?? 0],
      ];
      const detailRows = exportReport.details.map((row) => [
        row.label,
        row.orderCount,
        row.revenue,
        row.paid,
        row.shippingFee ?? "",
        row.surcharge ?? "",
        row.cost ?? "Chưa có dữ liệu",
        row.profit ?? "Chưa có dữ liệu",
      ]);
      const html = `
        <html><head><meta charset="utf-8" /></head><body>
          <table>${rows.map((row) => `<tr><td>${htmlEscape(row[0])}</td><td>${htmlEscape(row[1])}</td></tr>`).join("")}</table>
          <br />
          <table>
            <tr><th>Thời gian</th><th>Số đơn</th><th>Doanh thu</th><th>Đã thu</th><th>Phí vận chuyển</th><th>Phụ phí</th><th>Chi phí</th><th>Lợi nhuận</th></tr>
            ${detailRows.map((row) => `<tr>${row.map((cell) => `<td>${htmlEscape(cell)}</td>`).join("")}</tr>`).join("")}
          </table>
        </body></html>`;
      const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bao-cao-doanh-thu-${input.dateFrom}-${input.dateTo}.xls`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<RevenueDetailRow> = [
    { title: "Thời gian", dataIndex: "label", sorter: true, fixed: "left", width: 150 },
    { title: "Đơn hàng", dataIndex: "orderCount", sorter: true, align: "right", width: 120, render: compactNumber },
    { title: "Doanh thu", dataIndex: "revenue", sorter: true, align: "right", width: 150, render: formatMoney },
    { title: "Đã thu", dataIndex: "paid", sorter: true, align: "right", width: 150, render: formatMoney },
    { title: "Phí vận chuyển", dataIndex: "shippingFee", align: "right", width: 160, render: formatMoney },
    { title: "Phụ phí", dataIndex: "surcharge", align: "right", width: 130, render: formatMoney },
    { title: "Chi phí", dataIndex: "cost", align: "right", width: 140, render: formatMoney },
    { title: "Lợi nhuận", dataIndex: "profit", align: "right", width: 140, render: formatMoney },
    {
      title: "",
      key: "action",
      width: 72,
      render: (_, row) => (
        <Tooltip title="Xem nguồn doanh thu">
          <Button icon={<FileSearchOutlined />} onClick={() => openDrilldown(row)} />
        </Tooltip>
      ),
    },
  ];

  const onTableChange = (pagination: TablePaginationConfig, _: unknown, sorter: SorterResult<RevenueDetailRow> | SorterResult<RevenueDetailRow>[]) => {
    const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    const nextField = String(activeSorter.field ?? "period");
    const sortFieldMap: Record<string, string> = {
      label: "period",
      orderCount: "orders",
      revenue: "revenue",
      paid: "paid",
    };
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 10);
    setSortField(sortFieldMap[nextField] ?? "period");
    setSortDirection(activeSorter.order === "ascend" ? "asc" : "desc");
  };

  return (
    <div className="revenue-report">
      <div className="revenue-report__header">
        <div>
          <Title level={1}>Báo cáo doanh thu</Title>
          <Text>Thống kê doanh thu theo thời gian và các tiêu chí khác.</Text>
        </div>
        <div className="revenue-report__header-actions">
          <Button icon={<DownloadOutlined />} onClick={exportExcel} loading={exporting}>
            Xuất Excel
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadReport} />
        </div>
      </div>

      <Card className="revenue-report__filter-card">
        <Select value={warehouseId ?? "all"} options={warehouseOptions} onChange={(value) => setWarehouseId(value === "all" ? null : value)} />
        <Select
          value={rangePreset}
          options={rangeOptions}
          onChange={(value) => {
            setRangePreset(value);
            if (value !== "custom") setRange(getRangeByPreset(value));
          }}
        />
        <RangePicker
          value={range}
          format={DISPLAY_DATE_FORMAT}
          allowClear={false}
          disabled={rangePreset !== "custom"}
          onChange={(value) => value?.[0] && value[1] && setRange([value[0].startOf("day"), value[1].endOf("day")])}
        />
        <Select value={groupBy} options={groupOptions} onChange={setGroupBy} />
        <Select value={revenueType ?? "all"} options={serviceOptions} onChange={(value) => setRevenueType(value === "all" ? null : value)} />
        <Button type="primary" onClick={loadReport}>Lọc dữ liệu</Button>
        <Button
          onClick={() => {
            setWarehouseId(null);
            setRangePreset("30d");
            setRange(getRangeByPreset("30d"));
            setGroupBy("DAY");
            setRevenueType(null);
            setPage(1);
          }}
        >
          Đặt lại
        </Button>
      </Card>

      {error ? (
        <Alert className="revenue-report__error" type="error" showIcon message="Không thể tải báo cáo doanh thu." description={error} action={<Button onClick={loadReport}>Thử lại</Button>} />
      ) : null}

      {loading ? (
        <div className="revenue-report__kpi-grid">{Array.from({ length: 5 }).map((_, index) => <Card key={index}><Skeleton active paragraph={{ rows: 2 }} /></Card>)}</div>
      ) : canRenderReport ? (
        <div className="revenue-report__kpi-grid">
          <KpiCard label="Doanh thu" metric={report!.summary.revenue} icon={<RiseOutlined />} color="#1677ff" sparkline={kpiSparkline} />
          <KpiCard label="Đã thu" metric={report!.summary.paid} icon={<WalletOutlined />} color="#3bbb6e" sparkline={kpiSparkline} caption={`${report!.summary.paidRate?.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) ?? "—"}% doanh thu`} />
          <KpiCard label="Chi phí" metric={report!.summary.cost} icon={<BarChartOutlined />} color="#ff6b6b" sparkline={[0]} caption="Chưa có bảng chi phí thực tế" />
          <KpiCard label="Đơn hàng" metric={report!.summary.orders} icon={<ShoppingCartOutlined />} color="#f5a623" sparkline={kpiSparkline} isCount />
          <KpiCard label="Lợi nhuận" metric={report!.summary.profit} icon={<LineChartOutlined />} color="#9d5cff" sparkline={[0]} caption="Chưa đủ dữ liệu chi phí" />
        </div>
      ) : (
        <Card>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu báo cáo để hiển thị." />
        </Card>
      )}

      <div className="revenue-report__chart-grid">
        <Card title="Doanh thu theo thời gian" extra={<span className="revenue-report__legend"><i /> Doanh thu <b /> Kỳ trước</span>}>
          {loading ? <Skeleton.Node active className="revenue-report__chart-skeleton" /> : <RevenueLineChart report={report} />}
        </Card>
        <Card title="Doanh thu theo kho">
          {loading ? <Skeleton active paragraph={{ rows: 6 }} /> : <WarehouseDonut report={report} onSelectWarehouse={(id) => setWarehouseId(id === "0" ? null : id)} />}
        </Card>
      </div>

      <div className="revenue-report__bottom-grid">
        <Card title="Chi tiết doanh thu">
          <Table
            rowKey="periodKey"
            loading={loading}
            columns={columns}
            dataSource={report?.details ?? []}
            scroll={{ x: 1200 }}
            pagination={{ current: page, pageSize, total: report?.detailPagination.total ?? 0, showSizeChanger: true }}
            onChange={onTableChange}
            locale={{ emptyText: "Chưa có dữ liệu doanh thu trong khoảng thời gian này." }}
          />
        </Card>
        <Card title="Doanh thu theo loại dịch vụ">
          {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : <ServiceBreakdown report={report} />}
        </Card>
      </div>

      {report?.notes?.length ? <Alert className="revenue-report__notes" type="info" showIcon message={report.notes.join(" ")} /> : null}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={`Chi tiết doanh thu ${selectedRow?.label ?? ""}`} width={520}>
        {drilldownLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : drilldownRows.length ? (
          <div className="revenue-report__drilldown-list">
            <div className="revenue-report__drilldown-summary">
              <strong>{compactNumber(selectedRow?.orderCount)} đơn hàng</strong>
              <span>{formatMoney(selectedRow?.revenue)}</span>
            </div>
            {drilldownRows.map((item) => (
              <div key={`${item.invoiceId}-${item.orderId ?? ""}`} className="revenue-report__drilldown-item">
                <strong>{item.invoiceCode}</strong>
                <span>{item.orderCode ?? item.voucherCode ?? "—"}</span>
                <em>{item.customerName ?? "Chưa xác định khách hàng"}</em>
                <b>{formatMoney(item.revenue)}</b>
              </div>
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có hóa đơn trong kỳ này." />
        )}
      </Drawer>
    </div>
  );
};
