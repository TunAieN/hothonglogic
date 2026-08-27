import { useMemo, useState } from "react";
import { useList } from "@refinedev/core";
import { Alert, Avatar, Button, Card, DatePicker, Empty, Select, Skeleton, Tooltip, Typography } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { Link, useNavigate } from "react-router";
import {
  AlertOutlined,
  BankOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  InboxOutlined,
  PlusOutlined,
  ProfileOutlined,
  RightOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import type { CnBatch, CnPackage, Customer, OrderSummary } from "../../shared/types";
import { formatVnd, toNumber } from "../../shared/utils/currency";
import "./dashboard.css";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const DATE_FORMAT = "DD/MM/YYYY";
const API_DATE_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";
const DASHBOARD_PAGE_SIZE = 1000;

type RangeKey = "7d" | "30d" | "thisMonth" | "lastMonth";
type DateRange = [Dayjs, Dayjs];

type KpiItem = {
  key: string;
  label: string;
  value: string;
  caption?: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "purple" | "orange" | "cyan";
};

type StatusSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type RevenuePoint = {
  label: string;
  value: number;
};

type WarehouseRow = {
  key: string;
  warehouse: string;
  inbound: number;
  outbound: number;
  inventory: number;
  warning: string;
};

type CustomerRow = {
  key: string;
  name: string;
  avatar?: string | null;
  totalOrders: number;
  revenue: number;
};

type AlertItem = {
  key: string;
  title: string;
  description: string;
  tone: "danger" | "warning" | "info" | "success";
  route?: string;
};

const rangeOptions: Array<{ label: string; value: RangeKey }> = [
  { label: "7 ngày qua", value: "7d" },
  { label: "30 ngày qua", value: "30d" },
  { label: "Tháng này", value: "thisMonth" },
  { label: "Tháng trước", value: "lastMonth" },
];

const getRangeByKey = (key: RangeKey): DateRange => {
  const today = dayjs();

  switch (key) {
    case "30d":
      return [today.subtract(29, "day").startOf("day"), today.endOf("day")];
    case "thisMonth":
      return [today.startOf("month"), today.endOf("day")];
    case "lastMonth": {
      const lastMonth = today.subtract(1, "month");
      return [lastMonth.startOf("month"), lastMonth.endOf("month")];
    }
    case "7d":
    default:
      return [today.subtract(6, "day").startOf("day"), today.endOf("day")];
  }
};

const normalizeStatus = (value?: string | null) => String(value ?? "").trim().toLowerCase();

const statusLabels: Record<string, string> = {
  delivered: "Đã giao hàng",
  completed: "Hoàn thành",
  shipped: "Đang vận chuyển",
  receiving: "Đang vận chuyển",
  waiting_cn_warehouse: "Chờ lấy hàng",
  awaiting_tracking: "Chờ lấy hàng",
  pending: "Chờ xử lý",
  cancelled: "Đã hủy",
  rejected: "Đã hủy",
  complaint: "Hoàn hàng",
};

const statusColors: Record<string, string> = {
  delivered: "#4f7df3",
  completed: "#4f7df3",
  shipped: "#5ecf86",
  receiving: "#5ecf86",
  waiting_cn_warehouse: "#86c5cc",
  awaiting_tracking: "#86c5cc",
  pending: "#86c5cc",
  cancelled: "#f4777d",
  rejected: "#f4777d",
  complaint: "#f39b59",
};

const compactNumber = (value: number) =>
  Math.round(value).toLocaleString("vi-VN", { maximumFractionDigits: 0 });

const compactWeight = (value: number) => `${compactNumber(value)} kg`;

const formatShortMoney = (value: number) => {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  }

  if (value >= 1_000_000) {
    return `${Math.round(value / 1_000_000).toLocaleString("vi-VN")}M`;
  }

  return compactNumber(value);
};

const getOrderRevenue = (order: OrderSummary) => toNumber(order.product_total_vnd);

const getReceivable = (order: OrderSummary) => toNumber(order.deposit_remaining_amount_vnd);

const getShipmentCount = (packagesTotal?: number, packagesLength?: number) => packagesTotal ?? packagesLength ?? 0;

