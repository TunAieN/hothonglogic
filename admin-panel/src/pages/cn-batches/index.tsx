import { useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import { useDelete, useList, useUpdate } from "@refinedev/core";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileExcelOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import type { CnPackage } from "../../types";
import {
  calculateBatchTotals,
  calculatePackageVolume,
  canCreateVietnamInboundTask,
  canDeleteBatch,
  canEditBatch,
  formatVolume,
  formatWeight,
  getBatchStatusTag,
  getShippingTypeTag,
  mapApiBatchToViewModel,
  mapBatchToEditFormValues,
  mapEditFormValuesToInput,
} from "./helpers";
import type { BatchApiRecord, BatchEditFormValues, BatchFilters, BatchPackageRow, BatchViewModel } from "./types";
import { AdminTableSkeleton, LoadingOverlay, SkeletonStatCard } from "../../components/admin-loading";
import { PageHeader, StatCard, StatsGrid } from "../../components/admin-page-summary";

const { Text } = Typography;
const CnBatchStatsSkeleton = () => (
  <Row gutter={[12, 12]}>
    <Col xs={12} md={6}>
      <SkeletonStatCard labelWidth={92} valueWidth={42} />
    </Col>
    <Col xs={12} md={6}>
      <SkeletonStatCard labelWidth={112} valueWidth={42} />
    </Col>
    <Col xs={12} md={6}>
      <SkeletonStatCard labelWidth={128} valueWidth={42} />
    </Col>
    <Col xs={12} md={6}>
      <SkeletonStatCard labelWidth={72} valueWidth={42} />
    </Col>
  </Row>
);

const CREATE_VIETNAM_INBOUND_TASK_MUTATION = `
  mutation CreateVietnamInboundTask($input: CreateVietnamInboundTaskInput!) {
    createVietnamInboundTask(input: $input) {
      batch_ids
      total_batches
      total_packages
      total_weight
    }
  }
`;

const SHIPPING_TYPE_OPTIONS = [
  { label: "Nhanh", value: "fast" },
  { label: "Thường", value: "normal" },
] as const;

const STATUS_OPTIONS = [
  { label: "Chờ xuất kho", value: "pending" },
  { label: "Đang vận chuyển", value: "exporting" },
  { label: "Đã về kho Việt Nam", value: "arrived_vn" },
  { label: "Hoàn tất", value: "completed" },
  { label: "Đã hủy", value: "cancelled" },
] as const;

const filterBatches = (batches: BatchViewModel[], filters: BatchFilters) =>
  batches.filter((batch) => {
    if (filters.batchCode && !batch.batchCode.toLowerCase().includes(filters.batchCode.toLowerCase())) {
      return false;
    }

    if (
      filters.receivingWarehouseName &&
      !batch.receivingWarehouseName.toLowerCase().includes(filters.receivingWarehouseName.toLowerCase())
    ) {
      return false;
    }

    if (filters.status && batch.status !== filters.status) {
      return false;
    }

    if (filters.shippingType && batch.shippingType !== filters.shippingType) {
      return false;
    }

    const departedAt = batch.departedAt ? dayjs(batch.departedAt) : null;

    if (filters.departedFrom && departedAt && departedAt.isBefore(filters.departedFrom.startOf("day"))) {
      return false;
    }

    if (filters.departedFrom && !departedAt) {
      return false;
    }

    if (filters.departedTo && departedAt && departedAt.isAfter(filters.departedTo.endOf("day"))) {
      return false;
    }

    if (filters.departedTo && !departedAt) {
      return false;
    }

    return true;
  });

const getPackageMatchTag = (pkg: CnPackage) =>
  pkg.status === "matched" ? <AlertBanner color="green" label="Khớp" /> : <AlertBanner color="orange" label="Chưa khớp" />;

const AlertBanner = ({ color, label }: { color: string; label: string }) => (
  <span
    style={{
      display: "inline-flex",
      padding: "2px 10px",
      borderRadius: 999,
      background: color === "green" ? "#f6ffed" : "#fff7e6",
      border: `1px solid ${color === "green" ? "#b7eb8f" : "#ffd591"}`,
      color: color === "green" ? "#389e0d" : "#d46b08",
      fontSize: 12,
      lineHeight: "20px",
    }}
  >
    {label}
  </span>
);

const exportBatchesToCsv = (rows: BatchViewModel[]) => {
  const headers = [
    "Ma lo hang",
    "Tổng số kiện",
    "Khoi luong",
    "The tich",
    "Kho nhan",
    "Ngay phat",
    "Ngay nhan",
    "Trang thai",
    "Hinh thuc van chuyen",
  ];

  const csvRows = rows.map((batch) => [
    batch.batchCode,
    batch.totalPackages,
    batch.totalWeight,
    batch.totalVolume,
    batch.receivingWarehouseName,
    batch.departedAt ? dayjs(batch.departedAt).format("DD/MM/YYYY") : "",
    batch.arrivedAt
      ? dayjs(batch.arrivedAt).format("DD/MM/YYYY")
      : batch.expectedArrivalAt
        ? dayjs(batch.expectedArrivalAt).format("DD/MM/YYYY")
        : "",
    batch.status,
    batch.shippingType,
  ]);

  const csvContent = [headers, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cn-batches-${dayjs().format("YYYYMMDD-HHmmss")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const emptyPackageRow = (): BatchPackageRow => ({
  key: `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  trackingNumber: "",
  weight: undefined,
  height: undefined,
  length: undefined,
  width: undefined,
  volume: 0,
});

export const CnBatchesPage = () => {
  const screens = Grid.useBreakpoint();
  const [filterForm] = Form.useForm<BatchFilters>();
  const [editForm] = Form.useForm<BatchEditFormValues>();
  const editingPackages = Form.useWatch("packages", editForm) ?? [];
  const [filters, setFilters] = useState<BatchFilters>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<BatchViewModel[]>([]);
  const [detailBatch, setDetailBatch] = useState<BatchViewModel | null>(null);
  const [editingBatch, setEditingBatch] = useState<BatchViewModel | null>(null);
  const [inboundModalOpen, setInboundModalOpen] = useState(false);
  const [submittingInbound, setSubmittingInbound] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const {
    result: batchListResponse,
    query: batchListQuery,
  } = useList<BatchApiRecord>({
    resource: "cnBatches",
    pagination: {
      currentPage: 1,
      pageSize: 1000,
    },
  });
  const { mutateAsync: updateBatch } = useUpdate<BatchApiRecord>();
  const { mutateAsync: deleteBatch } = useDelete<BatchApiRecord>();

  const batches = useMemo(
    () => (batchListResponse?.data ?? []).map(mapApiBatchToViewModel),
    [batchListResponse?.data],
  );

  const receivingWarehouseOptions = useMemo(
    () =>
      Array.from(new Set(batches.map((batch) => batch.receivingWarehouseName)))
        .filter(Boolean)
        .map((value) => ({ label: value, value })),
    [batches],
  );

  const filteredBatches = useMemo(() => filterBatches(batches, filters), [batches, filters]);

  const stats = useMemo(
    () => ({
      total: batches.length,
      exporting: batches.filter((batch) => batch.status === "exporting").length,
      arrivedVn: batches.filter((batch) => batch.status === "arrived_vn").length,
      completed: batches.filter((batch) => batch.status === "completed").length,
    }),
    [batches],
  );

  const eligibleInboundRows = useMemo(
    () => selectedRows.filter((batch) => canCreateVietnamInboundTask(batch).allowed),
    [selectedRows],
  );

  const inboundSummary = useMemo(
    () => ({
      totalPackages: eligibleInboundRows.reduce((sum, batch) => sum + batch.totalPackages, 0),
      totalWeight: eligibleInboundRows.reduce((sum, batch) => sum + batch.totalWeight, 0),
    }),
    [eligibleInboundRows],
  );

  const editTotals = useMemo(() => calculateBatchTotals(editingPackages), [editingPackages]);

  useEffect(() => {
    if (!editingBatch) {
      return;
    }

    editForm.setFieldsValue({
      totalWeight: Number(editTotals.totalWeight.toFixed(2)),
      totalVolume: Number(editTotals.totalVolume.toFixed(4)),
    });
  }, [editForm, editTotals.totalVolume, editTotals.totalWeight, editingBatch]);

  const handleSearch = (values: BatchFilters) => {
    setFilters({
      batchCode: values.batchCode?.trim() || undefined,
      receivingWarehouseName: values.receivingWarehouseName || undefined,
      status: values.status || undefined,
      shippingType: values.shippingType || undefined,
      departedFrom: values.departedFrom,
      departedTo: values.departedTo,
    });
  };

  const handleReset = () => {
    filterForm.resetFields();
    setFilters({});
  };

  const openEditModal = (batch: BatchViewModel) => {
    const permission = canEditBatch(batch);

    if (!permission.allowed) {
      message.warning(permission.reason);
      return;
    }

    editForm.setFieldsValue(mapBatchToEditFormValues(batch));
    setEditingBatch(batch);
  };

  const closeEditModal = () => {
    setEditingBatch(null);
    editForm.resetFields();
  };

  const handleUpdateBatch = async () => {
    if (!editingBatch) {
      return;
    }

    try {
      setSubmittingEdit(true);
      const values = await editForm.validateFields();
      await updateBatch({
        resource: "cnBatches",
        id: editingBatch.id,
        values: mapEditFormValuesToInput(values),
      });
      await batchListQuery.refetch();
      closeEditModal();
      message.success("Đã cập nhật lô hàng.");
    } catch (error) {
      console.error(error);
      message.error("Không thể cập nhật lô hàng.");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDeleteBatch = async (batch: BatchViewModel) => {
    const permission = canDeleteBatch(batch);

    if (!permission.allowed) {
      message.warning(permission.reason);
      return;
    }

    try {
      await deleteBatch({
        resource: "cnBatches",
        id: batch.id,
      });
      await batchListQuery.refetch();
      setSelectedRowKeys((current) => current.filter((key) => key !== batch.id));
      setSelectedRows((current) => current.filter((item) => item.id !== batch.id));
      if (detailBatch?.id === batch.id) {
        setDetailBatch(null);
      }
      message.success("Đã xóa lô hàng.");
    } catch (error) {
      console.error(error);
      message.error("Không thể xóa lô hàng.");
    }
  };

  const handleExportExcel = () => {
    const exportRows = selectedRows.length ? selectedRows : filteredBatches;

    if (!exportRows.length) {
      message.info("Không có dữ liệu để xuất.");
      return;
    }

    exportBatchesToCsv(exportRows);
    message.success("Đã xuất dữ liệu lô hàng.");
  };

  const openInboundModal = () => {
    if (!eligibleInboundRows.length) {
      return;
    }

    if (eligibleInboundRows.length < selectedRows.length) {
      message.info("Một số lô không hợp lệ cho nhiệm vụ nhập kho VN và sẽ được bỏ qua.");
    }

    setInboundModalOpen(true);
  };

  const handleCreateInboundTask = async () => {
    if (!eligibleInboundRows.length) {
      return;
    }

    try {
      setSubmittingInbound(true);
      syncGraphqlAuthToken();
      await client.request(
        CREATE_VIETNAM_INBOUND_TASK_MUTATION,
        {
          input: {
            cn_batch_ids: eligibleInboundRows.map((batch) => batch.id),
          },
        },
        getGraphqlAuthHeaders(),
      );
      await batchListQuery.refetch();
      setSelectedRowKeys([]);
      setSelectedRows([]);
      setInboundModalOpen(false);
      message.success("Đã tạo nhiệm vụ nhập kho Việt Nam.");
    } catch (error) {
      console.error(error);
      message.error("Không thể tạo nhiệm vụ nhập kho Việt Nam.");
    } finally {
      setSubmittingInbound(false);
    }
  };

  const columns: ColumnsType<BatchViewModel> = [
    {
      title: "Mã lô hàng",
      dataIndex: "batchCode",
      key: "batchCode",
      width: 170,
      render: (value: string) => (
        <Text strong copyable={{ text: value }}>
          {value}
        </Text>
      ),
    },
    {
      title: "Tổng số kiện",
      dataIndex: "totalPackages",
      key: "totalPackages",
      width: 120,
    },
    {
      title: "Khối lượng thực tế",
      dataIndex: "totalWeight",
      key: "totalWeight",
      width: 150,
      render: (value: number) => formatWeight(value),
    },
    {
      title: "Thể tích",
      dataIndex: "totalVolume",
      key: "totalVolume",
      width: 120,
      render: (value: number) => formatVolume(value),
    },
    {
      title: "Kho nhận",
      dataIndex: "receivingWarehouseName",
      key: "receivingWarehouseName",
      width: 180,
    },
    {
      title: "Ngày phát",
      dataIndex: "departedAt",
      key: "departedAt",
      width: 140,
      render: (value?: string) => (value ? dayjs(value).format("DD/MM/YYYY") : <Text type="secondary">Chưa có</Text>),
    },
    {
      title: "Ngày nhận",
      key: "arrivalDate",
      width: 150,
      render: (_, record) =>
        record.arrivedAt ? (
          dayjs(record.arrivedAt).format("DD/MM/YYYY")
        ) : record.expectedArrivalAt ? (
          <Text type="secondary">{dayjs(record.expectedArrivalAt).format("DD/MM/YYYY")}</Text>
        ) : (
          <Text type="secondary">Chưa có</Text>
        ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 160,
      render: (value: BatchViewModel["status"]) => getBatchStatusTag(value),
    },
    {
      title: "Hình thức vận chuyển",
      dataIndex: "shippingType",
      key: "shippingType",
      width: 160,
      render: (value: BatchViewModel["shippingType"]) => getShippingTypeTag(value),
    },
    {
      title: "Thao tác",
      key: "actions",
      fixed: "right",
      width: 140,
      render: (_, record) => {
        const editState = canEditBatch(record);
        const deleteState = canDeleteBatch(record);

        return (
          <Space size="small">
            <Tooltip title="Xem chi tiết">
              <Button type="text" icon={<EyeOutlined />} onClick={() => setDetailBatch(record)} />
            </Tooltip>

            {editState.allowed ? (
              <Tooltip title="Sửa lô hàng">
                <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
              </Tooltip>
            ) : (
              <Tooltip title={editState.reason}>
                <span>
                  <Button type="text" icon={<EditOutlined />} disabled />
                </span>
              </Tooltip>
            )}

            {deleteState.allowed ? (
              <Popconfirm
                title="Xóa lô hàng?"
                description="Lô hàng sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác."
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeleteBatch(record)}
              >
                <Tooltip title="Xóa lô hàng">
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            ) : (
              <Tooltip title={deleteState.reason}>
                <span>
                  <Button danger type="text" icon={<DeleteOutlined />} disabled />
                </span>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  const detailColumns: ColumnsType<CnPackage> = [
    {
      title: "Mã vận đơn",
      dataIndex: "tracking_number",
      key: "tracking_number",
      render: (value?: string) => value ?? "Chưa có",
    },
    {
      title: "Người nhận",
      dataIndex: "receiver_name",
      key: "receiver_name",
      render: (value?: string) => value ?? "Chưa có",
    },
    {
      title: "Cân nặng",
      dataIndex: "weight",
      key: "weight",
      render: (value?: number | null) => formatWeight(value),
    },
    {
      title: "Khớp / chưa khớp",
      key: "match_status",
      render: (_, record) => getPackageMatchTag(record),
    },
  ];

  const isInitialLoading = batchListQuery.isLoading && !batchListResponse;
  const isRefreshing = Boolean(batchListQuery.isFetching && !isInitialLoading);
  const pageError = batchListQuery.isError
    ? batchListQuery.error instanceof Error
      ? batchListQuery.error.message
      : "Không thể tải dữ liệu lô hàng."
    : null;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {pageError ? <Alert type="error" message={pageError} showIcon /> : null}

      <PageHeader
        title="Quản lý lô hàng vận chuyển"
        description="Quản lý các lô hàng được gom từ kho Trung Quốc để vận chuyển về Việt Nam."
      />

      {isInitialLoading ? (
        <CnBatchStatsSkeleton />
      ) : (
        <StatsGrid columns={4}>
          <StatCard label="Tổng lô hàng" value={stats.total} unit="lô" icon={<InboxOutlined />} tone="blue" />
          <StatCard label="Đang vận chuyển" value={stats.exporting} unit="lô" icon={<ClockCircleOutlined />} tone="orange" />
          <StatCard label="Đã về kho Việt Nam" value={stats.arrivedVn} unit="lô" icon={<CheckCircleOutlined />} tone="purple" />
          <StatCard label="Hoàn tất" value={stats.completed} unit="lô" icon={<CheckCircleOutlined />} tone="green" />
        </StatsGrid>
      )}
      <Card title="Bộ lọc tìm kiếm">
        <Form<BatchFilters> form={filterForm} layout="vertical" onFinish={handleSearch}>
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Mã lô hàng" name="batchCode">
                <Input placeholder="Nhập mã lô hàng..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Kho nhận" name="receivingWarehouseName">
                <Select allowClear showSearch options={receivingWarehouseOptions} placeholder="Chọn kho nhận" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Trạng thái" name="status">
                <Select allowClear options={STATUS_OPTIONS as unknown as { label: string; value: string }[]} placeholder="Chọn trạng thái" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Loại hình vận chuyển" name="shippingType">
                <Select allowClear options={SHIPPING_TYPE_OPTIONS as unknown as { label: string; value: string }[]} placeholder="Chọn hình thức" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={4}>
              <Form.Item label="Ngày phát từ ngày" name="departedFrom">
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={4}>
              <Form.Item label="Đến ngày" name="departedTo">
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Space wrap>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              Tìm kiếm
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              Reset
            </Button>
          </Space>
        </Form>
      </Card>

      <Card styles={{ body: { padding: "16px 20px" } }}>
        <Row gutter={[12, 12]} justify="space-between" align="middle">
          <Col xs={24} lg="auto">
            <Text>
              Đã chọn <Text strong>{selectedRowKeys.length}</Text> lô
            </Text>
          </Col>
          <Col xs={24} lg="auto">
            <Space wrap>
              <Button icon={<FileExcelOutlined />} onClick={handleExportExcel}>
                Xuất Excel
              </Button>
              <Tooltip
                title={
                  eligibleInboundRows.length
                    ? selectedRows.length > eligibleInboundRows.length
                      ? "Một số lô không hợp lệ sẽ bị bỏ qua."
                      : "Tạo nhiệm vụ nhập kho VN cho các lô đã chọn."
                    : "Chọn ít nhất 1 lô đã về kho Việt Nam để tạo nhiệm vụ."
                }
              >
                <span>
                  <Button
                    type="primary"
                    icon={<InboxOutlined />}
                    disabled={!eligibleInboundRows.length}
                    onClick={openInboundModal}
                  >
                    Tạo nhiệm vụ nhập kho VN
                  </Button>
                </span>
              </Tooltip>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        {isInitialLoading ? (
          <AdminTableSkeleton columns={columns} scroll={{ x: 1320 }} rowSelection rowCount={10} />
        ) : (
          <LoadingOverlay spinning={isRefreshing}>
            {filteredBatches.length ? (
              <Table<BatchViewModel>
                rowKey="id"
                columns={columns}
                dataSource={filteredBatches}
                scroll={{ x: 1320 }}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys, rows) => {
                    setSelectedRowKeys(keys);
                    setSelectedRows(rows);
                  },
                }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có lô hàng nào phù hợp điều kiện tìm kiếm." />
            )}
          </LoadingOverlay>
        )}
      </Card>

      <Modal
        title="Chi tiết lô hàng"
        open={Boolean(detailBatch)}
        onCancel={() => setDetailBatch(null)}
        footer={null}
        width={screens.lg ? 900 : "92vw"}
      >
        {detailBatch ? (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Mã lô hàng">
                <Text strong copyable={{ text: detailBatch.batchCode }}>
                  {detailBatch.batchCode}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">{getBatchStatusTag(detailBatch.status)}</Descriptions.Item>
              <Descriptions.Item label="Kho xuất">{detailBatch.originWarehouseName}</Descriptions.Item>
              <Descriptions.Item label="Kho nhận">{detailBatch.receivingWarehouseName}</Descriptions.Item>
              <Descriptions.Item label="Ngày gom lô">
                {detailBatch.createdAt ? dayjs(detailBatch.createdAt).format("DD/MM/YYYY HH:mm") : "Chưa có"}
              </Descriptions.Item>
              <Descriptions.Item label="Hình thức vận chuyển">
                {getShippingTypeTag(detailBatch.shippingType)}
              </Descriptions.Item>
              <Descriptions.Item label="Tổng số kiện">{detailBatch.totalPackages}</Descriptions.Item>
              <Descriptions.Item label="Tổng cân nặng">{formatWeight(detailBatch.totalWeight)}</Descriptions.Item>
              <Descriptions.Item label="Tổng thể tích">{formatVolume(detailBatch.totalVolume)}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú" span={2}>
                {detailBatch.note || "Không có ghi chú"}
              </Descriptions.Item>
            </Descriptions>

            <Card size="small" title="Danh sách kiện trong lô">
              <Table<CnPackage>
                rowKey="id"
                columns={detailColumns}
                dataSource={detailBatch.packages}
                scroll={{ x: 640 }}
                pagination={false}
              />
            </Card>
          </Space>
        ) : null}
      </Modal>

      <Modal
        title="Sửa thông tin lô hàng vận chuyển"
        open={Boolean(editingBatch)}
        onCancel={closeEditModal}
        onOk={handleUpdateBatch}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        confirmLoading={submittingEdit}
        width={screens.lg ? "90vw" : "96vw"}
        destroyOnClose
        maskClosable={false}
        styles={{
          body: { maxHeight: "72vh", overflowY: "auto", paddingTop: 20 },
        }}
      >
        <Form<BatchEditFormValues> form={editForm} layout="vertical">
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Mã lô hàng" name="batchCode" rules={[{ required: true, message: "Vui lòng nhập mã lô hàng." }]}>
                <Input disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item
                label="Kho nhận"
                name="receivingWarehouseName"
                rules={[{ required: true, message: "Vui lòng chọn kho nhận." }]}
              >
                <Select
                  showSearch
                  options={receivingWarehouseOptions}
                  placeholder="Chọn kho nhận"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item
                label="Trạng thái"
                name="status"
                rules={[{ required: true, message: "Vui lòng chọn trạng thái." }]}
              >
                <Select options={STATUS_OPTIONS as unknown as { label: string; value: string }[]} />
              </Form.Item>
            </Col>

            <Col xs={24} md={12} xl={8}>
              <Form.Item
                label="Ngày phát"
                name="departedAt"
                rules={[{ required: true, message: "Vui lòng chọn ngày phát." }]}
              >
                <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item
                label="Loại hình vận chuyển"
                name="shippingType"
                rules={[{ required: true, message: "Vui lòng chọn loại hình vận chuyển." }]}
              >
                <Select options={SHIPPING_TYPE_OPTIONS as unknown as { label: string; value: string }[]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Giá cước" name="freightCost">
                <InputNumber min={0} precision={0} addonAfter="đ" style={{ width: "100%" }} placeholder="Nhập giá cước" />
              </Form.Item>
            </Col>

            <Col xs={24} md={12} xl={8}>
              <Form.Item
                label="Khối lượng lô hàng"
                name="totalWeight"
                rules={[{ required: true, message: "Vui lòng nhập khối lượng lô hàng." }]}
              >
                <InputNumber disabled precision={2} addonAfter="kg" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item
                label="Thể tích"
                name="totalVolume"
                rules={[{ required: true, message: "Vui lòng nhập thể tích." }]}
              >
                <InputNumber disabled precision={4} addonAfter="m³" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item
                label="Ngày nhận dự kiến"
                name="expectedArrivalAt"
                rules={[{ required: true, message: "Vui lòng chọn ngày nhận dự kiến." }]}
              >
                <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item label="Ghi chú" name="note">
                <Input.TextArea rows={4} placeholder="Nhập ghi chú nếu có..." />
              </Form.Item>
            </Col>
          </Row>

          <Form.List name="packages">
            {(fields, { add, remove }) => {
              const packageColumns: ColumnsType<{ fieldKey: number; row: BatchPackageRow }> = [
                {
                  title: "Mã vận đơn",
                  width: 220,
                  render: (_, item) => (
                    <Form.Item
                      name={[item.fieldKey, "trackingNumber"]}
                      style={{ margin: 0 }}
                      rules={[{ required: true, message: "Nhập mã vận đơn." }]}
                    >
                      <Input placeholder="Nhập mã vận đơn" />
                    </Form.Item>
                  ),
                },
                {
                  title: "Khối lượng (kg)",
                  width: 140,
                  render: (_, item) => (
                    <Form.Item
                      name={[item.fieldKey, "weight"]}
                      style={{ margin: 0 }}
                      rules={[{ required: true, message: "Nhập khối lượng." }]}
                    >
                      <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                    </Form.Item>
                  ),
                },
                {
                  title: "Chiều cao (cm)",
                  width: 140,
                  render: (_, item) => (
                    <Form.Item name={[item.fieldKey, "height"]} style={{ margin: 0 }}>
                      <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                    </Form.Item>
                  ),
                },
                {
                  title: "Chiều dài (cm)",
                  width: 140,
                  render: (_, item) => (
                    <Form.Item name={[item.fieldKey, "length"]} style={{ margin: 0 }}>
                      <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                    </Form.Item>
                  ),
                },
                {
                  title: "Chiều rộng (cm)",
                  width: 140,
                  render: (_, item) => (
                    <Form.Item name={[item.fieldKey, "width"]} style={{ margin: 0 }}>
                      <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                    </Form.Item>
                  ),
                },
                {
                  title: "Thể tích (m³)",
                  width: 140,
                  align: "right",
                  render: (_, item) => {
                    const current = editingPackages[item.fieldKey];
                    return <Text>{Number(calculatePackageVolume(current ?? {})).toFixed(4)}</Text>;
                  },
                },
                {
                  title: "Hành động",
                  width: 90,
                  align: "center",
                  render: (_, item) => (
                    <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(item.fieldKey)} />
                  ),
                },
              ];

              const dataSource = fields.map((field, index) => ({
                key: field.key,
                fieldKey: index,
                row: editingPackages[index],
              }));

              return (
                <Card
                  size="small"
                  title="Danh sách vận đơn"
                  extra={
                    <Button type="primary" ghost icon={<PlusOutlined />} onClick={() => add(emptyPackageRow())}>
                      Thêm vận đơn
                    </Button>
                  }
                  styles={{ body: { paddingTop: 8 } }}
                >
                  <Table
                    rowKey="key"
                    bordered
                    size="middle"
                    pagination={false}
                    scroll={{ x: 980 }}
                    dataSource={dataSource}
                    columns={packageColumns}
                    locale={{ emptyText: "Chưa có vận đơn nào trong lô." }}
                    summary={() => (
                      <Table.Summary fixed>
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0}>
                            <Text strong>Tổng cộng</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={1}>
                            <Text strong>{Number(editTotals.totalWeight).toFixed(2)}</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} />
                          <Table.Summary.Cell index={3} />
                          <Table.Summary.Cell index={4} />
                          <Table.Summary.Cell index={5} align="right">
                            <Text strong>{Number(editTotals.totalVolume).toFixed(4)}</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={6} />
                        </Table.Summary.Row>
                      </Table.Summary>
                    )}
                  />
                </Card>
              );
            }}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title="Tạo nhiệm vụ nhập kho VN"
        open={inboundModalOpen}
        onCancel={() => setInboundModalOpen(false)}
        onOk={handleCreateInboundTask}
        okText="Tạo nhiệm vụ"
        cancelText="Hủy"
        confirmLoading={submittingInbound}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Card size="small">
            <Row gutter={[12, 12]}>
              <Col span={8}>
                <Statistic title="Số lô đã chọn" value={eligibleInboundRows.length} />
              </Col>
              <Col span={8}>
                <Statistic title="Tổng số kiện" value={inboundSummary.totalPackages} />
              </Col>
              <Col span={8}>
                <Statistic title="Tổng khối lượng" value={inboundSummary.totalWeight} precision={1} suffix="kg" />
              </Col>
            </Row>
          </Card>

          <div>
            <Text strong>Danh sách mã lô</Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                {eligibleInboundRows.map((batch) => (
                  <Text key={batch.id} code>
                    {batch.batchCode}
                  </Text>
                ))}
              </Space>
            </div>
          </div>
        </Space>
      </Modal>
    </Space>
  );
};

