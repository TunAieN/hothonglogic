import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import {
  Button, Card, DatePicker, Dropdown, Empty, Input, Modal, Pagination, Select, Skeleton, Space, Table, Tooltip,
  Typography, message,
} from "antd";
import type { MenuProps, TableColumnsType, TableProps } from "antd";
import {
  AppstoreOutlined, CarOutlined, CheckCircleOutlined, CloseCircleOutlined, ColumnHeightOutlined,
  DollarCircleOutlined, DownloadOutlined, EyeOutlined, FileDoneOutlined, FilterOutlined,
  InboxOutlined, InfoCircleOutlined, MoreOutlined, PlusOutlined, PrinterOutlined, ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Link, useNavigate } from "react-router";
import { useGetIdentity } from "@refinedev/core";
import {
  fetchExportSlip, fetchExportSlips, fetchShippingTaskOptions, fetchShippingTasks, shippingErrorMessage,
  updateShippingTaskStatus,
} from "./api";
import { formatWeight, ShippingStatusTag } from "./helpers";
import { downloadExportSlip } from "./exportSlipDocument";
import type { ExportSlip, ExportSlipFilter, ExportSlipPage, ShippingListPage, ShippingTask, ShippingTaskFilter, ShippingTaskOptions, ShippingTaskPage } from "./types";
import type { User } from "../../types";
import "./shipping.css";