const createPath = (points: RevenuePoint[], width: number, height: number) => {
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;

  return points
    .map((point, index) => {
      const x = index * step;
      const y = height - (point.value / maxValue) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
};

const cardHeaderIconMap = {
  warehouse: <BankOutlined />,
  customers: <TeamOutlined />,
  alerts: <AlertOutlined />,
} as const;

const DashboardCardHeader = ({
  icon,
  title,
  to,
}: {
  icon: keyof typeof cardHeaderIconMap;
  title: string;
  to: string;
}) => (
  <div className="dashboard-page__card-header dashboard-page__compact-card-header">
    <div className="dashboard-page__card-title-wrap">
      <span className="dashboard-page__card-title-icon">{cardHeaderIconMap[icon]}</span>
      <Title level={2}>{title}</Title>
    </div>
    <Link className="dashboard-page__view-all-link" to={to}>
      {"Xem tất cả"} <RightOutlined />
    </Link>
  </div>
);

const CompactEmpty = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <div className="dashboard-page__compact-empty">
    <span>{icon}</span>
    <p>{text}</p>
  </div>
);

const SkeletonRows = ({ count = 4 }: { count?: number }) => (
  <div className="dashboard-page__skeleton-rows" aria-hidden="true">
    {Array.from({ length: count }).map((_, index) => (
      <div className="dashboard-page__skeleton-row" key={index}>
        <Skeleton.Input active size="small" />
      </div>
    ))}
  </div>
);

const avatarTones = [
  { background: "#eef2ff", color: "#4f46e5" },
  { background: "#f3e8ff", color: "#7c3aed" },
  { background: "#e8f8ef", color: "#16a34a" },
  { background: "#eaf4ff", color: "#1877f2" },
  { background: "#fff3e6", color: "#d46b08" },
];

const getAvatarTone = (name: string) => {
  const total = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return avatarTones[total % avatarTones.length];
};

const getInitial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

const CustomerAvatar = ({ name, src }: { name: string; src?: string | null }) => {
  const tone = getAvatarTone(name);

  return (
    <Avatar
      src={src || undefined}
      size={28}
      className="dashboard-page__customer-avatar"
      style={src ? undefined : tone}
      icon={src ? undefined : <UserOutlined />}
      aria-label={`Khách hàng ${name}`}
    >
      {src ? null : getInitial(name)}
    </Avatar>
  );
};
const DashboardHeader = ({
  range,
  rangeKey,
  onRangeChange,
  onRangeKeyChange,
}: {
  range: DateRange;
  rangeKey: RangeKey;
  onRangeChange: (range: DateRange) => void;
  onRangeKeyChange: (rangeKey: RangeKey) => void;
}) => (
  <div className="dashboard-page__header">
    <div>
      <Title level={1} className="dashboard-page__title">
        {"Tổng quan"}
      </Title>
      <Text className="dashboard-page__description">
        {"Cập nhật tình hình hoạt động của hệ thống Logistics Pro"}
      </Text>
    </div>

    <div className="dashboard-page__filters">
      <RangePicker
        value={range}
        format={DATE_FORMAT}
        allowClear={false}
        suffixIcon={<CalendarOutlined />}
        onChange={(value) => {
          if (value?.[0] && value[1]) {
            onRangeChange([value[0].startOf("day"), value[1].endOf("day")]);
          }
        }}
      />
      <Select<RangeKey>
        value={rangeKey}
        options={rangeOptions}
        className="dashboard-page__range-select"
        onChange={(value) => {
          onRangeKeyChange(value);
          onRangeChange(getRangeByKey(value));
        }}
      />
    </div>
  </div>
);

const KpiCard = ({ item }: { item: KpiItem }) => (
  <Card className="dashboard-page__kpi-card">
    <div className={`dashboard-page__kpi-icon dashboard-page__kpi-icon--${item.tone}`}>{item.icon}</div>
    <div className="dashboard-page__kpi-copy">
      <Text className="dashboard-page__kpi-label">{item.label}</Text>
      <div className="dashboard-page__kpi-value">{item.value}</div>
      {item.caption ? <Text className="dashboard-page__kpi-caption">{item.caption}</Text> : null}
    </div>
  </Card>
);

const DashboardSkeleton = () => (
  <div className="dashboard-page__skeleton-grid">
    {Array.from({ length: 5 }).map((_, index) => (
      <Card key={index} className="dashboard-page__card">
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    ))}
  </div>
);

const RevenueChart = ({ data, loading }: { data: RevenuePoint[]; loading: boolean }) => {
  const width = 640;
  const height = 220;
  const chartData = data.length > 0 ? data : [];
  const maxValue = Math.max(...chartData.map((point) => point.value), 1);
  const path = chartData.length > 0 ? createPath(chartData, width, height) : "";
  const gridValues = [1, 0.75, 0.5, 0.25, 0];

  return (
    <Card className="dashboard-page__card dashboard-page__revenue-card">
      <div className="dashboard-page__card-header">
        <Title level={2}>{"Doanh thu theo ngày"}</Title>
        <Text>{"Khoảng thời gian đang chọn"}</Text>
      </div>

      {loading ? (
        <Skeleton.Node active className="dashboard-page__chart-skeleton" />
      ) : chartData.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={"Chưa có dữ liệu doanh thu trong kỳ"} />
      ) : (
        <div className="dashboard-page__line-chart" role="img" aria-label="Biểu đồ doanh thu theo ngày">
          <svg viewBox={`0 0 ${width + 72} ${height + 56}`} preserveAspectRatio="none">
            {gridValues.map((ratio) => {
              const y = 18 + height * (1 - ratio);
              return (
                <g key={ratio}>
                  <line x1="56" x2={width + 56} y1={y} y2={y} className="dashboard-page__grid-line" />
                  <text x="0" y={y + 4} className="dashboard-page__axis-label">
                    {formatShortMoney(maxValue * ratio)}
                  </text>
                </g>
              );
            })}
            <path d={path} transform="translate(56 18)" className="dashboard-page__line-path" />
            {chartData.map((point, index) => {
              const x = 56 + (chartData.length > 1 ? (width / (chartData.length - 1)) * index : width / 2);
              const y = 18 + height - (point.value / maxValue) * height;
              return (
                <g key={point.label}>
                  <circle cx={x} cy={y} r="4" className="dashboard-page__line-dot" />
                  <title>{`${point.label}: ${formatVnd(point.value)}`}</title>
                  <text x={x} y={height + 48} textAnchor="middle" className="dashboard-page__axis-label">
                    {point.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </Card>
  );
};

const ShipmentStatusChart = ({ data, total, loading }: { data: StatusSlice[]; total: number; loading: boolean }) => {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;

  const slicesWithOffset = data.map((slice, index) => {
    const dash = total > 0 ? (slice.value / total) * circumference : 0;
    const strokeOffset = data
      .slice(0, index)
      .reduce((sum, previousSlice) => sum + (total > 0 ? (previousSlice.value / total) * circumference : 0), 0);

    return { ...slice, dash, strokeOffset };
  });
  return (
    <Card className="dashboard-page__card dashboard-page__status-card">
      <div className="dashboard-page__card-header">
        <Title level={2}>{"Cơ cấu vận đơn"}</Title>
        <Text>{"Theo trạng thái đơn hàng"}</Text>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : data.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={"Chưa có dữ liệu trạng thái"} />
      ) : (
        <div className="dashboard-page__donut-wrap">
          <div className="dashboard-page__donut" role="img" aria-label="Biểu đồ cơ cấu vận đơn">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={radius} className="dashboard-page__donut-bg" />
              {slicesWithOffset.map((slice) => (
                <circle
                  key={slice.key}
                  cx="60"
                  cy="60"
                  r={radius}
                  className="dashboard-page__donut-slice"
                  stroke={slice.color}
                  strokeDasharray={`${slice.dash} ${circumference - slice.dash}`}
                  strokeDashoffset={-slice.strokeOffset}
                />
              ))}
            </svg>
            <div className="dashboard-page__donut-center">
              <strong>{compactNumber(total)}</strong>
              <span>{"Tổng vận đơn"}</span>
            </div>
          </div>

          <div className="dashboard-page__legend-list">
            {data.map((slice) => (
              <div className="dashboard-page__legend-row" key={slice.key}>
                <span className="dashboard-page__legend-dot" style={{ backgroundColor: slice.color }} />
                <span>{slice.label}</span>
                <strong>{compactNumber(slice.value)}</strong>
                <em>{((slice.value / total) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</em>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

const WarehouseActivityCard = ({ rows, loading }: { rows: WarehouseRow[]; loading: boolean }) => (
  <Card className="dashboard-page__card dashboard-page__operation-card dashboard-page__warehouse-card">
    <DashboardCardHeader icon="warehouse" title={"Hoạt động kho hàng"} to="/china-warehouse" />
    <div className="dashboard-page__operation-body">
      {loading ? (
        <SkeletonRows count={4} />
      ) : rows.length === 0 ? (
        <CompactEmpty icon={<BankOutlined />} text={"Chưa có dữ liệu kho hàng"} />
      ) : (
        <div className="dashboard-page__compact-table-wrap">
          <table className="dashboard-page__compact-table dashboard-page__warehouse-table">
            <colgroup>
              <col style={{ width: "36%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "18%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>{"Kho hàng"}</th>
                <th className="dashboard-page__number-cell">{"Tổng đơn nhập"}</th>
                <th className="dashboard-page__number-cell">{"Tổng đơn xuất"}</th>
                <th className="dashboard-page__number-cell">{"Tồn kho"}</th>
                <th>{"Cảnh báo"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isNeutral = row.warning === "Ổn định";

                return (
                  <tr key={row.key}>
                    <td>
                      <Tooltip title={row.warehouse}>
                        <span className="dashboard-page__ellipsis">{row.warehouse}</span>
                      </Tooltip>
                    </td>
                    <td className="dashboard-page__number-cell">{compactNumber(row.inbound)}</td>
                    <td className="dashboard-page__number-cell">{compactNumber(row.outbound)}</td>
                    <td className="dashboard-page__number-cell">{compactNumber(row.inventory)}</td>
                    <td>
                      <span className={`dashboard-page__warning-badge ${isNeutral ? "dashboard-page__warning-badge--neutral" : ""}`}>
                        {row.warning}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </Card>
);

const TopCustomersCard = ({ rows, loading }: { rows: CustomerRow[]; loading: boolean }) => (
  <Card className="dashboard-page__card dashboard-page__operation-card dashboard-page__customers-card">
    <DashboardCardHeader icon="customers" title={"Top khách hàng"} to="/customers" />
    <div className="dashboard-page__operation-body">
      {loading ? (
        <SkeletonRows count={5} />
      ) : rows.length === 0 ? (
        <CompactEmpty icon={<TeamOutlined />} text={"Chưa có dữ liệu khách hàng"} />
      ) : (
        <table className="dashboard-page__compact-table dashboard-page__customers-table">
          <colgroup>
            <col style={{ width: "55%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "25%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>{"Khách hàng"}</th>
              <th className="dashboard-page__number-cell">{"Tổng đơn hàng"}</th>
              <th className="dashboard-page__number-cell">Doanh thu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <div className="dashboard-page__customer-cell">
                    <CustomerAvatar name={row.name} src={row.avatar} />
                    <Tooltip title={row.name}>
                      <span className="dashboard-page__ellipsis">{row.name}</span>
                    </Tooltip>
                  </div>
                </td>
                <td className="dashboard-page__number-cell">{compactNumber(row.totalOrders)}</td>
                <td className="dashboard-page__number-cell">{formatVnd(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </Card>
);

const AlertsCard = ({ alerts, loading }: { alerts: AlertItem[]; loading: boolean }) => {
  const navigate = useNavigate();
  const visibleAlerts = alerts.slice(0, 4);
  const iconMap = {
    danger: <ExclamationCircleOutlined />,
    warning: <AlertOutlined />,
    info: <ClockCircleOutlined />,
    success: <CheckCircleOutlined />,
  };

  return (
    <Card className="dashboard-page__card dashboard-page__operation-card dashboard-page__alerts-card">
      <DashboardCardHeader icon="alerts" title={"Cảnh báo"} to="/orders" />
      <div className="dashboard-page__operation-body">
        {loading ? (
          <SkeletonRows count={4} />
        ) : visibleAlerts.length === 0 ? (
          <CompactEmpty icon={<CheckCircleOutlined />} text={"Không có cảnh báo mới"} />
        ) : (
          <div className="dashboard-page__alerts-list">
            {visibleAlerts.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`dashboard-page__alert-row dashboard-page__alert-row--${item.tone}`}
                onClick={() => item.route && navigate(item.route)}
                disabled={!item.route}
              >
                <span className="dashboard-page__alert-icon">{iconMap[item.tone]}</span>
                <span className="dashboard-page__alert-copy">
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                {item.route ? <RightOutlined /> : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

const QuickActions = ({ onNavigate }: { onNavigate: (path: string) => void }) => {
  const actions = [
    {
      key: "create-order",
      title: "Tạo đơn hàng",
      description: "Tạo đơn hàng mới",
      icon: <PlusOutlined />,
      path: "/orders/external/create",
    },
    {
      key: "orders",
      title: "Đơn hàng",
      description: "Theo dõi danh sách đơn",
      icon: <ShoppingCartOutlined />,
      path: "/orders",
    },
    {
      key: "china-warehouse",
      title: "Nhập hàng",
      description: "Nhập hàng từ TQ",
      icon: <InboxOutlined />,
      path: "/china-warehouse",
    },
    {
      key: "payment-vouchers",
      title: "Phiếu thanh toán",
      description: "Quản lý phiếu thu chi",
      icon: <FileTextOutlined />,
      path: "/payment-vouchers",
    },
    {
      key: "shipping-rates",
      title: "Bảng giá cước",
      description: "Xem cấu hình cước",
      icon: <BarChartOutlined />,
      path: "/shipping-rates",
    },
  ];

  return (
    <Card className="dashboard-page__card dashboard-page__quick-card">
      <div className="dashboard-page__card-header">
        <Title level={2}>{"Thao tác nhanh"}</Title>
      </div>
      <div className="dashboard-page__quick-grid">
        {actions.map((action) => (
          <button key={action.key} type="button" className="dashboard-page__quick-action" onClick={() => onNavigate(action.path)}>
            <span>{action.icon}</span>
            <strong>{action.title}</strong>
            <small>{action.description}</small>
          </button>
        ))}
      </div>
    </Card>
  );
};

export const DashboardPage = () => {
  const navigate = useNavigate();
  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const [range, setRange] = useState<DateRange>(() => getRangeByKey("7d"));

  const orderFilters = useMemo(
    () => [
      { field: "created_from", operator: "gte" as const, value: range[0].startOf("day").format(API_DATE_TIME_FORMAT) },
      { field: "created_to", operator: "lte" as const, value: range[1].endOf("day").format(API_DATE_TIME_FORMAT) },
    ],
    [range],
  );

  const { result: ordersResult, query: ordersQuery } = useList<OrderSummary>({
    resource: "orders",
    pagination: { currentPage: 1, pageSize: DASHBOARD_PAGE_SIZE },
    filters: orderFilters,
  });

  const { result: packagesResult, query: packagesQuery } = useList<CnPackage>({
    resource: "cnPackages",
    pagination: { currentPage: 1, pageSize: DASHBOARD_PAGE_SIZE },
  });

  const { result: batchesResult, query: batchesQuery } = useList<CnBatch>({
    resource: "cnBatches",
    pagination: { currentPage: 1, pageSize: DASHBOARD_PAGE_SIZE },
  });

  const { result: customersResult, query: customersQuery } = useList<Customer>({
    resource: "customers",
    pagination: { currentPage: 1, pageSize: DASHBOARD_PAGE_SIZE },
  });

  const orders = useMemo(() => ordersResult.data ?? [], [ordersResult.data]);
  const packages = useMemo(() => packagesResult.data ?? [], [packagesResult.data]);
  const batches = useMemo(() => batchesResult.data ?? [], [batchesResult.data]);
  const customers = useMemo(() => customersResult.data ?? [], [customersResult.data]);
  const isLoading = ordersQuery.isLoading || packagesQuery.isLoading || batchesQuery.isLoading || customersQuery.isLoading;
  const isFetching = ordersQuery.isFetching || packagesQuery.isFetching || batchesQuery.isFetching || customersQuery.isFetching;
  const hasError = ordersQuery.isError || packagesQuery.isError || batchesQuery.isError || customersQuery.isError;

  const revenue = useMemo(() => orders.reduce((sum, order) => sum + getOrderRevenue(order), 0), [orders]);
  const receivable = useMemo(() => orders.reduce((sum, order) => sum + getReceivable(order), 0), [orders]);
  const totalWeight = useMemo(
    () => packages.reduce((sum, item) => sum + toNumber(item.chargeable_weight ?? item.weight), 0),
    [packages],
  );

  const kpis: KpiItem[] = [
    {
      key: "orders",
      label: "Tổng đơn hàng",
      value: compactNumber(ordersResult.total ?? orders.length),
      caption: "Theo bộ lọc thời gian",
      icon: <ProfileOutlined />,
      tone: "blue",
    },
    {
      key: "shipments",
      label: "Vận đơn vận chuyển",
      value: compactNumber(getShipmentCount(packagesResult.total, packages.length)),
      caption: "Từ dữ liệu kiện hàng TQ",
      icon: <FileDoneOutlined />,
      tone: "green",
    },
    {
      key: "weight",
      label: "Tổng cân nặng",
      value: compactWeight(totalWeight),
      caption: "Cân nặng tính cước nếu có",
      icon: <InboxOutlined />,
      tone: "purple",
    },
    {
      key: "revenue",
      label: "Doanh thu",
      value: formatVnd(revenue),
      caption: "Từ tổng tiền VND của đơn",
      icon: <DollarOutlined />,
      tone: "orange",
    },
    {
      key: "receivable",
      label: "Công nợ phải thu",
      value: formatVnd(receivable),
      caption: "Từ tiền cọc còn lại",
      icon: <WalletOutlined />,
      tone: "cyan",
    },
  ];

  const revenueData = useMemo(() => {
    const points = new Map<string, number>();
    let current = range[0].startOf("day");
    const end = range[1].startOf("day");

    while (current.isBefore(end) || current.isSame(end, "day")) {
      points.set(current.format("DD/MM"), 0);
      current = current.add(1, "day");
    }

    orders.forEach((order) => {
      const createdAt = dayjs(order.created_at);
      if (!createdAt.isValid()) return;
      const key = createdAt.format("DD/MM");
      if (points.has(key)) {
        points.set(key, (points.get(key) ?? 0) + getOrderRevenue(order));
      }
    });

    return Array.from(points, ([label, value]) => ({ label, value })).filter((point) => point.value > 0 || points.size <= 14);
  }, [orders, range]);

  const statusSlices = useMemo(() => {
    const grouped = new Map<string, StatusSlice>();

    orders.forEach((order) => {
      const status = normalizeStatus(order.status);
      const label = statusLabels[status] ?? order.status ?? "Khác";
      const color = statusColors[status] ?? "#8ea0b8";
      const current = grouped.get(label);
      grouped.set(label, {
        key: label,
        label,
        color: current?.color ?? color,
        value: (current?.value ?? 0) + 1,
      });
    });

    return Array.from(grouped.values()).filter((slice) => slice.value > 0);
  }, [orders]);

  const warehouseRows = useMemo(() => {
    const rows = new Map<string, WarehouseRow>();
    const outboundStatuses = new Set(["in_batch", "exporting", "shipped", "arrived_vn", "completed"]);
    const closedStatuses = new Set(["completed", "delivered", "cancelled"]);

    packages.forEach((item) => {
      const warehouseName = item.warehouse?.name ?? "Chưa xác định";
      const key = item.warehouse?.id ?? warehouseName;
      const status = normalizeStatus(item.status);
      const current = rows.get(key) ?? {
        key,
        warehouse: warehouseName,
        inbound: 0,
        outbound: 0,
        inventory: 0,
        warning: "Ổn định",
      };

      current.inbound += 1;
      current.outbound += outboundStatuses.has(status) || Boolean(item.current_batch_package) ? 1 : 0;
      current.inventory += closedStatuses.has(status) ? 0 : 1;
      current.warning = current.inventory > 0 ? `${compactNumber(current.inventory)} kiện` : "Ổn định";
      rows.set(key, current);
    });

    return Array.from(rows.values()).slice(0, 5);
  }, [packages]);

  const topCustomers = useMemo(() => {
    const customerMap = new Map<string, CustomerRow>();

    customers.forEach((customer) => {
      customerMap.set(customer.id, {
        key: customer.id,
        name: customer.name,
        avatar: customer.avatar,
        totalOrders: customer.orders_count ?? 0,
        revenue: 0,
      });
    });

    orders.forEach((order) => {
      const customerId = order.customer?.id;
      if (!customerId) return;
      const current = customerMap.get(customerId) ?? {
        key: customerId,
        name: order.customer?.name ?? "Khách hàng chưa xác định",
        avatar: order.customer?.avatar,
        totalOrders: 0,
        revenue: 0,
      };
      current.totalOrders += customerMap.has(customerId) ? 0 : 1;
      current.revenue += getOrderRevenue(order);
      customerMap.set(customerId, current);
    });

    return Array.from(customerMap.values())
      .filter((customer) => customer.totalOrders > 0 || customer.revenue > 0)
      .sort((first, second) => second.revenue - first.revenue || second.totalOrders - first.totalOrders)
      .slice(0, 5);
  }, [customers, orders]);

  const alerts = useMemo<AlertItem[]>(() => {
    const cancelledOrders = orders.filter((order) => ["cancelled", "rejected"].includes(normalizeStatus(order.status))).length;
    const unpaidOrders = orders.filter((order) => getReceivable(order) > 0).length;
    const delayedBatches = batches.filter((batch) => {
      if (!batch.expected_arrival_at || ["completed", "cancelled"].includes(normalizeStatus(batch.status))) return false;
      return dayjs(batch.expected_arrival_at).isBefore(dayjs(), "day");
    }).length;
    const stockWarnings = warehouseRows.filter((row) => row.inventory > 0).length;

    const nextAlerts: AlertItem[] = [];

    if (stockWarnings > 0) {
      nextAlerts.push({
        key: "stock",
        title: `${stockWarnings} kho còn hàng chờ xử lý`,
        description: "Kiểm tra tồn kho theo dữ liệu kiện hàng",
        tone: "warning",
        route: "/china-warehouse",
      });
    }

    if (delayedBatches > 0) {
      nextAlerts.push({
        key: "delayed",
        title: `${delayedBatches} lô quá hạn dự kiến`,
        description: "Theo ngày dự kiến đến của lô vận chuyển",
        tone: "danger",
        route: "/cn-batches",
      });
    }

    if (unpaidOrders > 0) {
      nextAlerts.push({
        key: "unpaid",
        title: `${unpaidOrders} đơn hàng còn công nợ`,
        description: `Tổng công nợ: ${formatVnd(receivable)}`,
        tone: "info",
        route: "/orders",
      });
    }

    if (cancelledOrders > 0) {
      nextAlerts.push({
        key: "cancelled",
        title: `${cancelledOrders} đơn đã hủy trong kỳ`,
        description: "Theo trạng thái đơn hàng hiện tại",
        tone: "warning",
        route: "/orders",
      });
    }

    if (nextAlerts.length === 0) {
      nextAlerts.push({
        key: "ok",
        title: "Hệ thống hoạt động bình thường",
        description: "Không có cảnh báo từ dữ liệu hiện tại",
        tone: "success",
      });
    }

    return nextAlerts;
  }, [batches, orders, receivable, warehouseRows]);

  const refetchAll = () => {
    void ordersQuery.refetch();
    void packagesQuery.refetch();
    void batchesQuery.refetch();
    void customersQuery.refetch();
  };

  return (
    <div className="dashboard-page">
      <DashboardHeader range={range} rangeKey={rangeKey} onRangeChange={setRange} onRangeKeyChange={setRangeKey} />

      {hasError ? (
        <Alert
          type="error"
          showIcon
          message={"Không tải được dữ liệu tổng quan"}
          description={"Vui lòng thử tải lại. Các API hiện có được giữ nguyên."}
          action={<Button onClick={refetchAll}>{"Thử lại"}</Button>}
          className="dashboard-page__error"
        />
      ) : null}

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <div className="dashboard-page__kpi-grid" aria-busy={isFetching}>
          {kpis.map((item) => (
            <KpiCard key={item.key} item={item} />
          ))}
        </div>
      )}

      <div className="dashboard-page__analytics-grid">
        <RevenueChart data={revenueData} loading={isLoading} />
        <ShipmentStatusChart data={statusSlices} total={orders.length} loading={isLoading} />
      </div>

      <div className="dashboard-page__operations-grid">
        <WarehouseActivityCard rows={warehouseRows} loading={isLoading} />
        <TopCustomersCard rows={topCustomers} loading={isLoading} />
        <AlertsCard alerts={alerts} loading={isLoading} />
      </div>

      <QuickActions onNavigate={navigate} />
    </div>
  );
};
