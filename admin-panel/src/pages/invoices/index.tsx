import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import dayjs from "dayjs";
import { Button, Card, DatePicker, Dropdown, Input, Select, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileDoneOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  ShoppingOutlined,
} from "@ant-design/icons";
import type { Invoice, InvoiceFilters, InvoiceStatus, PaymentMethod } from "./types";
import { fetchInvoices, fetchInvoiceStatistics, type InvoiceStatistics } from "./api";
import { filterInvoices, formatDate, formatDateTime, invoiceStatusConfig, invoiceTypeLabels, money, paymentMethodLabels } from "./invoiceUtils";
import { InvoiceStatusTag } from "./InvoiceStatusTag";
import "./invoice-pages.css";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const initialFilters: InvoiceFilters = {
  search: "",
  status: "all",
  paymentMethod: "all",
  dateRange: null,
};

const statusOptions = [
  { value: "all", label: "Tất cả" },
  ...Object.entries(invoiceStatusConfig).map(([value, config]) => ({ value, label: config.label })),
];

const paymentMethodOptions = [
  { value: "all", label: "Tất cả" },
  ...Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label })),
];

const formatDateTimeFilter = (value: dayjs.Dayjs, boundary: "start" | "end") => {
  return (boundary === "start" ? value.startOf("day") : value.endOf("day")).format("YYYY-MM-DD HH:mm:ss");
};

const uiStatusToBackendStatus: Partial<Record<InvoiceStatus, string>> = {
  pending: "pending",
  partially_paid: "confirmed",
  paid: "issued",
  cancelled: "cancelled",
};

type InvoiceStatKey = "total" | "paid" | "unpaid" | "revenue";
type InvoiceStatTone = "blue" | "green" | "red" | "orange";

type InvoiceStat = {
  key: InvoiceStatKey;
  label: string;
  value: string;
  trend: string;
  direction: "up" | "down";
  helper: string;
  tone: InvoiceStatTone;
};

const statIcons: Record<InvoiceStatKey, ReactNode> = {
  total: <FileDoneOutlined />,
  paid: <FileTextOutlined />,
  unpaid: <ShoppingOutlined />,
  revenue: <CloudDownloadOutlined />,
};

const developmentMessage = () => message.info("Chức năng đang được phát triển.");

const InvoiceStatCard = ({ stat }: { stat: InvoiceStat }) => (
  <Card className={`invoice-stat-card invoice-stat-card--${stat.tone}`}>
    <div className="invoice-stat-card__inner">
      <span className="invoice-stat-card__icon">{statIcons[stat.key]}</span>
      <div>
        <Text className="invoice-muted">{stat.label}</Text>
        <div className="invoice-stat-card__value">{stat.value}</div>
        <div className={`invoice-stat-card__trend invoice-stat-card__trend--${stat.direction}`}>
          {stat.direction === "up" ? "↑" : "↓"} {stat.trend}
        </div>
        <Text className="invoice-muted invoice-small-text">{stat.helper}</Text>
      </div>
    </div>
  </Card>
);

const emptyStatistics: InvoiceStatistics = {
  totalInvoices: 0,
  paidInvoices: 0,
  unpaidInvoices: 0,
  totalRevenue: 0,
};

const buildStats = (statistics: InvoiceStatistics): InvoiceStat[] => {
  return [
    { key: "total", label: "Tổng hóa đơn", value: statistics.totalInvoices.toLocaleString("vi-VN"), trend: "—", direction: "up", helper: "Toàn bộ hệ thống", tone: "blue" },
    { key: "paid", label: "Đã thanh toán", value: statistics.paidInvoices.toLocaleString("vi-VN"), trend: "—", direction: "up", helper: "Toàn bộ hệ thống", tone: "green" },
    { key: "unpaid", label: "Chưa thanh toán", value: statistics.unpaidInvoices.toLocaleString("vi-VN"), trend: "—", direction: "down", helper: "Toàn bộ hệ thống", tone: "red" },
    { key: "revenue", label: "Tổng doanh thu", value: money(statistics.totalRevenue), trend: "—", direction: "up", helper: "Toàn bộ hệ thống", tone: "orange" },
  ];
};