const emptyList = <T,>(): ShippingListPage<T> => ({
  data: [], paginatorInfo: { currentPage: 1, lastPage: 1, perPage: 10, total: 0 },
});
const emptyTasks = (): ShippingTaskPage => ({
  ...emptyList<ShippingTask>(),
  stats: { total_tasks: 0, preparing: 0, in_transit: 0, completed: 0, cancelled: 0 },
});
const statusOptions = [
  { value: "created", label: "Đã tạo" },
  { value: "preparing", label: "Đang chuẩn bị" },
  { value: "in_transit", label: "Đang giao" },
  { value: "completed", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã hủy" },
];
const pageSizes = [10, 20, 50, 100];

const TaskStat = ({ icon, label, value, total, tone, unit, loading, formattedValue }: {
  icon: React.ReactNode; label: string; value: number; total: number; tone: string; unit?: string; loading?: boolean; formattedValue?: string;
}) => {
  const percent = total ? ((value / total) * 100).toFixed(1) : "0.0";
  return <Card className={`shipping-task-stat shipping-task-stat--${tone}`} styles={{ body: { padding: 16 } }}>
    {loading ? <Skeleton active title={false} paragraph={{ rows: 2 }} /> : <><span className="shipping-task-stat__icon">{icon}</span>
    <div>
      <div className="shipping-task-stat__label">{label}</div>
      <div className="shipping-task-stat__value">{formattedValue ?? value.toLocaleString("vi-VN")}</div>
      <div className="shipping-task-stat__meta">{unit ?? `Chiếm ${percent}%`}</div>
    </div></>}
  </Card>;
};

export const ShippingTaskListPage = () => {
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<User>();
  const [data, setData] = useState<ShippingTaskPage>(emptyTasks());
  const [options, setOptions] = useState<ShippingTaskOptions>({ deliveryStaff: [], warehouses: [], carriers: [] });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState<ShippingTaskFilter>({ sort_field: "created_at", sort_direction: "desc" });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [status, setStatus] = useState<string>();
  const [carrier, setCarrier] = useState<string>();
  const [staff, setStaff] = useState<string>();
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  const permissions = identity?.role?.permissions ?? [];
  const canUpdate = permissions.some((item) => ["all", "exports.update", "export.update"].includes(item));
  const canCancel = permissions.some((item) => ["all", "exports.cancel", "export.cancel"].includes(item));

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchShippingTasks(page, pageSize, filters)); }
    catch (error) { message.error(shippingErrorMessage(error)); }
    finally { setLoading(false); }
  }, [filters, page, pageSize]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetchShippingTaskOptions().then(setOptions).catch((error) => message.error(shippingErrorMessage(error)));
  }, []);

  const applyFilters = () => {
    setPage(1);
    setFilters((current) => ({
      ...current,
      search: keyword.trim() || undefined,
      status,
      carrier_code: carrier,
      delivery_staff_id: staff,
      date_from: dateRange?.[0]?.format("YYYY-MM-DD"),
      date_to: dateRange?.[1]?.format("YYYY-MM-DD"),
    }));
  };
  const resetFilters = () => {
    setKeyword(""); setStatus(undefined); setCarrier(undefined); setStaff(undefined); setDateRange(null);
    setPage(1); setSelectedKeys([]);
    setFilters({ sort_field: "created_at", sort_direction: "desc" });
  };

  const changeStatus = async (row: ShippingTask, nextStatus: string) => {
    try {
      await updateShippingTaskStatus(row.id, nextStatus);
      message.success("Cập nhật trạng thái nhiệm vụ thành công.");
      await load();
    } catch (error) { message.error(shippingErrorMessage(error)); }
  };
  const confirmCancel = (row: ShippingTask) => Modal.confirm({
    title: "Hủy nhiệm vụ xuất hàng?",
    content: `Nhiệm vụ ${row.task_code} sẽ chuyển sang trạng thái Đã hủy.`,
    okText: "Hủy nhiệm vụ", cancelText: "Đóng", okButtonProps: { danger: true },
    onOk: () => changeStatus(row, "cancelled"),
  });

  const actionItems = (row: ShippingTask): MenuProps["items"] => {
    const items: MenuProps["items"] = [
      { key: "view", label: "Xem nhiệm vụ", onClick: () => navigate(`/shipping/tasks/${row.id}`) },
    ];
    if (row.export_slip_id) items.push({ key: "slip", label: "Xem phiếu xuất", onClick: () => navigate(`/shipping/slips/${row.export_slip_id}`) });
    if (canUpdate && row.status === "created") items.push({ key: "prepare", label: "Bắt đầu chuẩn bị", onClick: () => void changeStatus(row, "preparing") });
    if (canUpdate && row.status === "preparing") items.push({ key: "transit", label: "Chuyển sang đang giao", onClick: () => void changeStatus(row, "in_transit") });
    if (canUpdate && row.status === "in_transit") items.push({ key: "complete", label: "Hoàn thành", onClick: () => void changeStatus(row, "completed") });
    if (canCancel && ["created", "preparing"].includes(row.status)) items.push({ type: "divider" }, { key: "cancel", danger: true, label: "Hủy nhiệm vụ", onClick: () => confirmCancel(row) });
    return items;
  };

  const currentSort = (field: ShippingTaskFilter["sort_field"]) => filters.sort_field === field
    ? (filters.sort_direction === "asc" ? "ascend" : "descend") : null;
  const columns = useMemo<TableColumnsType<ShippingTask>>(() => [
    { title: "Mã nhiệm vụ", dataIndex: "task_code", width: 170, sorter: true, sortOrder: currentSort("task_code"), render: (value, row) => <Link className="shipping-table__order-link" to={`/shipping/tasks/${row.id}`}>{value}</Link> },
    { title: "Mã phiếu xuất", dataIndex: "export_code", width: 170, render: (value, row) => row.export_slip_id ? <Link className="shipping-table__order-link" to={`/shipping/slips/${row.export_slip_id}`}>{value}</Link> : "—" },
    { title: "Nhân viên giao hàng", dataIndex: "delivery_staff_name", width: 180, render: (value, row) => value ? <div><strong>{value}</strong>{row.delivery_staff_phone && <small className="shipping-table__subtext">{row.delivery_staff_phone}</small>}</div> : "—" },
    { title: "Đơn vị vận chuyển", dataIndex: "carrier_name", width: 180, render: (value) => value ? <span className="shipping-carrier"><CarOutlined />{value}</span> : "—" },
    { title: "Số đơn", dataIndex: "order_count", align: "center", width: 80 },
    { title: "Tổng kiện", dataIndex: "total_packages", align: "center", width: 90 },
    { title: "Tổng khối lượng", dataIndex: "total_weight", align: "right", width: 125, render: formatWeight },
    { title: "Ngày tạo", dataIndex: "created_at", width: 125, sorter: true, sortOrder: currentSort("created_at"), render: (value) => value ? <div>{dayjs(value).format("DD/MM/YYYY")}<small className="shipping-table__subtext">{dayjs(value).format("HH:mm")}</small></div> : "—" },
    { title: "Ngày giao dự kiến", dataIndex: "scheduled_delivery_date", width: 145, sorter: true, sortOrder: currentSort("scheduled_delivery_date"), render: (value) => value ? dayjs(value).format("DD/MM/YYYY") : "—" },
    { title: "Trạng thái", dataIndex: "status", width: 135, render: (value) => <ShippingStatusTag status={value} /> },
    { title: "Thao tác", fixed: "right", width: 128, render: (_, row) => <Space size={6}>
      <Tooltip title="Xem chi tiết nhiệm vụ"><Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/shipping/tasks/${row.id}`)} /></Tooltip>
      <Tooltip title={row.export_slip_id ? "In phiếu xuất hàng" : "Nhiệm vụ chưa có phiếu xuất"}><Button size="small" icon={<PrinterOutlined />} disabled={!row.export_slip_id} onClick={() => row.export_slip_id && navigate(`/shipping/slips/${row.export_slip_id}?print=1`)} /></Tooltip>
      <Dropdown menu={{ items: actionItems(row) }} trigger={["click"]}><Button size="small" icon={<MoreOutlined />} aria-label="Thao tác khác" /></Dropdown>
    </Space> },
  // Functions are recreated intentionally when filters or permissions change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [filters.sort_field, filters.sort_direction, canUpdate, canCancel]);

  const onTableChange: TableProps<ShippingTask>["onChange"] = (_, __, sorter) => {
    const selected = Array.isArray(sorter) ? sorter[0] : sorter;
    const field = selected?.field as ShippingTaskFilter["sort_field"] | undefined;
    if (!field || !selected.order) return;
    setPage(1);
    setFilters((current) => ({ ...current, sort_field: field, sort_direction: selected.order === "ascend" ? "asc" : "desc" }));
  };
  const firstItem = data.paginatorInfo.total ? (page - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(page * pageSize, data.paginatorInfo.total);
  const total = data.stats.total_tasks;

  return <div className="shipping-page shipping-task-page">
    <div className="shipping-page__header">
      <div><Typography.Title level={2} className="shipping-page__title">Danh sách nhiệm vụ xuất hàng</Typography.Title><span className="shipping-page__subtitle">Quản lý và theo dõi các nhiệm vụ xuất hàng đã được tạo</span></div>
      <div className="shipping-page__actions">
        <Input className="shipping-page__search" prefix={<SearchOutlined />} value={keyword} placeholder="Tìm mã nhiệm vụ, phiếu xuất, nhân viên..." allowClear onChange={(event) => setKeyword(event.target.value)} onPressEnter={applyFilters} />
        <Button icon={<FilterOutlined />} onClick={applyFilters}>Bộ lọc</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/shipping/queue")}>Tạo nhiệm vụ xuất hàng</Button>
      </div>
    </div>

    <div className="shipping-task-stat-grid">
      <TaskStat icon={<FileDoneOutlined />} label="Tổng nhiệm vụ" value={total} total={total} tone="blue" unit="nhiệm vụ" />
      <TaskStat icon={<CarOutlined />} label="Đang chuẩn bị" value={data.stats.preparing} total={total} tone="mint" />
      <TaskStat icon={<CarOutlined />} label="Đang giao" value={data.stats.in_transit} total={total} tone="orange" />
      <TaskStat icon={<CheckCircleOutlined />} label="Hoàn thành" value={data.stats.completed} total={total} tone="green" />
      <TaskStat icon={<CloseCircleOutlined />} label="Đã hủy" value={data.stats.cancelled} total={total} tone="red" />
    </div>

    <Card className="shipping-panel shipping-task-filter" styles={{ body: { padding: 14 } }}>
      <div className="shipping-task-filter__grid">
        <DatePicker.RangePicker value={dateRange} format="DD/MM/YYYY" placeholder={["Từ ngày", "Đến ngày"]} onChange={(value) => setDateRange(value)} />
        <Select allowClear value={status} placeholder="Tất cả trạng thái" options={statusOptions} onChange={setStatus} />
        <Select allowClear showSearch optionFilterProp="label" value={carrier} placeholder="Tất cả đơn vị vận chuyển" options={options.carriers.map((item) => ({ value: item.code, label: item.name }))} onChange={setCarrier} />
        <Select allowClear showSearch optionFilterProp="label" value={staff} placeholder="Tất cả nhân viên" options={options.deliveryStaff.map((item) => ({ value: item.id, label: item.name }))} onChange={setStaff} />
        <Space><Button type="primary" icon={<FilterOutlined />} onClick={applyFilters}>Áp dụng</Button><Button icon={<ReloadOutlined />} loading={loading} onClick={resetFilters}>Làm mới</Button></Space>
      </div>
    </Card>

    <Card className="shipping-panel shipping-task-table-card" styles={{ body: { padding: 0 } }}>
      <Table<ShippingTask>
        rowKey="id" className="shipping-table shipping-task-table" columns={columns} dataSource={data.data}
        loading={loading} pagination={false} scroll={{ x: 1510 }} onChange={onTableChange}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
        locale={{ emptyText: <Empty image={<InboxOutlined className="shipping-empty__icon" />} description={<><strong>Chưa có nhiệm vụ xuất hàng</strong><span className="shipping-empty__subtitle">Hãy tạo nhiệm vụ từ các đơn hàng đã thanh toán và đang chờ xuất.</span></>}><Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/shipping/queue")}>Tạo nhiệm vụ xuất hàng</Button></Empty> }}
      />
      <div className="shipping-task-pagination">
        <span>Hiển thị {firstItem} đến {lastItem} của {data.paginatorInfo.total.toLocaleString("vi-VN")} kết quả</span>
        <Pagination current={page} pageSize={pageSize} total={data.paginatorInfo.total} showSizeChanger={false} onChange={setPage} />
        <div className="shipping-task-pagination__size">Hiển thị <Select value={pageSize} options={pageSizes.map((value) => ({ value, label: value }))} onChange={(value) => { setPageSize(value); setPage(1); }} /> trên trang</div>
      </div>
    </Card>
  </div>;
};

export const ExportSlipListPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ExportSlipPage>({
    ...emptyList<ExportSlip>(),
    stats: { total_slips: 0, total_packages: 0, total_weight: 0, total_value: 0 },
  });
  const [options, setOptions] = useState<ShippingTaskOptions>({ deliveryStaff: [], warehouses: [], carriers: [] });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState<ExportSlipFilter>({ sort_direction: "desc" });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [status, setStatus] = useState<string>();
  const [carrier, setCarrier] = useState<string>();
  const [staff, setStaff] = useState<string>();
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [downloadingId, setDownloadingId] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchExportSlips(page, pageSize, filters)); }
    catch (error) { message.error(shippingErrorMessage(error)); }
    finally { setLoading(false); }
  }, [filters, page, pageSize]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { fetchShippingTaskOptions().then(setOptions).catch((error) => message.error(shippingErrorMessage(error))); }, []);

  const applyFilters = () => {
    setPage(1);
    setFilters((current) => ({ ...current,
      search: keyword.trim() || undefined,
      status, carrier_code: carrier, delivery_staff_id: staff,
      date_from: dateRange?.[0]?.format("YYYY-MM-DD"),
      date_to: dateRange?.[1]?.format("YYYY-MM-DD"),
    }));
  };
  const resetFilters = () => {
    setKeyword(""); setDateRange(null); setStatus(undefined); setCarrier(undefined); setStaff(undefined);
    setPage(1); setSelectedKeys([]); setFilters({ sort_direction: "desc" });
  };
  const download = async (row: ExportSlip) => {
    setDownloadingId(row.id);
    try { downloadExportSlip(await fetchExportSlip(row.id)); }
    catch (error) { message.error(shippingErrorMessage(error)); }
    finally { setDownloadingId(undefined); }
  };
  const actionItems = (row: ExportSlip): MenuProps["items"] => [
    { key: "view", label: "Xem chi tiết", onClick: () => navigate(`/shipping/slips/${row.id}`) },
    { key: "print", label: "In phiếu", onClick: () => navigate(`/shipping/slips/${row.id}?print=1`) },
    { key: "download", label: "Tải xuống", onClick: () => void download(row) },
    ...(row.task_id ? [{ key: "task", label: "Xem nhiệm vụ", onClick: () => navigate(`/shipping/tasks/${row.task_id}`) }] : []),
  ];
  const columns: TableColumnsType<ExportSlip> = [
    { title: "Mã phiếu xuất", dataIndex: "export_code", width: 170, render: (value, row) => <Link className="shipping-table__order-link" to={`/shipping/slips/${row.id}`}>{value}</Link> },
    { title: "Mã nhiệm vụ", dataIndex: "task_code", width: 170, render: (value, row) => row.task_id ? <Link className="shipping-table__order-link" to={`/shipping/tasks/${row.task_id}`}>{value}</Link> : "—" },
    { title: "Nhân viên giao hàng", dataIndex: "delivery_staff_name", width: 180, render: (value, row) => value ? <div><strong>{value}</strong>{row.delivery_staff_phone && <small className="shipping-table__subtext">{row.delivery_staff_phone}</small>}</div> : "—" },
    { title: "Đơn vị vận chuyển", dataIndex: "carrier_name", width: 180, render: (value) => value ? <span className="shipping-carrier"><CarOutlined />{value}</span> : "—" },
    { title: "Số đơn", dataIndex: "order_count", align: "center", width: 80 },
    { title: "Tổng kiện", dataIndex: "total_packages", align: "center", width: 90 },
    { title: "Tổng khối lượng", dataIndex: "total_weight", align: "right", width: 125, render: formatWeight },
    { title: "Tổng giá trị (VND)", dataIndex: "total_value", align: "right", width: 150, render: (value) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value ?? 0) },
    { title: "Ngày tạo", dataIndex: "created_at", width: 125, sorter: true, sortOrder: filters.sort_direction === "asc" ? "ascend" : "descend", render: (value) => value ? <div>{dayjs(value).format("DD/MM/YYYY")}<small className="shipping-table__subtext">{dayjs(value).format("HH:mm")}</small></div> : "—" },
    { title: "Trạng thái", dataIndex: "status", width: 135, render: (value) => <ShippingStatusTag status={value} /> },
    { title: "Thao tác", fixed: "right", width: 128, render: (_, row) => <Space size={6}>
      <Tooltip title="Xem chi tiết phiếu xuất"><Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/shipping/slips/${row.id}`)} /></Tooltip>
      <Tooltip title="Tải phiếu xuất"><Button size="small" icon={<DownloadOutlined />} loading={downloadingId === row.id} onClick={() => void download(row)} /></Tooltip>
      <Dropdown menu={{ items: actionItems(row) }} trigger={["click"]}><Button size="small" icon={<MoreOutlined />} aria-label="Thao tác khác" /></Dropdown>
    </Space> },
  ];
  const firstItem = data.paginatorInfo.total ? (page - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(page * pageSize, data.paginatorInfo.total);

  return <div className="shipping-page shipping-task-page shipping-slip-page">
    <div className="shipping-page__header">
      <div><Typography.Title level={2} className="shipping-page__title">Phiếu xuất hàng</Typography.Title><span className="shipping-page__subtitle">Quản lý và theo dõi các phiếu xuất hàng</span></div>
      <div className="shipping-page__actions">
        <Input className="shipping-page__search" prefix={<SearchOutlined />} value={keyword} placeholder="Tìm mã phiếu, nhiệm vụ, nhân viên..." allowClear onChange={(event) => setKeyword(event.target.value)} onPressEnter={applyFilters} />
        <Button icon={<FilterOutlined />} onClick={applyFilters}>Bộ lọc</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/shipping/queue")}>Tạo nhiệm vụ xuất hàng</Button>
      </div>
    </div>
    <div className="shipping-slip-stat-grid">
      <TaskStat loading={loading} icon={<FileDoneOutlined />} label="Tổng phiếu xuất" value={data.stats.total_slips} total={data.stats.total_slips} tone="blue" unit="phiếu" />
      <TaskStat loading={loading} icon={<AppstoreOutlined />} label="Tổng kiện" value={data.stats.total_packages} total={data.stats.total_slips} tone="mint" unit="kiện" />
      <TaskStat loading={loading} icon={<ColumnHeightOutlined />} label="Tổng khối lượng" value={data.stats.total_weight} total={data.stats.total_slips} tone="purple" unit="kg" formattedValue={new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(data.stats.total_weight)} />
      <TaskStat loading={loading} icon={<DollarCircleOutlined />} label="Tổng giá trị" value={data.stats.total_value} total={data.stats.total_slips} tone="orange" unit="VND" formattedValue={new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(data.stats.total_value)} />
    </div>
    <Card className="shipping-panel shipping-task-filter" styles={{ body: { padding: 14 } }}>
      <div className="shipping-task-filter__grid">
        <DatePicker.RangePicker value={dateRange} format="DD/MM/YYYY" placeholder={["Từ ngày", "Đến ngày"]} onChange={(value) => setDateRange(value)} />
        <Select allowClear value={status} placeholder="Tất cả trạng thái" options={statusOptions} onChange={setStatus} />
        <Select allowClear showSearch optionFilterProp="label" value={carrier} placeholder="Tất cả đơn vị vận chuyển" options={options.carriers.map((item) => ({ value: item.code, label: item.name }))} onChange={setCarrier} />
        <Select allowClear showSearch optionFilterProp="label" value={staff} placeholder="Tất cả nhân viên" options={options.deliveryStaff.map((item) => ({ value: item.id, label: item.name }))} onChange={setStaff} />
        <Space><Button type="primary" icon={<FilterOutlined />} onClick={applyFilters}>Áp dụng</Button><Button icon={<ReloadOutlined />} loading={loading} onClick={resetFilters}>Làm mới</Button></Space>
      </div>
    </Card>
    <Card className="shipping-panel shipping-task-table-card" styles={{ body: { padding: 0 } }}>
      <Table<ExportSlip> rowKey="id" className="shipping-table shipping-task-table" columns={columns} dataSource={data.data} loading={loading} pagination={false} scroll={{ x: 1490 }}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
        onChange={(_, __, sorter) => { const selected = Array.isArray(sorter) ? sorter[0] : sorter; if (selected.order) { setPage(1); setFilters((current) => ({ ...current, sort_direction: selected.order === "ascend" ? "asc" : "desc" })); } }}
        locale={{ emptyText: <Empty image={<InboxOutlined className="shipping-empty__icon" />} description={<><strong>Chưa có phiếu xuất hàng</strong><span className="shipping-empty__subtitle">Phiếu xuất sẽ được tạo sau khi nhiệm vụ xuất hàng được xác nhận.</span></>}><Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/shipping/queue")}>Tạo nhiệm vụ xuất hàng</Button></Empty> }} />
      <div className="shipping-task-pagination">
        <span>Hiển thị {firstItem} đến {lastItem} của {data.paginatorInfo.total.toLocaleString("vi-VN")} kết quả</span>
        <Pagination current={page} pageSize={pageSize} total={data.paginatorInfo.total} showSizeChanger={false} onChange={setPage} />
        <div className="shipping-task-pagination__size">Hiển thị <Select value={pageSize} options={pageSizes.map((value) => ({ value, label: value }))} onChange={(value) => { setPageSize(value); setPage(1); }} /> trên trang</div>
      </div>
    </Card>
    <div className="shipping-slip-note"><InfoCircleOutlined /><div><strong>Lưu ý</strong><span>Phiếu xuất hàng được tạo tự động khi nhiệm vụ xuất hàng được xác nhận thành công.</span></div></div>
  </div>;
};
