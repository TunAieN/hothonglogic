import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Input,
  Pagination,
  Row,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  AppstoreAddOutlined,
  EyeOutlined,
  FilterOutlined,
  InboxOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShoppingOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { Link, useNavigate } from "react-router";
import { fetchShippingQueue, shippingErrorMessage } from "./api";
import { formatVnd, formatWeight } from "./helpers";
import type { ShippingQueueFilter, ShippingQueueOrder, ShippingQueuePage as ShippingQueuePageData } from "./types";
import { Can } from "../../shared/auth/Can";
import "./shipping.css";

const { RangePicker } = DatePicker;
const emptyPage: ShippingQueuePageData = {
  data: [],
  stats: { total_orders: 0, total_packages: 0, total_weight: 0, total_value: 0 },
  paginatorInfo: { currentPage: 1, lastPage: 1, perPage: 10, total: 0 },
};

type FilterDraft = {
  search: string;
  status?: string;
  carrier?: string;
  dates: [Dayjs | null, Dayjs | null] | null;
};

const initialDraft: FilterDraft = { search: "", status: "pending", carrier: undefined, dates: null };

export const ShippingQueuePage = () => {
  const navigate = useNavigate();
  const [pageData, setPageData] = useState<ShippingQueuePageData>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [draft, setDraft] = useState<FilterDraft>(initialDraft);
  const [filter, setFilter] = useState<ShippingQueueFilter>({ status: "pending" });
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<Record<string, ShippingQueueOrder>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPageData(await fetchShippingQueue(page, pageSize, filter));
    } catch (error) {
      message.error(shippingErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [filter, page, pageSize]);

  useEffect(() => { void load(); }, [load]);

  const applyFilters = () => {
    setPage(1);
    setFilter({
      ...(draft.search.trim() ? { search: draft.search.trim() } : {}),
      ...(draft.status ? { status: draft.status } : {}),
      ...(draft.carrier ? { carrier: draft.carrier } : {}),
      ...(draft.dates?.[0] ? { date_from: draft.dates[0].format("YYYY-MM-DD") } : {}),
      ...(draft.dates?.[1] ? { date_to: draft.dates[1].format("YYYY-MM-DD") } : {}),
    });
  };

  const resetFilters = () => {
    setDraft(initialDraft);
    setFilter({ status: "pending" });
    setPage(1);
  };

  const selected = useMemo(() => selectedKeys.map((key) => selectedRows[String(key)]).filter(Boolean), [selectedKeys, selectedRows]);
  const selectedSummary = useMemo(() => ({
    packages: selected.reduce((sum, row) => sum + row.package_count, 0),
    weight: selected.reduce((sum, row) => sum + row.total_weight, 0),
    value: selected.reduce((sum, row) => sum + row.total_value, 0),
  }), [selected]);

  const createTask = () => {
    if (!selectedKeys.length) return;
    navigate(`/shipping/create?orders=${selectedKeys.map(String).join(",")}`);
  };

  const columns: TableColumnsType<ShippingQueueOrder> = [
    {
      title: "Mã đơn hàng",
      dataIndex: "order_code",
      width: 170,
      render: (value: string, row) => <Link className="shipping-table__order-link" to={`/orders/show/${row.id}`}>{value}</Link>,
    },
    {
      title: "Mã vận đơn",
      dataIndex: "tracking_numbers",
      width: 190,
      render: (values: string[]) => values.length ? <Space orientation="vertical" size={1}>{values.map((value) => <span key={value}>{value}</span>)}</Space> : "-",
    },
    {
      title: "Khách hàng",
      width: 190,
      render: (_, row) => <><strong>{row.customer_name}</strong><span className="shipping-table__secondary">{row.customer_phone || "-"}</span></>,
    },
    { title: "Đơn vị vận chuyển", dataIndex: "carrier", width: 170, render: (value) => value || "Chưa chỉ định" },
    {
      title: "Ngày thanh toán",
      dataIndex: "payment_date",
      width: 160,
      sorter: (a, b) => dayjs(a.payment_date).valueOf() - dayjs(b.payment_date).valueOf(),
      render: (value) => value ? <>{dayjs(value).format("DD/MM/YYYY")}<span className="shipping-table__secondary">{dayjs(value).format("HH:mm")}</span></> : "-",
    },
    { title: "Tổng kiện", dataIndex: "package_count", align: "center", width: 100, render: (value) => `${value} kiện` },
    { title: "Tổng khối lượng", dataIndex: "total_weight", align: "right", width: 140, render: formatWeight },
    { title: "Giá trị (VND)", dataIndex: "total_value", align: "right", width: 150, render: (value) => new Intl.NumberFormat("vi-VN").format(value) },
    { title: "Trạng thái", dataIndex: "status", width: 160, render: () => <Tag color="gold">Chưa tạo nhiệm vụ</Tag> },
    {
      title: "Thao tác",
      fixed: "right",
      width: 105,
      render: (_, row) => <Space>
        <Button aria-label="Xem chi tiết" icon={<EyeOutlined />} onClick={() => navigate(`/orders/show/${row.id}`)} />
        <Dropdown trigger={["click"]} menu={{ items: [
          { key: "order", label: <Link to={`/orders/show/${row.id}`}>Xem đơn hàng</Link> },
          { key: "tracking", label: "Xem vận đơn", disabled: !row.tracking_numbers.length },
          { key: "note", label: "Ghi chú", disabled: true },
        ] }}><Button aria-label="Thêm thao tác" icon={<MoreOutlined />} /></Dropdown>
      </Space>,
    },
  ];

  const stats = [
    { label: "Tổng đơn chờ xuất", value: `${pageData.stats.total_orders} đơn hàng`, icon: <AppstoreAddOutlined />, color: "#2563eb", bg: "#eff6ff" },
    { label: "Tổng kiện", value: `${pageData.stats.total_packages} kiện`, icon: <InboxOutlined />, color: "#16a34a", bg: "#ecfdf5" },
    { label: "Tổng khối lượng", value: formatWeight(pageData.stats.total_weight), icon: <ShoppingOutlined />, color: "#7c3aed", bg: "#f5f3ff" },
    { label: "Tổng giá trị", value: formatVnd(pageData.stats.total_value), icon: <WalletOutlined />, color: "#ea580c", bg: "#fff7ed" },
  ];

  return <div className="shipping-page">
    <div className="shipping-page__header">
      <div><Typography.Title level={2} className="shipping-page__title">Danh sách xuất hàng (chờ xuất)</Typography.Title><span className="shipping-page__subtitle">Các đơn hàng đã thanh toán, sẵn sàng tạo nhiệm vụ xuất hàng</span></div>
      <div className="shipping-page__actions">
        <Input className="shipping-page__search" prefix={<SearchOutlined />} value={draft.search} placeholder="Tìm mã đơn, vận đơn, khách hàng..." onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} onPressEnter={applyFilters} allowClear />
        <Button icon={<FilterOutlined />} onClick={applyFilters}>Bộ lọc</Button>
        <Can permission="shipping_tasks.create"><Button type="primary" icon={<PlusOutlined />} disabled={!selectedKeys.length} onClick={createTask}>Tạo nhiệm vụ xuất hàng</Button></Can>
      </div>
    </div>

    <Row gutter={[14, 14]} className="shipping-stats">
      {stats.map((stat) => <Col xs={24} sm={12} xl={6} key={stat.label}><Card loading={loading}><div className="shipping-stat"><span className="shipping-stat__icon" style={{ "--shipping-stat-color": stat.color, "--shipping-stat-bg": stat.bg } as React.CSSProperties}>{stat.icon}</span><div><div className="shipping-stat__label">{stat.label}</div><div className="shipping-stat__value">{stat.value}</div></div></div></Card></Col>)}
    </Row>

    <Card className="shipping-panel" styles={{ body: { padding: 16 } }}>
      <div className="shipping-filter-grid">
        <RangePicker value={draft.dates} format="DD/MM/YYYY" placeholder={["Từ ngày thanh toán", "Đến ngày"]} onChange={(dates) => setDraft((current) => ({ ...current, dates: dates as FilterDraft["dates"] }))} />
        <Select value={draft.status} options={[{ value: "pending", label: "Chưa tạo nhiệm vụ" }]} onChange={(status) => setDraft((current) => ({ ...current, status }))} />
        <Select allowClear value={draft.carrier} placeholder="Tất cả đơn vị vận chuyển" options={["Giao hàng nhanh", "Viettel Post", "GHTK", "VNPost", "Khác"].map((value) => ({ value, label: value }))} onChange={(carrier) => setDraft((current) => ({ ...current, carrier }))} />
        <Input value={draft.search} prefix={<SearchOutlined />} placeholder="Mã đơn, vận đơn, tên hoặc SĐT" onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} onPressEnter={applyFilters} allowClear />
        <Space><Button type="primary" icon={<FilterOutlined />} onClick={applyFilters}>Áp dụng</Button><Button icon={<ReloadOutlined />} onClick={resetFilters}>Làm mới</Button></Space>
      </div>
    </Card>

    <Card className="shipping-panel" styles={{ body: { padding: 16 } }}>
      {selectedKeys.length > 0 && <div className="shipping-selection-bar"><div><strong>Đã chọn {selectedKeys.length} đơn hàng</strong><div className="shipping-selection-bar__meta">{selectedSummary.packages} kiện • {formatWeight(selectedSummary.weight)} • {formatVnd(selectedSummary.value)}</div></div><Can permission="shipping_tasks.create"><Button type="primary" icon={<PlusOutlined />} onClick={createTask}>Tạo nhiệm vụ xuất hàng</Button></Can></div>}
      {loading && !pageData.data.length ? <><Skeleton active paragraph={{ rows: 2 }} /><Skeleton active paragraph={{ rows: 7 }} /></> : <Table<ShippingQueueOrder>
        className="shipping-table"
        rowKey="id"
        columns={columns}
        dataSource={pageData.data}
        loading={loading}
        pagination={false}
        scroll={{ x: 1450 }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          preserveSelectedRowKeys: true,
          onChange: (keys, rows) => {
            setSelectedKeys(keys);
            setSelectedRows((current) => ({ ...current, ...Object.fromEntries(rows.map((row) => [row.id, row])) }));
          },
        }}
        locale={{ emptyText: <div className="shipping-empty"><span className="shipping-empty__icon"><InboxOutlined /></span><div className="shipping-empty__title">Không có đơn hàng chờ xuất</div><div className="shipping-empty__subtitle">Các đơn hàng đã thanh toán sẽ tự động xuất hiện tại đây.</div></div> }}
      />}
      <div className="shipping-paginator"><span>Hiển thị {pageData.paginatorInfo.firstItem ?? 0} đến {pageData.paginatorInfo.lastItem ?? 0} của {pageData.paginatorInfo.total} kết quả</span><Pagination current={page} pageSize={pageSize} total={pageData.paginatorInfo.total} showSizeChanger pageSizeOptions={[10, 20, 50, 100]} showTotal={(_, range) => `${range[0]}-${range[1]}`} onChange={(nextPage, nextSize) => { setPage(nextPage); if (nextSize !== pageSize) { setPageSize(nextSize); setPage(1); } }} /></div>
    </Card>
  </div>;
};
