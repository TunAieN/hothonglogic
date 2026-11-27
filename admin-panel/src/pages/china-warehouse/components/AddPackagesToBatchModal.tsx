import { useEffect, useRef, useState } from "react";
import { Alert, Button, DatePicker, Empty, Form, Input, Modal, Select, Space, Spin, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import { ApartmentOutlined, AppstoreOutlined, CarOutlined, DeploymentUnitOutlined, FileTextOutlined, PlusCircleOutlined, UserOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../../providers/graphqlClient";
import { calculateSelectedTotalWeight } from "../helpers";
import type { ChinaWarehousePackage } from "../types";
import "./add-packages-to-batch.css";

const optionsQuery = `query CnBatchReceivingOptions($source: ID!) {
  cnBatchReceivingOptions(warehouse_id: $source) {
    preview_code destinations { id code name address }
  }
}`;

const batchesQuery = `query CnBatchesForPackages($source: ID!, $status: String!, $search: String, $oldest: Boolean!, $first: Int!, $page: Int!) {
  cnBatchesForPackages(warehouse_id: $source, status: $status, search: $search, oldest_first: $oldest, first: $first, page: $page) {
    data { id batch_code status created_at total_packages total_weight note destination_warehouse_name destination_warehouse { name } }
    paginatorInfo { total }
  }
}`;

const addMutation = `mutation AddPackagesToCnBatch($input: AddPackagesToCnBatchInput!) {
  addPackagesToCnBatch(input: $input) { id batch_code }
}`;

type Warehouse = { id: string; code: string; name: string; address?: string | null };
type Options = { preview_code: string; destinations: Warehouse[] };
type Batch = {
  id: string;
  batch_code: string;
  status: string;
  created_at: string;
  total_packages?: number | null;
  total_weight?: number | null;
  note?: string | null;
  destination_warehouse_name?: string | null;
  destination_warehouse?: { name: string } | null;
};
type BatchPage = { data: Batch[]; paginatorInfo: { total: number } };
type BatchFields = { destination: string; shippingType: "normal" | "fast"; eta?: Dayjs; note?: string };
type Props = {
  packages: ChinaWarehousePackage[];
  canReadOrders: boolean;
  canReadBatches: boolean;
  onCancel: () => void;
  onSuccess: (code: string, mode: "create" | "existing") => void;
};

const statuses: Record<string, string> = {
  pending: "Chờ xuất kho", exporting: "Đang vận chuyển", arrived_vn: "Đã về kho Việt Nam",
  completed: "Hoàn tất", cancelled: "Đã hủy",
};
const shippingOptions = [{ value: "normal", label: "Thường" }, { value: "fast", label: "Nhanh" }];
const weightLabel = (value: number) => `${value.toFixed(2)} kg`;
const destinationLabel = (row: Batch) => row.destination_warehouse?.name || row.destination_warehouse_name || "Chưa xác định";
const warehouseLabel = (warehouse: Warehouse) => `${warehouse.code} — ${warehouse.name}`;
const pageSize = 5;

function getSaveError(error: unknown) {
  const response = (error as { response?: { status?: number; errors?: { message?: string; extensions?: { code?: string } }[] } })?.response;
  const detail = response?.errors?.[0];
  if (detail?.extensions?.code === "CN_PACKAGE_INVALID_INPUT" || detail?.extensions?.code === "CN_BATCH_FORBIDDEN") {
    return detail.message || "Vui lòng kiểm tra thông tin lô hàng.";
  }
  if (response?.status === 401 || detail?.message === "Unauthenticated.") return "Phiên đăng nhập đã hết hạn.";
  if (response?.status === 403 || detail?.message === "Bạn không có quyền thực hiện thao tác này.") {
    return "Bạn không có quyền thực hiện thao tác này.";
  }
  return "Chưa xác nhận được kết quả lưu lô. Hãy kiểm tra danh sách kiện trước khi gửi lại.";
}

const CellText = ({ value, copy = false }: { value: string; copy?: boolean }) =>
  <Typography.Text className="cn-attach-ellipsis" ellipsis={{ tooltip: value }} copyable={copy ? { text: value } : false}>{value}</Typography.Text>;

const PackageValues = ({ values }: { values: string[] }) => {
  const [expanded, setExpanded] = useState(false);
  return <div className="cn-attach-values">
    {(expanded ? values : values.slice(0, 2)).map((value) => <CellText value={value} key={value} />)}
    {values.length === 0 && <span>—</span>}
    {values.length > 2 && <Button type="link" size="small" onClick={() => setExpanded(!expanded)}>
      {expanded ? "Thu gọn" : `Xem thêm ${values.length - 2}`}
    </Button>}
  </div>;
};

export function AddPackagesToBatchModal({ packages, canReadOrders, canReadBatches, onCancel, onSuccess }: Props) {
  const [form] = Form.useForm<BatchFields>();
  const [mode, setMode] = useState<"create" | "existing">("create");
  const [options, setOptions] = useState<Options>();
  const [catalogError, setCatalogError] = useState(false);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [batches, setBatches] = useState<BatchPage>();
  const [listError, setListError] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [oldest, setOldest] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Batch>();
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const lock = useRef(false);
  const source = packages[0];
  const sourceLabel = source.warehouseCode ? `${source.warehouseName} (${source.warehouseCode})` : source.warehouseName;
  const count = packages.length;
  const total = calculateSelectedTotalWeight(packages);
  const destination = Form.useWatch("destination", form);
  const shippingType = Form.useWatch("shippingType", form) ?? "normal";
  const chosenDestination = options?.destinations.find((item) => item.id === destination);
  const unique = (getValue: (item: ChinaWarehousePackage) => string | undefined) =>
    [...new Set(packages.map(getValue).filter((value): value is string => Boolean(value)))];

  useEffect(() => {
    const controller = new AbortController();
    syncGraphqlAuthToken();
    void client.request<{ cnBatchReceivingOptions: Options }>({
      document: optionsQuery, variables: { source: source.warehouseId },
      requestHeaders: getGraphqlAuthHeaders(), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
    }).then((data) => { if (!controller.signal.aborted) setOptions(data.cnBatchReceivingOptions); })
      .catch(() => { if (!controller.signal.aborted) setCatalogError(true); });
    return () => controller.abort();
  }, [source.warehouseId, catalogVersion]);

  useEffect(() => {
    if (mode !== "existing" || !canReadBatches) return;
    const controller = new AbortController();
    syncGraphqlAuthToken();
    void client.request<{ cnBatchesForPackages: BatchPage }>({
      document: batchesQuery, variables: { source: source.warehouseId, status, search, oldest, first: pageSize, page },
      requestHeaders: getGraphqlAuthHeaders(), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
    }).then((data) => { if (!controller.signal.aborted) setBatches(data.cnBatchesForPackages); })
      .catch(() => { if (!controller.signal.aborted) setListError(true); });
    return () => controller.abort();
  }, [canReadBatches, mode, source.warehouseId, status, search, oldest, page, listVersion]);

  const resetList = () => {
    setBatches(undefined);
    setListError(false);
    setSelected(undefined);
    setListVersion((version) => version + 1);
  };

  const submit = async () => {
    if (lock.current || (mode === "existing" && !selected) || (mode === "create" && !options?.destinations.length)) return;
    lock.current = true;
    setSaving(true);
    setSubmitError(undefined);
    try {
      const values = mode === "create" ? await form.validateFields() : undefined;
      const input = {
        cn_package_ids: packages.map(({ id }) => id),
        ...(values ? {
          destination_warehouse_id: values.destination,
          shipping_type: values.shippingType,
          expected_arrival_at: values.eta?.format("YYYY-MM-DD 00:00:00") ?? null,
          note: values.note?.trim() || null,
        } : { cn_batch_id: selected?.id }),
      };
      syncGraphqlAuthToken();
      const result = await client.request<{ addPackagesToCnBatch: { id: string; batch_code: string } }>({
        document: addMutation, variables: { input }, requestHeaders: getGraphqlAuthHeaders(), signal: AbortSignal.timeout(25_000),
      });
      onSuccess(result.addPackagesToCnBatch.batch_code, mode);
    } catch (error) {
      const first = (error as { errorFields?: { name: string[]; errors: string[] }[] })?.errorFields?.[0];
      if (first) {
        setSubmitError(first.errors[0] || "Vui lòng kiểm tra thông tin lô hàng.");
        form.scrollToField(first.name, { focus: true, block: "nearest" });
      } else setSubmitError(getSaveError(error));
    } finally {
      setSaving(false);
      lock.current = false;
    }
  };

  const columns: ColumnsType<Batch> = [
    { title: "Mã lô hàng", key: "batch", render: (_, row) => <CellText value={row.batch_code} copy /> },
    { title: "Ngày tạo", key: "date", width: "16%", responsive: ["lg"], render: (_, row) => <CellText value={dayjs(row.created_at).format("DD/MM/YYYY HH:mm")} /> },
    { title: "Số kiện", key: "count", width: "10%", align: "center", responsive: ["sm"], render: (_, row) => row.total_packages ?? 0 },
    { title: "Tổng KL", key: "weight", width: "14%", render: (_, row) => weightLabel(row.total_weight ?? 0) },
    { title: "Trạng thái", key: "status", width: "19%", render: (_, row) => <Tooltip title={row.status === "pending" ? statuses.pending : "Lô không còn nhận thêm kiện"}>
      <Tag color={row.status === "pending" ? "blue" : "default"} className="cn-attach-status">{statuses[row.status] ?? row.status}</Tag>
    </Tooltip> },
    { title: "Ghi chú", key: "note", width: "16%", responsive: ["lg"], render: (_, row) => <CellText value={row.note || "—"} /> },
  ];

  return <Modal
    open centered width="min(88vw, 1390px)" rootClassName="cn-attach-modal" maskClosable={false}
    onCancel={() => { if (!lock.current) onCancel(); }}
    title={<div className="cn-attach-title"><span className="cn-attach-logo"><DeploymentUnitOutlined /></span><div>
      <strong>Thêm kiện vào lô hàng</strong><div>Chọn tạo lô mới hoặc thêm vào lô hàng có sẵn để xử lý xuất kho.</div>
    </div></div>}
    footer={<Space wrap>
      <Button disabled={saving} onClick={() => { if (!lock.current) onCancel(); }}>Hủy</Button>
      <Button type="primary" icon={<AppstoreOutlined />} loading={saving}
        disabled={mode === "create" ? !options?.destinations.length : !selected}
        onClick={() => void submit()}>{mode === "create" ? "Xác nhận tạo lô" : "Xác nhận thêm vào lô"}</Button>
    </Space>}
  >
    <div className="cn-attach-grid">
      <aside className="cn-attach-package">
        <div className="cn-attach-package-head"><strong>Thông tin kiện đã chọn</strong><Tag color="blue">{count} kiện</Tag></div>
        <div className="cn-attach-fact"><AppstoreOutlined /><div>Tổng khối lượng<strong>{weightLabel(total)}</strong></div></div>
        <div className="cn-attach-fact"><ApartmentOutlined /><div>Kho nguồn<CellText value={sourceLabel} /></div></div>
        <div className="cn-attach-fact"><CarOutlined /><div>Mã vận đơn<PackageValues values={unique((item) => item.trackingCode)} /></div></div>
        {canReadOrders && <div className="cn-attach-fact"><FileTextOutlined /><div>Đơn VietTrung<PackageValues values={unique((item) => item.invoiceCode)} /></div></div>}
        {canReadOrders && <div className="cn-attach-fact"><UserOutlined /><div>Khách hàng<PackageValues values={unique((item) => item.customerName)} /></div></div>}
        <div className="cn-attach-fact"><UserOutlined /><div>Người nhận tại kho Trung Quốc<PackageValues values={unique((item) => item.receiverName)} /></div></div>
      </aside>
      <div className="cn-attach-work">
        <Tabs type="card" activeKey={mode} items={[
          { key: "create", label: "Tạo lô hàng mới", icon: <PlusCircleOutlined /> },
          { key: "existing", label: "Thêm vào lô hàng có sẵn", icon: <AppstoreOutlined />, disabled: !canReadBatches },
        ]} onChange={(key) => {
          if (lock.current) return;
          setMode(key === "existing" ? "existing" : "create");
          setSubmitError(undefined);
        }} />
        {submitError && <Alert type="error" showIcon message={submitError} />}
        <div hidden={mode !== "create"}>
          <div className="cn-attach-stack">
            <Alert type="info" showIcon message="Hệ thống sẽ tạo một lô hàng mới cho những kiện đã chọn." />
            <div className="cn-attach-metrics">
              <div>Số kiện<strong>{count}</strong></div>
              <div>Tổng khối lượng<strong>{weightLabel(total)}</strong></div>
              <div>Kho nguồn<CellText value={sourceLabel} /></div>
            </div>
            {catalogError && <Alert type="error" showIcon message="Không thể tải danh sách kho đích."
              action={<Button size="small" onClick={() => { setCatalogError(false); setCatalogVersion((version) => version + 1); }}>Thử lại</Button>} />}
            {options?.destinations.length === 0 && <Alert showIcon type="warning" message="Chưa có kho Việt Nam đang hoạt động để chọn." />}
            <Form<BatchFields> form={form} name="cnBatchCreate" layout="vertical" disabled={saving} initialValues={{ shippingType: "normal" }}>
              <div className="cn-attach-form">
                <Form.Item label="Mã lô hàng dự kiến"><div className="cn-attach-code">{options
                  ? <CellText value={options.preview_code} copy /> : catalogError ? "—" : <Spin size="small" />}</div></Form.Item>
                <Form.Item label="Hình thức vận chuyển" name="shippingType" rules={[{ required: true, message: "Chọn hình thức vận chuyển." }]}>
                  <Select options={shippingOptions} />
                </Form.Item>
                <Form.Item label="Ngày dự kiến về kho" name="eta">
                  <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày dự kiến" style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item label="Kho đích" name="destination" rules={[{ required: true, message: "Chọn kho đích Việt Nam." }]}>
                  <Select showSearch optionFilterProp="searchText" placeholder="Chọn kho đích" loading={!options && !catalogError}
                    disabled={!options?.destinations.length || saving} classNames={{ popup: { root: "cn-attach-options" } }}
                    notFoundContent="Không có kho phù hợp"
                    options={options?.destinations.map((item) => ({
                      value: item.id, label: <CellText value={warehouseLabel(item)} />,
                      searchText: `${warehouseLabel(item)} ${item.address || ""}`,
                      address: item.address,
                    }))}
                    optionRender={({ data }) => <div className="cn-attach-option-label">
                      {data.label}
                      {data.address && <small title={data.address}>{data.address}</small>}
                    </div>}
                  />
                </Form.Item>
              </div>
              <Form.Item label="Ghi chú (tùy chọn)" name="note" className="cn-attach-note">
                <Input.TextArea rows={3} maxLength={500} showCount placeholder="Nhập ghi chú cho lô hàng" />
              </Form.Item>
            </Form>
            <div className="cn-attach-summary">
              <strong>Tóm tắt lô sẽ tạo</strong><span>{count} kiện · {weightLabel(total)}</span>
              <span>Kho nguồn: {sourceLabel}</span><span>Kho đích: {chosenDestination ? warehouseLabel(chosenDestination) : "Chưa chọn"}</span>
              <span>Vận chuyển: {shippingType === "fast" ? "Nhanh" : "Thường"}</span>
            </div>
          </div>
        </div>
        {mode === "existing" && <div className="cn-attach-stack">
          <Alert type="info" showIcon message={`Chọn lô của ${sourceLabel} để thêm ${count} kiện (${weightLabel(total)}).`} />
          <div className="cn-attach-filters">
            <Input.Search aria-label="Tìm mã lô hoặc ghi chú" placeholder="Tìm mã lô, ghi chú..." allowClear defaultValue={search}
              disabled={saving} onSearch={(value) => { setSearch(value.trim()); setPage(1); resetList(); }} />
            <Select aria-label="Trạng thái lô" disabled={saving} value={status} onChange={(value) => { setStatus(value); setPage(1); resetList(); }}
              options={[{ value: "all", label: "Tất cả trạng thái" }, ...Object.entries(statuses).map(([value, label]) => ({ value, label }))]} />
            <Select aria-label="Sắp xếp lô" disabled={saving} value={oldest ? "old" : "new"} onChange={(value) => { setOldest(value === "old"); setPage(1); resetList(); }}
              options={[{ value: "new", label: "Mới nhất" }, { value: "old", label: "Cũ nhất" }]} />
          </div>
          {listError && <Alert type="error" showIcon message="Không thể tải danh sách lô."
            action={<Button size="small" onClick={resetList}>Thử lại</Button>} />}
          <Table<Batch> size="small" columns={columns} rowKey="id" tableLayout="fixed"
            dataSource={batches?.data ?? []} loading={!batches && !listError}
            onRow={(row) => ({
              onClick: (event) => {
                if (!saving && row.status === "pending" && !(event.target as HTMLElement).closest("button, label, input")) setSelected(row);
              },
            })}
            rowSelection={{ type: "radio", columnWidth: 32, selectedRowKeys: selected ? [selected.id] : [],
              onChange: (_, rows) => setSelected(rows[0]), getCheckboxProps: (row) => ({ disabled: saving || row.status !== "pending" }) }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có lô phù hợp" /> }}
            pagination={{ current: page, pageSize, total: batches?.paginatorInfo.total, showSizeChanger: false,
              showTotal: (all, range) => `${range[0]}–${range[1]} / ${all} lô`,
              onChange: (value) => { setPage(value); resetList(); } }}
          />
          {selected && <div className="cn-attach-summary">
            <strong>{selected.batch_code}</strong><span>Kho đích: {destinationLabel(selected)}</span>
            <span>{selected.total_packages ?? 0} + {count} = {(selected.total_packages ?? 0) + count} kiện</span>
            <span>{weightLabel(selected.total_weight ?? 0)} + {weightLabel(total)} = {weightLabel((selected.total_weight ?? 0) + total)}</span>
          </div>}
        </div>}
      </div>
    </div>
  </Modal>;
}