export const InvoiceListPage = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<InvoiceFilters>(initialFilters);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [statistics, setStatistics] = useState<InvoiceStatistics>(emptyStatistics);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);
  const { current: currentPage, pageSize } = pagination;

  const visibleInvoices = useMemo(() => filterInvoices(invoices, filters), [filters, invoices]);
  const stats = useMemo(() => buildStats(statistics), [statistics]);

  const loadInvoiceStatistics = useCallback(async () => {
    try {
      const result = await fetchInvoiceStatistics();
      setStatistics(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể tải thống kê hóa đơn.");
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const filter = {
        ...(filters.search.trim() ? { invoice_code: filters.search.trim() } : {}),
        ...(filters.status !== "all" && uiStatusToBackendStatus[filters.status] ? { status: uiStatusToBackendStatus[filters.status] } : {}),
        ...(filters.dateRange ? { issued_from: filters.dateRange[0], issued_to: filters.dateRange[1] } : {}),
      };
      const result = await fetchInvoices({
        page: currentPage,
        first: pageSize,
        filter,
      });
      setInvoices(result.data);
      setTotalRecords(result.total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể tải danh sách hóa đơn.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, filters.dateRange, filters.search, filters.status, pageSize]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    void loadInvoiceStatistics();
  }, [loadInvoiceStatistics]);

  const handleFilterChange = (nextFilters: Partial<InvoiceFilters>) => {
    setFilters((current) => ({ ...current, ...nextFilters }));
    setPagination((current) => ({ ...current, current: 1 }));
  };

  const handleResetFilters = () => {
    setFilters(initialFilters);
    setPagination({ current: 1, pageSize: 10 });
  };

  const handleApplyFilters = () => {
    setPagination((current) => ({ ...current, current: 1 }));
    void loadInvoices();
  };

  const handleTableChange = (nextPagination: TablePaginationConfig) => {
    setPagination({
      current: nextPagination.current ?? 1,
      pageSize: nextPagination.pageSize ?? 10,
    });
  };

  const handleCreateInvoice = () => navigate("/invoices/create");
  const handleViewInvoice = (invoice: Invoice) => navigate(`/invoices/${invoice.id}`);

  const rowActions = (invoice: Invoice) => [
    { key: "view", icon: <EyeOutlined />, label: "Xem chi tiết", onClick: () => handleViewInvoice(invoice) },
    { key: "edit", icon: <EditOutlined />, label: "Chỉnh sửa", onClick: developmentMessage },
    { key: "print", icon: <PrinterOutlined />, label: "In hóa đơn", onClick: developmentMessage },
    { key: "pdf", icon: <DownloadOutlined />, label: "Tải PDF", onClick: developmentMessage },
    { key: "send", icon: <SendOutlined />, label: "Gửi hóa đơn", onClick: developmentMessage },
    ...(!["paid", "cancelled"].includes(invoice.status)
      ? [{ key: "cancel", danger: true, icon: <DeleteOutlined />, label: "Hủy hóa đơn", onClick: developmentMessage }]
      : []),
  ];

  const columns: ColumnsType<Invoice> = [
    {
      title: "Mã hóa đơn",
      dataIndex: "invoice_code",
      width: 128,
      sorter: (a, b) => a.invoice_code.localeCompare(b.invoice_code),
      render: (value: string, invoice) => <Link to={`/invoices/${invoice.id}`}>{value}</Link>,
    },
    {
      title: "Mã đơn hàng",
      dataIndex: "order_code",
      width: 168,
      render: (value?: string | null) => value ? <Button type="link" className="invoice-inline-link" onClick={() => message.info("Liên kết đơn hàng sẽ được kết nối khi contract hóa đơn có route đơn hàng.")}>{value}</Button> : "—",
    },
    {
      title: "Loại hóa đơn",
      dataIndex: "invoice_type",
      width: 160,
      render: (value: Invoice["invoice_type"]) => (
        <Tag color={value === "deposit" ? "gold" : "blue"}>{invoiceTypeLabels[value]}</Tag>
      ),
    },
    {
      title: "Khách hàng",
      dataIndex: ["customer", "name"],
      width: 180,
      sorter: (a, b) => a.customer.name.localeCompare(b.customer.name),
      render: (_value, invoice) => <Text strong>{invoice.customer.name}</Text>,
    },
    {
      title: "Ngày tạo",
      dataIndex: "issued_at",
      width: 150,
      sorter: (a, b) => dayjs(a.issued_at).unix() - dayjs(b.issued_at).unix(),
      render: (value: string) => formatDateTime(value),
    },
    { title: "Ngày đến hạn", dataIndex: "due_at", width: 130, render: (value?: string | null) => formatDate(value) },
    { title: "Tổng tiền", dataIndex: "total_amount", align: "right", width: 150, render: (value: number) => money(value) },
    { title: "Đã thanh toán", dataIndex: "paid_amount", align: "right", width: 150, render: (value: number) => money(value) },
    { title: "Còn phải thu", dataIndex: "remaining_amount", align: "right", width: 150, render: (value: number) => <Text type={value > 0 ? "danger" : "secondary"}>{money(value)}</Text> },
    { title: "Trạng thái", dataIndex: "status", width: 175, render: (_value: InvoiceStatus, invoice) => <InvoiceStatusTag status={invoice.status} rawStatus={invoice.backend_status} /> },
    {
      title: "Hành động",
      key: "actions",
      align: "right",
      fixed: "right",
      width: 116,
      render: (_, invoice) => (
        <Space size={8}>
          <Button type="link" onClick={() => handleViewInvoice(invoice)}>Xem</Button>
          <Dropdown trigger={["click"]} menu={{ items: rowActions(invoice) }}>
            <Button type="text" icon={<MoreOutlined />} aria-label="Mở menu hành động" />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div className="invoice-page">
      <div className="invoice-page__header">
        <div>
          <Title level={2} className="invoice-page__title">Hóa đơn</Title>
          <Text className="invoice-muted">Quản lý và theo dõi các hóa đơn đã phát hành.</Text>
        </div>
        <Space wrap className="invoice-page__actions">
          <Button icon={<FileExcelOutlined />} onClick={() => message.info("Chức năng xuất Excel đang được phát triển.")}>Xuất Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateInvoice}>Tạo hóa đơn</Button>
        </Space>
      </div>

      <div className="invoice-stats-grid">
        {stats.map((stat) => <InvoiceStatCard stat={stat} key={stat.key} />)}
      </div>

      <Card className="invoice-filter-card">
        <div className="invoice-filter-grid">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm kiếm mã hóa đơn, mã đơn hàng, khách hàng..."
            value={filters.search}
            onChange={(event) => handleFilterChange({ search: event.target.value })}
          />
          <Select
            value={filters.status}
            options={statusOptions}
            onChange={(value) => handleFilterChange({ status: value as InvoiceStatus | "all" })}
          />
          <Select
            value={filters.paymentMethod}
            options={paymentMethodOptions}
            onChange={(value) => handleFilterChange({ paymentMethod: value as PaymentMethod | "all" })}
          />
          <RangePicker
            format="DD/MM/YYYY"
            value={filters.dateRange ? [dayjs(filters.dateRange[0]), dayjs(filters.dateRange[1])] : null}
            onChange={(dates) => handleFilterChange({
              dateRange: dates ? [
                formatDateTimeFilter(dates[0]!, "start"),
                formatDateTimeFilter(dates[1]!, "end"),
              ] : null,
            })}
          />
          <Button icon={<SearchOutlined />} onClick={handleApplyFilters}>Bộ lọc</Button>
          <Tooltip title="Làm mới bộ lọc">
            <Button icon={<ReloadOutlined />} onClick={handleResetFilters} aria-label="Làm mới bộ lọc" />
          </Tooltip>
        </div>
      </Card>

      <Card className="invoice-table-card">
        <Table<Invoice>
          columns={columns}
          dataSource={visibleInvoices}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1320 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: totalRecords,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            showTotal: (total, range) => `${range[0]} – ${range[1]} của ${total}`,
          }}
          onChange={handleTableChange}
        />
      </Card>
    </div>
  );
};
