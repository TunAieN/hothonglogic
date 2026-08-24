import { useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import { useCreate, useDelete, useList, useUpdate } from "@refinedev/core";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FileSearchOutlined,
  InboxOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { UploadProps } from "antd";
import dayjs from "dayjs";
import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import { CHINA_WAREHOUSE_OPTIONS } from "./mockData";
import {
  calculateSelectedTotalWeight,
  canDeletePackage,
  canSelectPackage,
  formatWeight,
  getAvailableBatchOptions,
  getBatchDisplayName,
  getNextBatchCode,
  getPackageSelectionReason,
  getStatusTag,
  getWarehouseCode,
  isPackageEligibleForBatch,
  mapBatchFormValuesToInput,
  mapApiRecordToPackage,
  mapFormValuesToCreateInput,
  mapFormValuesToUpdateInput,
  mapRecordToFormValues,
  renderBatchTag,
} from "./helpers";
import { ConfirmPackageItemsModal } from "./components/ConfirmPackageItemsModal";
import { AdminTableSkeleton, LoadingOverlay, SkeletonStatCard } from "../../components/admin-loading";
import { PageHeader, StatCard, StatsGrid } from "../../components/admin-page-summary";
import type {
  ChinaWarehouseApiRecord,
  ChinaWarehouseBatchRecord,
  ChinaWarehouseFilters,
  ChinaWarehousePackage,
  BatchModalFormValues,
  PackageFormValues,
} from "./types";

const { Text, Paragraph } = Typography;
const { Dragger } = Upload;

const filterCardBodyStyle = { padding: 20 };
const toolbarCardBodyStyle = { padding: "14px 18px" };
const defaultFilterValues: ChinaWarehouseFilters = {};
const ChinaWarehouseStatsSkeleton = () => (
  <Row gutter={[12, 12]}>
    <Col xs={12} md={6}>
      <SkeletonStatCard labelWidth={76} valueWidth={42} />
    </Col>
    <Col xs={12} md={6}>
      <SkeletonStatCard labelWidth={62} valueWidth={42} />
    </Col>
    <Col xs={12} md={6}>
      <SkeletonStatCard labelWidth={74} valueWidth={42} />
    </Col>
    <Col xs={12} md={6}>
      <SkeletonStatCard labelWidth={70} valueWidth={42} />
    </Col>
  </Row>
);

const ADD_PACKAGES_TO_BATCH_MUTATION = `
  mutation AddPackagesToCnBatch($input: AddPackagesToCnBatchInput!) {
    addPackagesToCnBatch(input: $input) {
      id
      batch_code
      status
      total_weight
    }
  }
`;

const CONFIRM_CN_PACKAGE_ITEMS_MUTATION = `
  mutation ConfirmCnPackageItems($packageId: ID!, $items: [OrderPackageItemInput!]!) {
    confirmCnPackageItems(package_id: $packageId, items: $items) {
      id
    }
  }
`;

const packageMatchesFilters = (
  record: ChinaWarehousePackage,
  filters: ChinaWarehouseFilters,
) => {
  const warehouseName = filters.warehouseName?.trim().toLowerCase();
  const trackingCode = filters.trackingCode?.trim().toLowerCase();
  const receiverName = filters.receiverName?.trim().toLowerCase();
  const receivedDate = dayjs(record.receivedDate);

  if (warehouseName && record.warehouseName.toLowerCase() !== warehouseName) {
    return false;
  }

  if (trackingCode && !record.trackingCode.toLowerCase().includes(trackingCode)) {
    return false;
  }

  if (receiverName && !record.receiverName.toLowerCase().includes(receiverName)) {
    return false;
  }

  if (filters.status && record.status !== filters.status) {
    return false;
  }

  if (filters.receivedFrom && receivedDate.isBefore(filters.receivedFrom.startOf("day"))) {
    return false;
  }

  if (filters.receivedTo && receivedDate.isAfter(filters.receivedTo.endOf("day"))) {
    return false;
  }

  return true;
};

export const ChinaWarehousePage = () => {
  const [filters, setFilters] = useState<ChinaWarehouseFilters>(defaultFilterValues);
  const [form] = Form.useForm<PackageFormValues>();
  const [filterForm] = Form.useForm<ChinaWarehouseFilters>();
  const [batchForm] = Form.useForm<BatchModalFormValues>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ChinaWarehousePackage | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<ChinaWarehousePackage[]>([]);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  const [isSyncingStatuses, setIsSyncingStatuses] = useState(false);
  const [confirmItemsModalOpen, setConfirmItemsModalOpen] = useState(false);
  const [confirmingPackage, setConfirmingPackage] = useState<ChinaWarehousePackage | null>(null);
  const [isConfirmingItems, setIsConfirmingItems] = useState(false);
  const screens = Grid.useBreakpoint();
  const {
    result: packageListResponse,
    query: packageListQuery,
  } = useList<ChinaWarehouseApiRecord>({
    resource: "cnPackages",
    pagination: {
      currentPage: 1,
      pageSize: 1000,
    },
  });
  const {
    result: batchListResponse,
    query: batchListQuery,
  } = useList<ChinaWarehouseBatchRecord>({
    resource: "cnBatches",
    pagination: {
      currentPage: 1,
      pageSize: 1000,
    },
  });
  const { mutateAsync: createPackage } = useCreate<ChinaWarehouseApiRecord>();
  const { mutateAsync: updatePackage } = useUpdate<ChinaWarehouseApiRecord>();
  const { mutateAsync: deletePackage } = useDelete<ChinaWarehouseApiRecord>();

  const packages = useMemo(
    () => (packageListResponse?.data ?? []).map(mapApiRecordToPackage),
    [packageListResponse?.data],
  );
  const batches = useMemo(() => batchListResponse?.data ?? [], [batchListResponse?.data]);

  const filteredPackages = useMemo(
    () => packages.filter((item) => packageMatchesFilters(item, filters)),
    [filters, packages],
  );

  const stats = useMemo(
    () => ({
      total: packages.length,
      matched: packages.filter((item) => item.status === "matched").length,
      unmatched: packages.filter((item) => item.status === "unmatched").length,
      batched: packages.filter((item) => Boolean(item.batchCode)).length,
    }),
    [packages],
  );

  const selectedTotalWeight = useMemo(
    () => calculateSelectedTotalWeight(selectedRows),
    [selectedRows],
  );

  const predictedBatchCode = useMemo(() => {
    if (!selectedRows.length) {
      return undefined;
    }

    const warehouseCode = getWarehouseCode(selectedRows[0].warehouseName);
    const existingBatches = batches
      .map((item) => item.batch_code)
      .filter((value): value is string => Boolean(value));

    return getNextBatchCode(warehouseCode, new Date(), existingBatches);
  }, [batches, selectedRows]);

  const selectedWarehouseId = selectedRows[0]?.warehouseId;
  const availableBatches = useMemo(
    () => getAvailableBatchOptions(batches, selectedWarehouseId),
    [batches, selectedWarehouseId],
  );
  const batchMode = Form.useWatch("batchMode", batchForm) ?? "create";
  const watchedWeight = Form.useWatch("weight", form) ?? 0;
  const watchedLength = Form.useWatch("actualLength", form) ?? 0;
  const watchedWidth = Form.useWatch("actualWidth", form) ?? 0;
  const watchedHeight = Form.useWatch("actualHeight", form) ?? 0;

  const measuredVolume = useMemo(() => {
    if (!watchedLength || !watchedWidth || !watchedHeight) {
      return 0;
    }

    return Number(((watchedLength * watchedWidth * watchedHeight) / 1000000).toFixed(4));
  }, [watchedHeight, watchedLength, watchedWidth]);

  const volumetricWeight = useMemo(() => {
    if (!watchedLength || !watchedWidth || !watchedHeight) {
      return 0;
    }

    return Number(((watchedLength * watchedWidth * watchedHeight) / 6000).toFixed(2));
  }, [watchedHeight, watchedLength, watchedWidth]);

  const chargeableWeight = useMemo(
    () => Number(Math.max(watchedWeight, volumetricWeight).toFixed(2)),
    [volumetricWeight, watchedWeight],
  );

  useEffect(() => {
    if (!batchModalOpen) {
      return;
    }

    batchForm.setFieldsValue({
      batchMode: "create",
      cnBatchId: undefined,
      shippingType: "normal",
      destinationWarehouseName: undefined,
      expectedArrivalAt: undefined,
      note: undefined,
    });
  }, [batchForm, batchModalOpen]);

  const openCreateDrawer = () => {
    setEditingRecord(null);
    form.setFieldsValue({
      trackingCode: "",
      receiverName: "",
      warehouseName: "Kho Quảng Châu",
      weight: 0.1,
      actualLength: 0,
      actualWidth: 0,
      actualHeight: 0,
      packageCondition: "normal",
      receivedDate: dayjs(),
      status: "unmatched",
      note: "",
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (record: ChinaWarehousePackage) => {
    setEditingRecord(record);
    form.setFieldsValue(mapRecordToFormValues(record));
    setDrawerOpen(true);
  };

  const openConfirmItemsModal = (record: ChinaWarehousePackage) => {
    setConfirmingPackage(record);
    setConfirmItemsModalOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingRecord(null);
    form.resetFields();
  };

  const handleManualReceivingStatusSync = async () => {
    setIsSyncingStatuses(true);
    message.info("Trạng thái receiving hiện được đồng bộ tự động ở backend khi nhập kho.");
    setIsSyncingStatuses(false);
  };

  const handleSubmitPackage = async () => {
    try {
      setIsSubmitting(true);
      const values = await form.validateFields();

      if (editingRecord) {
        await updatePackage({
          resource: "cnPackages",
          id: editingRecord.id,
          values: mapFormValuesToUpdateInput(values),
        });
        await packageListQuery.refetch();
        message.success("Đã cập nhật thông tin kiện hàng.");
      } else {
        await createPackage({
          resource: "cnPackages",
          values: mapFormValuesToCreateInput(values),
        });
        await packageListQuery.refetch();
        message.success("Đã thêm kiện hàng vào kho Trung Quốc.");
      }

      closeDrawer();
    } catch (error) {
      console.error(error);
      message.error(
        editingRecord
          ? "Không thể cập nhật kiện hàng."
          : "Không thể thêm kiện hàng. Vui lòng thử lại.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePackage = async (record: ChinaWarehousePackage) => {
    const deleteState = canDeletePackage(record);

    if (!deleteState.canDelete) {
      message.error(deleteState.reason);
      return;
    }

    try {
      await deletePackage({
        resource: "cnPackages",
        id: record.id,
      });
      await Promise.all([packageListQuery.refetch(), batchListQuery.refetch()]);
      setSelectedRowKeys((current) => current.filter((key) => key !== record.id));
      setSelectedRows((current) => current.filter((item) => item.id !== record.id));
      message.success("Đã xóa kiện hàng.");
    } catch (error) {
      console.error(error);
      message.error("Không thể xóa kiện hàng.");
    }
  };

  const openExcelImportModal = () => {
    setExcelModalOpen(true);
  };

  const openBatchModal = () => {
    if (!selectedRows.length) {
      message.warning("Vui lòng chọn ít nhất một kiện hàng.");
      return;
    }

    if (new Set(selectedRows.map((item) => item.warehouseId)).size > 1) {
      message.warning("Vui lòng chỉ chọn các kiện cùng một kho hàng để thêm vào lô.");
      return;
    }

    const invalidPackage = selectedRows.find((item) => !isPackageEligibleForBatch(item));

    if (invalidPackage) {
      message.error("Có kiện hàng đã thuộc lô hoặc không còn hợp lệ để thêm vào lô.");
      return;
    }

    setBatchModalOpen(true);
  };

  const handleConfirmPackageItems = async (
    items: Array<{ order_item_id: string; quantity: number }>,
  ) => {
    if (!confirmingPackage) {
      return;
    }

    try {
      setIsConfirmingItems(true);
      syncGraphqlAuthToken();
      await client.request(
        CONFIRM_CN_PACKAGE_ITEMS_MUTATION,
        {
          packageId: confirmingPackage.id,
          items,
        },
        getGraphqlAuthHeaders(),
      );
      await packageListQuery.refetch();
      setConfirmItemsModalOpen(false);
      setConfirmingPackage(null);
      message.success("Da xac nhan item trong kien hang.");
    } catch (error) {
      console.error(error);
      message.error("Khong the xac nhan item trong kien hang.");
      throw error;
    } finally {
      setIsConfirmingItems(false);
    }
  };

  const handleAddToBatch = async () => {
    if (!selectedRows.length) {
      message.warning("Vui lòng chọn ít nhất một kiện hàng.");
      return;
    }

    try {
      setIsBatchSubmitting(true);
      const values = await batchForm.validateFields();

      if (values.batchMode === "existing") {
        const selectedBatch = availableBatches.find((batch) => batch.id === values.cnBatchId);

        if (!selectedBatch) {
          message.error("Vui lòng chọn một lô hàng hợp lệ.");
          return;
        }

        if (["exporting", "arrived_vn", "completed", "cancelled"].includes(selectedBatch.status)) {
          message.error("Không thể thêm kiện vào lô đang vận chuyển, đã về kho Việt Nam, hoàn tất hoặc đã hủy.");
          return;
        }
      }

      syncGraphqlAuthToken();
      await client.request(
        ADD_PACKAGES_TO_BATCH_MUTATION,
        {
          input: mapBatchFormValuesToInput(values, selectedRows.map((item) => item.id)),
        },
        getGraphqlAuthHeaders(),
      );
      await Promise.all([packageListQuery.refetch(), batchListQuery.refetch()]);
      setSelectedRowKeys([]);
      setSelectedRows([]);
      setBatchModalOpen(false);
      batchForm.resetFields();
      message.success("Đã thêm kiện vào lô hàng.");
    } catch (error) {
      console.error(error);
      message.error("Không thể thêm kiện vào lô hàng.");
    } finally {
      setIsBatchSubmitting(false);
    }
  };

  const handleSearch = (values: ChinaWarehouseFilters) => {
    setFilters({
      warehouseName: values.warehouseName || undefined,
      trackingCode: values.trackingCode?.trim() || undefined,
      receiverName: values.receiverName?.trim() || undefined,
      status: values.status || undefined,
      receivedFrom: values.receivedFrom,
      receivedTo: values.receivedTo,
    });
  };

  const handleReset = () => {
    filterForm.resetFields();
    setFilters(defaultFilterValues);
  };

  const uploadProps: UploadProps = {
    accept: ".xlsx,.xls",
    beforeUpload: (file) => {
      const validFile = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

      if (!validFile) {
        message.error("Chỉ hỗ trợ file Excel .xlsx hoặc .xls.");
        return Upload.LIST_IGNORE;
      }

      message.info("Chức năng import Excel sẽ được kết nối API sau.");
      return Upload.LIST_IGNORE;
    },
    multiple: false,
    showUploadList: true,
  };

  const columns: ColumnsType<ChinaWarehousePackage> = [
    {
      title: "Tên kho hàng",
      dataIndex: "warehouseName",
      key: "warehouseName",
      width: 170,
    },
    {
      title: "Người nhận",
      dataIndex: "receiverName",
      key: "receiverName",
      width: 180,
    },
    {
      title: "Mã vận đơn",
      dataIndex: "trackingCode",
      key: "trackingCode",
      width: 180,
      render: (value: string) => (
        <Text strong copyable={{ text: value }}>
          {value}
        </Text>
      ),
    },
    {
      title: "Ngày nhận hàng",
      dataIndex: "receivedDate",
      key: "receivedDate",
      width: 140,
      render: (value: string) => dayjs(value).format("DD/MM/YYYY"),
    },
    {
      title: "Khối lượng",
      dataIndex: "weight",
      key: "weight",
      width: 120,
      render: (value: number) => formatWeight(value),
    },
    {
      title: "Tên KH / Mã hóa đơn",
      key: "customerInfo",
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.customerName ?? "Chưa có khách hàng"}</Text>
          <Text type="secondary">{record.invoiceCode ?? "Chưa có mã hóa đơn"}</Text>
        </Space>
      ),
    },
    {
      title: "Mã lô hàng",
      dataIndex: "batchCode",
      key: "batchCode",
      width: 160,
      render: (value?: string) => renderBatchTag(value),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (_, record) => getStatusTag(record.status),
    },
    {
      title: "Thao tác",
      key: "actions",
      fixed: "right",
      width: 120,
      render: (_, record) => {
        const deleteState = canDeletePackage(record);

        return (
          <Space size="small">
            <Tooltip title="Sửa kiện hàng">
              <Button type="text" icon={<EditOutlined />} onClick={() => openEditDrawer(record)} />
            </Tooltip>
            {deleteState.canDelete ? (
              <Popconfirm
                title="Xóa kiện hàng?"
                description="Bạn có chắc muốn xóa kiện hàng này không? Hành động này không thể hoàn tác."
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeletePackage(record)}
              >
                <Tooltip title="Xóa kiện hàng">
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

  const tableColumns = useMemo<ColumnsType<ChinaWarehousePackage>>(() => {
    const confirmItemsColumn: ColumnsType<ChinaWarehousePackage>[number] = {
      title: "Item da xac nhan",
      key: "confirmedItems",
      width: 150,
      render: (_, record) => (
        <Tag color={record.confirmedItemCount > 0 ? "green" : "default"}>
          {record.confirmedItemCount > 0 ? `${record.confirmedItemCount} item` : "Chưa xác nhận"}
        </Tag>
      ),
    };

    return columns.flatMap((column) => {
      if (column.key === "actions") {
        const nextColumn = {
          ...column,
          width: 180,
          render: (_: unknown, record: ChinaWarehousePackage) => {
            const deleteState = canDeletePackage(record);
            const canConfirmItems = Boolean(
              record.orderId && record.orderTrackingId && record.orderItems.length > 0,
            );

            return (
              <Space size="small">
                <Tooltip
                  title={
                    canConfirmItems
                      ? "Xác nhận item trong kiện"
                      : "Tracking chua khop don hang de xac nhan item"
                  }
                >
                  <Button
                    type="text"
                    icon={<FileSearchOutlined />}
                    disabled={!canConfirmItems}
                    onClick={() => openConfirmItemsModal(record)}
                  />
                </Tooltip>
                <Tooltip title="Sửa kiện hàng">
                  <Button type="text" icon={<EditOutlined />} onClick={() => openEditDrawer(record)} />
                </Tooltip>
                {deleteState.canDelete ? (
                  <Popconfirm
                    title="Xóa kiện hàng?"
                    description="Bạn có chắc muốn xóa kiện hàng này không? Hành động này không thể hoàn tác."
                    okText="Xóa"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDeletePackage(record)}
                  >
                    <Tooltip title="Xóa kiện hàng">
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
        };

        return [confirmItemsColumn, nextColumn];
      }

      return [column];
    });
  }, [columns]);

  const isInitialLoading = (packageListQuery.isLoading || batchListQuery.isLoading) && !packageListResponse && !batchListResponse;
  const isRefreshing = Boolean(
    (packageListQuery.isFetching || batchListQuery.isFetching) && !isInitialLoading,
  );
  const pageError = packageListQuery.isError
    ? packageListQuery.error instanceof Error
      ? packageListQuery.error.message
      : "Không thể tải dữ liệu kiện hàng."
    : null;

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {pageError ? <Alert type="error" message={pageError} showIcon /> : null}

      <PageHeader
        title="Kho hàng Trung Quốc"
        description="Quản lý kiện hàng đã về kho Trung Quốc, đối chiếu mã vận đơn và gom kiện vào lô vận chuyển về Việt Nam."
      />

      {isInitialLoading ? (
        <ChinaWarehouseStatsSkeleton />
      ) : (
        <StatsGrid columns={4}>
          <StatCard label="Tổng kiện" value={stats.total} unit="kiện" icon={<InboxOutlined />} tone="blue" />
          <StatCard label="Đã khớp" value={stats.matched} unit="kiện" icon={<CheckCircleOutlined />} tone="green" />
          <StatCard label="Chưa khớp" value={stats.unmatched} unit="kiện" icon={<FileSearchOutlined />} tone="orange" />
          <StatCard label="Đã vào lô" value={stats.batched} unit="kiện" icon={<PlusCircleOutlined />} tone="purple" />
        </StatsGrid>
      )}
      <Card title="Bộ lọc tìm kiếm" styles={{ body: filterCardBodyStyle }}>
        <Form<ChinaWarehouseFilters> form={filterForm} layout="vertical" onFinish={handleSearch}>
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Kho hàng" name="warehouseName">
                <Select
                  allowClear
                  options={CHINA_WAREHOUSE_OPTIONS.map((item) => ({ label: item, value: item }))}
                  placeholder="Chọn kho hàng"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Mã vận đơn" name="trackingCode">
                <Input placeholder="Nhập mã vận đơn..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Người nhận" name="receiverName">
                <Input placeholder="Nhập người nhận..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Trạng thái" name="status">
                <Select
                  allowClear
                  options={[
                    { label: "Khớp", value: "matched" },
                    { label: "Chưa khớp", value: "unmatched" },
                  ]}
                  placeholder="Chọn trạng thái"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Nhận từ ngày" name="receivedFrom">
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} xl={8}>
              <Form.Item label="Đến ngày" name="receivedTo">
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

      <Card styles={{ body: toolbarCardBodyStyle }}>
        <Row gutter={[12, 12]} justify="space-between" align="middle">
          <Col xs={24} lg="auto">
            <Text>
              Đã chọn <Text strong>{selectedRowKeys.length}</Text> kiện
            </Text>
          </Col>
          <Col xs={24} lg="auto">
            <Space wrap>
              <Button icon={<UploadOutlined />} onClick={openExcelImportModal}>
                Nhập kho bằng Excel
              </Button>
              <Button
                type="primary"
                ghost
                icon={<PlusCircleOutlined />}
                disabled={!selectedRowKeys.length}
                onClick={openBatchModal}
              >
                Thêm vào lô hàng
              </Button>
              <Button loading={isSyncingStatuses} onClick={handleManualReceivingStatusSync}>
                Dong bo trang thai
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
                Nhập hàng
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        {isInitialLoading ? (
          <AdminTableSkeleton columns={tableColumns} scroll={{ x: 1280 }} rowSelection />
        ) : (
          <LoadingOverlay spinning={isRefreshing}>
            {filteredPackages.length ? (
              <Table<ChinaWarehousePackage>
                rowKey="id"
                columns={tableColumns}
                dataSource={filteredPackages}
                scroll={{ x: 1280 }}
                pagination={{ pageSize: 8, showSizeChanger: false }}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys, rows) => {
                    setSelectedRowKeys(keys);
                    setSelectedRows(rows);
                  },
                  getCheckboxProps: (record) => ({
                    disabled: !canSelectPackage(record),
                    title: getPackageSelectionReason(record),
                  }),
                }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có kiện hàng nào trong kho Trung Quốc.">
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
                  Nhập hàng
                </Button>
              </Empty>
            )}
          </LoadingOverlay>
        )}
      </Card>

      <Drawer
        title={editingRecord ? "Sửa thông tin kiện hàng" : "Nhập hàng / Thêm kiện hàng"}
        placement="right"
        width={screens.md ? 560 : "100%"}
        destroyOnClose
        open={drawerOpen}
        onClose={closeDrawer}
        footer={
          <Space style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={closeDrawer}>Hủy</Button>
            <Button type="primary" loading={isSubmitting} onClick={handleSubmitPackage}>
              {editingRecord ? "Lưu thay đổi" : "Thêm mới"}
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Alert
            showIcon
            type="info"
            message="Nếu thay đổi mã vận đơn, hệ thống sẽ cập nhật lại trạng thái khớp của kiện hàng theo dữ liệu đơn hàng."
          />

          {editingRecord?.orderId ? (
            <Card size="small" style={{ background: "#fafcff" }}>
              <Row gutter={[12, 12]}>
                <Col xs={24} md={12}>
                  <Text type="secondary">Mã vận đơn</Text>
                  <div><Text strong>{editingRecord.trackingCode}</Text></div>
                </Col>
                <Col xs={24} md={12}>
                  <Text type="secondary">Ma don hang</Text>
                  <div><Text strong>{editingRecord.invoiceCode ?? "-"}</Text></div>
                </Col>
                <Col xs={24} md={12}>
                  <Text type="secondary">Khách hàng</Text>
                  <div><Text strong>{editingRecord.customerName ?? "-"}</Text></div>
                </Col>
                <Col xs={24} md={12}>
                  <Text type="secondary">Shop</Text>
                  <div>
                    <Text strong>
                      {editingRecord.orderItems.length > 0
                        ? Array.from(new Set(editingRecord.orderItems.map((item) => item.shop_name ?? item.seller ?? "-"))).join(", ")
                        : "-"}
                    </Text>
                  </div>
                </Col>
              </Row>
            </Card>
          ) : null}

          <Form<PackageFormValues> form={form} layout="vertical">
            <Form.Item
              label="Mã vận đơn"
              name="trackingCode"
              rules={[{ required: true, message: "Vui lòng nhập mã vận đơn." }]}
            >
              <Input placeholder="Nhập mã vận đơn..." />
            </Form.Item>

            <Form.Item
              label="Người nhận hàng"
              name="receiverName"
              rules={[{ required: true, message: "Vui lòng nhập người nhận hàng." }]}
            >
              <Input placeholder="Nhập người nhận hàng..." />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Kho hàng"
                  name="warehouseName"
                  rules={[{ required: true, message: "Vui lòng chọn kho hàng." }]}
                >
                  <Select options={CHINA_WAREHOUSE_OPTIONS.map((item) => ({ label: item, value: item }))} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Khối lượng"
                  name="weight"
                  rules={[{ required: true, message: "Vui lòng nhập khối lượng." }]}
                >
                  <InputNumber
                    min={0.1}
                    precision={2}
                    addonAfter="kg"
                    placeholder="Nhập khối lượng"
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item label="Dai (cm)" name="actualLength">
                  <InputNumber min={0} precision={2} placeholder="Nhập chiều dài" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Rong (cm)" name="actualWidth">
                  <InputNumber min={0} precision={2} placeholder="Nhập chiều rộng" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Cao (cm)" name="actualHeight">
                  <InputNumber min={0} precision={2} placeholder="Nhập chiều cao" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Ngày nhận hàng"
                  name="receivedDate"
                  rules={[{ required: true, message: "Vui lòng chọn ngày nhận hàng." }]}
                >
                  <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Trạng thái"
                  name="status"
                  rules={[{ required: true, message: "Vui lòng chọn trạng thái." }]}
                >
                  <Select
                    options={[
                      { value: "matched", label: "Khớp" },
                      { value: "unmatched", label: "Chưa khớp" },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Ghi chú" name="note">
              <Input.TextArea rows={4} placeholder="Nhập ghi chú nếu có..." />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item label="The tich tu tinh (m3)">
                  <InputNumber value={measuredVolume} readOnly style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Can nang quy doi">
                  <InputNumber value={volumetricWeight} readOnly addonAfter="kg" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Can tinh phi">
                  <InputNumber value={chargeableWeight} readOnly addonAfter="kg" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Space>
      </Drawer>

      <Modal
        title="Nhập kho bằng Excel"
        open={excelModalOpen}
        onCancel={() => setExcelModalOpen(false)}
        onOk={() => setExcelModalOpen(false)}
        okText="Đóng"
        cancelButtonProps={{ style: { display: "none" } }}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            File Excel cần có các cột: Mã vận đơn, Người nhận, Kho hàng, Khối lượng,
            Ngày nhận hàng, Ghi chú.
          </Paragraph>
          <Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Kéo thả file Excel vào đây hoặc bấm để chọn file</p>
            <p className="ant-upload-hint">Chấp nhận định dạng .xlsx và .xls</p>
          </Dragger>
        </Space>
      </Modal>

      <Modal
        title="Thêm kiện vào lô hàng"
        open={batchModalOpen}
        onCancel={() => {
          setBatchModalOpen(false);
          batchForm.resetFields();
        }}
        onOk={handleAddToBatch}
        okText="Xác nhận thêm vào lô"
        cancelText="Hủy"
        confirmLoading={isBatchSubmitting}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Card size="small">
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Statistic title="Số kiện đã chọn" value={selectedRows.length} />
              </Col>
              <Col span={12}>
                <Statistic title="Tổng khối lượng" value={selectedTotalWeight} suffix="kg" precision={2} />
              </Col>
            </Row>
          </Card>

          <div>
            <Text strong>Kho hàng</Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                {Array.from(new Set(selectedRows.map((item) => item.warehouseName))).map((name) => (
                  <Tag key={name}>{name}</Tag>
                ))}
              </Space>
            </div>
          </div>


          <div>
            <Text strong>Danh sách mã vận đơn</Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                {selectedRows.map((item) => (
                  <Tag key={item.id}>{item.trackingCode}</Tag>
                ))}
              </Space>
            </div>
          </div>

          <Form<BatchModalFormValues>
            form={batchForm}
            layout="vertical"
            initialValues={{ batchMode: "create", shippingType: "normal" }}
          >
            <Form.Item label={"Lựa chọn"} name="batchMode">
              <Radio.Group
                options={[
                  { label: "Tạo lô hàng mới", value: "create" },
                  { label: "Thêm vào lô hàng có sẵn", value: "existing" },
                ]}
              />
            </Form.Item>

            {batchMode === "create" ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>{"Mã lô hàng dự kiến"}</Text>
                  <div style={{ marginTop: 8 }}>
                    <Tag color="blue">{predictedBatchCode}</Tag>
                  </div>
                </div>

                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item label={"Hình thức vận chuyển"} name="shippingType">
                      <Select
                        options={[
                          { label: "Thường", value: "normal" },
                          { label: "Nhanh", value: "fast" },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label={"Ngày dự kiến về kho"} name="expectedArrivalAt">
                      <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item label={"Kho đích"} name="destinationWarehouseName">
                  <Input placeholder={"Nhập tên kho đích..."} />
                </Form.Item>

                <Form.Item label={"Ghi chú"} name="note">
                  <Input.TextArea rows={3} placeholder={"Nhập ghi chú nếu có..."} />
                </Form.Item>
              </>
            ) : (
              <Form.Item
                label={"Lô hàng hiện có"}
                name="cnBatchId"
                rules={[{ required: true, message: "Vui lòng chọn lô hàng." }]}
              >
                <Select
                  placeholder={"Chọn lô hàng"}
                  options={availableBatches.map((batch) => ({
                    label: getBatchDisplayName(batch),
                    value: batch.id,
                  }))}
                  notFoundContent={"Không có lô hàng phù hợp"}
                />
              </Form.Item>
            )}
          </Form>
        </Space>
      </Modal>

      <ConfirmPackageItemsModal
        open={confirmItemsModalOpen}
        loading={isConfirmingItems}
        packageRecord={confirmingPackage}
        onCancel={() => {
          setConfirmItemsModalOpen(false);
          setConfirmingPackage(null);
        }}
        onSubmit={handleConfirmPackageItems}
      />
    </Space>
  );
};

