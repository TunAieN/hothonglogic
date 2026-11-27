import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Key } from "react";
import { useDelete, useGetIdentity, useInvalidate, useList, useUpdate } from "@refinedev/core";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Checkbox,
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
  Row,
  Select,
  Space,
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
  TruckOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { UploadProps } from "antd";
import dayjs from "dayjs";
import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import { CN_PACKAGE_TRACKING_VALIDATION_QUERY, CN_RECEIVING_OPTIONS_QUERY, RECEIVE_CN_PACKAGE_MUTATION } from "../../graphql/cnPackages";
import { isCnReceivedAtInFuture } from "./receivedAt";
import { DUPLICATE_CN_TRACKING, getReceivingError, getReceivingFormError, type ReceivingFeedback } from "./receivingFeedback";
import {
  canDeletePackage,
  canSelectPackage,
  formatWeight,
  getPackageSelectionReason,
  getStatusTag,
  isPackageEligibleForBatch,
  mapApiRecordToPackage,
  mapFormValuesToCreateInput,
  mapFormValuesToUpdateInput,
  mapRecordToFormValues,
  renderBatchTag,
} from "./helpers";
import { AddPackagesToBatchModal } from "./components/AddPackagesToBatchModal";
import { ConfirmPackageItemsModal } from "./components/ConfirmPackageItemsModal";
import { ExpectedInboundModal } from "./components/ExpectedInboundModal";
import type { ExpectedInboundRow } from "./components/ExpectedInboundModal";
import { ReconcilePackageModal } from "./components/ReconcilePackageModal";
import type { ItemQuantity } from "./components/packageInspectionSave";
import type { ReconciliationInput } from "./components/ReconcilePackageModal";
import { hasPermission } from "../../shared/auth/permissions";
import type { User } from "../../shared/types";
import { AdminTableSkeleton, LoadingOverlay, SkeletonStatCard } from "../../shared/components/admin-loading";
import { PageHeader, StatCard, StatsGrid } from "../../shared/components/admin-page-summary";
import type {
  ChinaWarehouseApiRecord,
  ChinaWarehouseFilters,
  ChinaWarehousePackage,
  ChinaWarehouseReceivingOptions,
  PackageFormValues,
  TrackingValidation,
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

const CONFIRM_CN_PACKAGE_ITEMS_MUTATION = `
  mutation ConfirmCnPackageItems($packageId: ID!, $items: [OrderPackageItemInput!]!, $expectedItems: [OrderPackageItemInput!]!, $inspectionNote: String) {
    confirmCnPackageItems(package_id: $packageId, items: $items, expected_items: $expectedItems, inspection_note: $inspectionNote, preserve_unselected: true) {
      id
    }
  }
`;

const loadTrackingValidation = async (trackingNumber: string, ignorePackageId?: string) => {
  syncGraphqlAuthToken();
  const response = await client.request<{ cnPackageTrackingValidation: TrackingValidation }>({
    document: CN_PACKAGE_TRACKING_VALIDATION_QUERY,
    variables: { trackingNumber, ignorePackageId },
    requestHeaders: getGraphqlAuthHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  return response.cnPackageTrackingValidation;
};

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
  const { message: receivingMessage } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<User>();
  const canReceive = hasPermission(identity, "cn_packages.create");
  const canCreateBatch = hasPermission(identity, "cn_batches.create");
  const canReadBatches = hasPermission(identity, "cn_batches.read");
  const invalidate = useInvalidate();
  const canReconcile = hasPermission(identity, "cn_packages.update");
  const canReadOrders = hasPermission(identity, "orders.read");
  const canVerifyPurchases = canReadOrders && hasPermission(identity, "orders.update");
  const canInspect = hasPermission(identity, "cn_packages.inspect");
  const [filters, setFilters] = useState<ChinaWarehouseFilters>(defaultFilterValues);
  const [form] = Form.useForm<PackageFormValues>();
  const [filterForm] = Form.useForm<ChinaWarehouseFilters>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ChinaWarehousePackage | null>(null);
  const [expectedReceipt, setExpectedReceipt] = useState<ExpectedInboundRow>();
  const [reconciling, setReconciling] = useState<ChinaWarehousePackage>();
  const [trackingCheck, setTrackingCheck] = useState<{ number: string; result: TrackingValidation }>();
  const [duplicatePackage, setDuplicatePackage] = useState<ChinaWarehousePackage>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<ChinaWarehousePackage[]>([]);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<ReceivingFeedback>();
  const packageSubmitLock = useRef(false);
  const trackingPreviewRequest = useRef(0);
  const [isSyncingStatuses, setIsSyncingStatuses] = useState(false);
  const [confirmingPackage, setConfirmingPackage] = useState<ChinaWarehousePackage | null>(null);
  const [expectedInboundOpen, setExpectedInboundOpen] = useState(false);
  const [expectedInboundRefreshKey, setExpectedInboundRefreshKey] = useState(0);
  const reopenExpectedInboundAfterDrawer = useRef(false);
  const [receivingOptions, setReceivingOptions] = useState<ChinaWarehouseReceivingOptions>({ warehouses: [], receivers: [] });
  const [isReceivingOptionsLoading, setIsReceivingOptionsLoading] = useState(true);
  const [receivingOptionsError, setReceivingOptionsError] = useState<string | null>(null);
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
  const { mutateAsync: updatePackage } = useUpdate<ChinaWarehouseApiRecord>();
  const { mutateAsync: deletePackage } = useDelete<ChinaWarehouseApiRecord>();

  const loadReceivingOptions = useCallback(async () => {
    setIsReceivingOptionsLoading(true);
    setReceivingOptionsError(null);

    try {
      syncGraphqlAuthToken();
      const response = await client.request<{ cnReceivingOptions: ChinaWarehouseReceivingOptions }>(
        CN_RECEIVING_OPTIONS_QUERY,
        {},
        getGraphqlAuthHeaders(),
      );
      setReceivingOptions(response.cnReceivingOptions);
    } catch {
      setReceivingOptions({ warehouses: [], receivers: [] });
      setReceivingOptionsError("Kiểm tra kết nối hoặc phiên đăng nhập rồi bấm Thử lại.");
    } finally {
      setIsReceivingOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReceivingOptions();
  }, [loadReceivingOptions]);

  const packages = useMemo(
    () => (packageListResponse?.data ?? []).map(mapApiRecordToPackage),
    [packageListResponse?.data],
  );

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

  const watchedWeight = Form.useWatch("weight", form) ?? 0;
  const watchedLength = Form.useWatch("actualLength", form) ?? 0;
  const watchedWidth = Form.useWatch("actualWidth", form) ?? 0;
  const watchedHeight = Form.useWatch("actualHeight", form) ?? 0;
  const watchedTrackingCode = Form.useWatch("trackingCode", form)?.trim().toUpperCase();
  const activeTrackingCheck = trackingCheck?.number === watchedTrackingCode ? trackingCheck?.result : undefined;

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

  const openCreateDrawer = (prefill?: ExpectedInboundRow) => {
    setEditingRecord(null);
    setSubmitFeedback(undefined);
    setTrackingCheck(undefined);
    setExpectedReceipt(prefill);
    if (prefill) {
      reopenExpectedInboundAfterDrawer.current = true;
      setExpectedInboundOpen(false);
    }
    form.resetFields();
    form.setFieldsValue({
      trackingCode: prefill?.tracking_number ?? "",
      receiverUserId: undefined,
      warehouseId: prefill
        ? receivingOptions.warehouses.find(({ id }) => id === prefill.warehouse?.id)?.id
        : (receivingOptions.warehouses.length === 1 ? receivingOptions.warehouses[0].id : undefined),
      weight: undefined,
      actualLength: 0,
      actualWidth: 0,
      actualHeight: 0,
      packageCondition: "normal",
      receivedDate: dayjs(),
      receiptConfirmed: false,
      status: prefill ? "matched" : "unmatched",
      note: "",
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (record: ChinaWarehousePackage) => {
    setEditingRecord(record);
    setSubmitFeedback(undefined);
    setTrackingCheck(undefined);
    form.setFieldsValue(mapRecordToFormValues(record));
    setDrawerOpen(true);
  };

  const receiverOptions = useMemo(() => {
    const options = receivingOptions.receivers.map((receiver) => ({
      value: receiver.id,
      label: `${receiver.name} — ${receiver.role?.name || "Nhân viên kho Trung Quốc"}`,
      searchText: `${receiver.name} ${receiver.email} ${receiver.phone || ""} ${receiver.role?.name || ""}`.toLowerCase(),
    }));

    if (editingRecord && !editingRecord.receiverUserId && editingRecord.receiverName) {
      options.unshift({
        value: `legacy:${editingRecord.id}`,
        label: `${editingRecord.receiverName} — dữ liệu lịch sử`,
        searchText: editingRecord.receiverName.toLowerCase(),
      });
    }

    return options;
  }, [editingRecord, receivingOptions.receivers]);

  const openConfirmItemsModal = (record: ChinaWarehousePackage) => {
    setConfirmingPackage(record);
  };

  const hasReceivedTracking = (record: ChinaWarehousePackage) =>
    Boolean(record.status === "matched" && record.receivedAt && record.orderId && record.orderTrackingId);
  const canInspectPackage = (record: ChinaWarehousePackage) =>
    canInspect && hasReceivedTracking(record) && !record.batchId && record.orderItems.length > 0;

  const closeDrawer = () => {
    trackingPreviewRequest.current += 1;
    setDrawerOpen(false);
    setSubmitFeedback(undefined);
    setEditingRecord(null);
    setExpectedReceipt(undefined);
    setTrackingCheck(undefined);
    form.resetFields();
    if (reopenExpectedInboundAfterDrawer.current) {
      reopenExpectedInboundAfterDrawer.current = false;
      setExpectedInboundOpen(true);
    }
  };

  const requestCloseDrawer = () => {
    if (!packageSubmitLock.current) closeDrawer();
  };

  useEffect(() => {
    if (drawerOpen && !isSubmitting && submitFeedback?.field) {
      form.scrollToField(submitFeedback.field, { focus: true, block: "center" });
    }
  }, [drawerOpen, form, isSubmitting, submitFeedback]);

  const handleManualReceivingStatusSync = async () => {
    setIsSyncingStatuses(true);
    message.info("Trạng thái receiving hiện được đồng bộ tự động ở backend khi nhập kho.");
    setIsSyncingStatuses(false);
  };

  const handleSubmitPackage = async () => {
    if (packageSubmitLock.current) return;

    packageSubmitLock.current = true;
    trackingPreviewRequest.current += 1;
    setIsSubmitting(true);
    setSubmitFeedback(undefined);
    let submittedTracking: string | undefined;

    try {
      const values = await form.validateFields();

      if (editingRecord) {
        await updatePackage({
          resource: "cnPackages",
          id: editingRecord.id,
          values: mapFormValuesToUpdateInput(values),
          successNotification: false,
          errorNotification: false,
        });
        receivingMessage.success("Đã cập nhật thông tin kiện hàng.");
      } else {
        const input = mapFormValuesToCreateInput(values);
        const number = input.tracking_number;
        let result: TrackingValidation;
        try {
          // Always check the current tracking before sending a write, including after an uncertain outcome.
          result = await loadTrackingValidation(number);
        } catch (error) {
          reportReceivingError(getReceivingError(error, "tracking"));
          return;
        }
        applyTrackingCheck(number, result);
        if (!result.valid || result.existing_package_id) {
          reportReceivingError({
            field: "trackingCode",
            message: result.existing_package_id ? DUPLICATE_CN_TRACKING : result.message || "Mã vận đơn không hợp lệ.",
          });
          return;
        }
        if (!result.matched && !input.note) {
          reportReceivingError({ field: "note", message: "Vui lòng nhập ghi chú bàn giao hoặc lý do cần đối chiếu." });
          return;
        }
        submittedTracking = number;
        const response = await client.request<{ createCnPackage: { id: string } | null }>({
          document: RECEIVE_CN_PACKAGE_MUTATION,
          variables: { input: {
            ...input,
            status: result.matched ? "matched" : "unmatched",
            expected_tracking_id: expectedReceipt?.id,
            expected_order_id: expectedReceipt?.order?.id,
          } },
          requestHeaders: getGraphqlAuthHeaders(),
          signal: AbortSignal.timeout(25_000),
        });
        if (!response.createCnPackage?.id) throw new Error("The create response did not confirm a package ID.");
        setExpectedInboundRefreshKey((value) => value + 1);
        receivingMessage.success("Nhập kiện thành công");
      }

      closeDrawer();
      void packageListQuery.refetch({ throwOnError: true }).catch(() => {
        receivingMessage.warning("Kiện đã được lưu. Chưa tải lại được bảng kho. Hãy tải lại trang để cập nhật danh sách.");
      });
    } catch (error) {
      const formError = getReceivingFormError(error);
      if (formError) {
        setSubmitFeedback(formError);
        return;
      }
      const feedback = getReceivingError(error, editingRecord ? "update" : "create");
      reportReceivingError(feedback);
      if (submittedTracking && feedback.checkExisting) {
        const result = await loadTrackingValidation(submittedTracking).catch(() => undefined);
        if (result) {
          applyTrackingCheck(submittedTracking, result);
          if (result.existing_package_id) {
            reportReceivingError({ field: "trackingCode", message: DUPLICATE_CN_TRACKING });
          }
        }
      }
    } finally {
      packageSubmitLock.current = false;
      setIsSubmitting(false);
    }
  };

  const reportReceivingError = (feedback: ReceivingFeedback) => {
    setSubmitFeedback(feedback);
    if (feedback.field) form.setFields([{ name: feedback.field, errors: [feedback.message] }]);
  };

  const applyTrackingCheck = (number: string, result: TrackingValidation) => {
    setTrackingCheck({ number, result });
    form.setFieldValue("status", result.matched ? "matched" : "unmatched");
  };

  const previewTrackingCode = async (value: string) => {
    const trackingNumber = value?.trim().toUpperCase();
    if (!trackingNumber || editingRecord || packageSubmitLock.current) return;
    const request = ++trackingPreviewRequest.current;
    const isCurrent = () => request === trackingPreviewRequest.current
      && form.getFieldValue("trackingCode")?.trim().toUpperCase() === trackingNumber;
    try {
      const result = await loadTrackingValidation(trackingNumber);
      if (!isCurrent()) return;
      applyTrackingCheck(trackingNumber, result);
      form.setFields([{ name: "trackingCode", errors: result.valid ? [] : [result.message || "Mã vận đơn không hợp lệ."] }]);
    } catch (error) {
      if (isCurrent()) form.setFields([{ name: "trackingCode", errors: [getReceivingError(error, "tracking").message] }]);
    }
  };

  const showExistingPackage = async (id: string) => {
    try {
      syncGraphqlAuthToken();
      const response = await client.request<{ cnPackage: ChinaWarehouseApiRecord | null }>(`
        query ExistingCnPackage($id: ID!) {
          cnPackage(id: $id) {
            id warehouse_id tracking_number receiver_name received_at weight status note
            warehouse { id name }
          }
        }
      `, { id }, getGraphqlAuthHeaders());
      if (!response.cnPackage) throw new Error();
      setDuplicatePackage(mapApiRecordToPackage(response.cnPackage));
    } catch {
      message.error("Không tải được kiện đã tiếp nhận. Vui lòng tải lại bảng kho.");
    }
  };

  const saveReconciliation = async (input: ReconciliationInput) => {
    if (!reconciling) return;
    try {
      await updatePackage({ resource: "cnPackages", id: reconciling.id, values: { reconciliation: input } });
      setReconciling(undefined);
      void packageListQuery.refetch();
      setExpectedInboundRefreshKey((value) => value + 1);
      message.success("Đã lưu kết quả đối chiếu.");
    } catch (error) {
      const graphqlMessage = (error as { response?: { errors?: { message?: string }[] } })?.response?.errors?.[0]?.message;
      throw new Error(graphqlMessage && graphqlMessage !== "Internal server error"
        ? graphqlMessage
        : "Không thể lưu đối chiếu. Vui lòng thử lại.");
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
      await packageListQuery.refetch();
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
      message.error(`${invalidPackage.trackingCode}: ${getPackageSelectionReason(invalidPackage)}`);
      return;
    }

    setBatchModalOpen(true);
  };

  const handleConfirmPackageItems = async (
    items: ItemQuantity[],
    expectedItems: ItemQuantity[],
    inspectionNote?: string,
  ) => {
    if (!confirmingPackage) {
      throw new Error("Kiện đang kiểm không còn được chọn.");
    }

    try {
      syncGraphqlAuthToken();
      await client.request(
        CONFIRM_CN_PACKAGE_ITEMS_MUTATION,
        {
          packageId: confirmingPackage.id,
          items,
          expectedItems,
          inspectionNote,
        },
        getGraphqlAuthHeaders(),
      );
      void packageListQuery.refetch();
    } catch (error) {
      const detail = (error as { response?: { errors?: { message?: string; extensions?: { category?: string } }[] } }).response?.errors?.[0];
      throw new Error(detail?.extensions?.category === "validation" && detail.message
        ? detail.message : "Không thể xác nhận sản phẩm. Vui lòng thử lại.");
    }
  };

  const finishAddToBatch = (code: string, mode: "create" | "existing") => {
    setSelectedRowKeys([]);
    setSelectedRows([]);
    setBatchModalOpen(false);
    receivingMessage.success(mode === "create"
      ? `Đã tạo lô hàng và thêm các kiện thành công. Mã lô: ${code}`
      : `Đã thêm các kiện vào lô hàng ${code}.`);
    void invalidate({ resource: "cnBatches", invalidates: ["list", "detail"] });
    void packageListQuery.refetch({ throwOnError: true }).catch(() => {
      receivingMessage.warning("Đã lưu lô. Chưa tải lại được bảng kiện, vui lòng tải lại trang.");
    });
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

  const tableColumns: ColumnsType<ChinaWarehousePackage> = (() => {
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
            const canOpenInspection = canInspectPackage(record) || (canVerifyPurchases && hasReceivedTracking(record));

            return (
              <Space size="small">
                {canReconcile && record.status === "unmatched" && record.receivedAt && (
                  <Button size="small" type="link" onClick={() => setReconciling(record)}>Đối chiếu</Button>
                )}
                <Tooltip
                  title={
                    canOpenInspection
                      ? "Xác nhận item trong kiện"
                      : "Kiện hoặc quyền hiện tại chưa cho phép kiểm hàng"
                  }
                >
                  <Button
                    type="text"
                    aria-label="Xác nhận item trong kiện"
                    icon={<FileSearchOutlined />}
                    disabled={!canOpenInspection}
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
  })();

  const isInitialLoading = packageListQuery.isLoading && !packageListResponse;
  const isRefreshing = packageListQuery.isFetching && !isInitialLoading;
  const pageError = packageListQuery.isError ? "Không thể tải dữ liệu kiện hàng. Vui lòng tải lại trang." : null;

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
                  loading={isReceivingOptionsLoading}
                  options={receivingOptions.warehouses.map((warehouse) => ({ label: warehouse.name, value: warehouse.name }))}
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
              <Button
                type="primary"
                ghost
                icon={<TruckOutlined />}
                onClick={() => setExpectedInboundOpen(true)}
              >
                Hàng dự kiến về kho
              </Button>
              <Button icon={<UploadOutlined />} onClick={openExcelImportModal}>
                Nhập kho bằng Excel
              </Button>
              <Button
                type="primary"
                ghost
                icon={<PlusCircleOutlined />}
                disabled={!canCreateBatch || !selectedRowKeys.length}
                onClick={openBatchModal}
              >
                Thêm vào lô hàng
              </Button>
              <Button loading={isSyncingStatuses} onClick={handleManualReceivingStatusSync}>
                Dong bo trang thai
              </Button>
              <Button type="primary" disabled={!canReceive} icon={<PlusOutlined />} onClick={() => openCreateDrawer()}>
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
                <Button type="primary" disabled={!canReceive} icon={<PlusOutlined />} onClick={() => openCreateDrawer()}>
                  Nhập hàng
                </Button>
              </Empty>
            )}
          </LoadingOverlay>
        )}
      </Card>

      <ExpectedInboundModal
        open={expectedInboundOpen}
        refreshKey={expectedInboundRefreshKey}
        onClose={() => setExpectedInboundOpen(false)}
        canReceive={canReceive}
        onReceive={openCreateDrawer}
      />

      {reconciling && <ReconcilePackageModal
        key={reconciling.id}
        record={reconciling}
        canSearch={canReadOrders}
        onClose={() => setReconciling(undefined)}
        onSave={saveReconciliation}
      />}
      {duplicatePackage && <Modal centered open title="Kiện đã tiếp nhận" footer={null}
        onCancel={() => setDuplicatePackage(undefined)}>
        <Space direction="vertical">
          <Text strong>{duplicatePackage.trackingCode}</Text>
          <Text>Kiện #{duplicatePackage.id} · {duplicatePackage.warehouseName}</Text>
          <Text>{duplicatePackage.receiverName} · {duplicatePackage.receivedDate} · {formatWeight(duplicatePackage.weight)}</Text>
          {getStatusTag(duplicatePackage.status)}
          {duplicatePackage.note && <Paragraph>{duplicatePackage.note}</Paragraph>}
        </Space>
      </Modal>}

      <Drawer
        title={editingRecord ? "Sửa thông tin kiện hàng" : "Nhập hàng / Thêm kiện hàng"}
        placement="right"
        width={screens.md ? 560 : "100%"}
        destroyOnClose
        open={drawerOpen}
        onClose={requestCloseDrawer}
        footer={
          <Space direction="vertical" style={{ display: "flex" }}>
            {submitFeedback && <Alert type="error" showIcon message={submitFeedback.message} />}
            <Space style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button disabled={isSubmitting} onClick={requestCloseDrawer}>Hủy</Button>
              <Button type="primary" loading={isSubmitting} disabled={isReceivingOptionsLoading || Boolean(receivingOptionsError)} onClick={handleSubmitPackage}>
                {editingRecord ? "Lưu thay đổi" : "Thêm mới"}
              </Button>
            </Space>
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Alert
            showIcon
            type="info"
            message={editingRecord
              ? "Dùng thao tác Đối chiếu để sửa mã của kiện chưa khớp."
              : "Chỉ lưu khi kho đã thực tế tiếp nhận kiện. Sản phẩm được xác nhận riêng sau khi khớp đơn."}
          />

          {expectedReceipt && <Alert showIcon type="info" message="Tracking đã được khai báo"
            description={<div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2 }}>
              <Text>Đơn VietTrung: {expectedReceipt.order?.order_code || "Chưa xác định"}</Text>
              {expectedReceipt.purchase_orders.map((purchase) => <Text
                key={purchase.id} style={{ display: "block" }}
                ellipsis={{ tooltip: `${purchase.external_order_code} · ${purchase.shop_name || "Chưa có tên shop"}` }}>
                {purchase.external_order_code} · {purchase.shop_name || "Chưa có tên shop"}
              </Text>)}
              {!expectedReceipt.purchase_orders.length &&
                <Text>Tracking đã thuộc đơn VietTrung. Chưa xác định đơn mua Taobao liên quan.</Text>}
            </div>}
          />}

          {activeTrackingCheck?.existing_package_id && <Alert type="warning" showIcon
            message="Mã vận đơn đã có kiện trong kho."
            action={<Button size="small" onClick={() => void showExistingPackage(activeTrackingCheck.existing_package_id!)}>
              Xem kiện hiện hữu
            </Button>}
          />}
          {activeTrackingCheck?.valid && !activeTrackingCheck.matched && <Alert type="warning" showIcon
            message="Chưa tìm thấy tracking đã khai báo"
            description="Nếu kiện đã đến kho, có thể tạm tiếp nhận. Hãy ghi chú nguồn bàn giao hoặc thông tin cần xác minh."
          />}
          {!expectedReceipt && activeTrackingCheck?.valid && activeTrackingCheck.matched && <Alert type="info" showIcon
            message={activeTrackingCheck.order_code ? `Khớp đơn VietTrung ${activeTrackingCheck.order_code}` : "Đã khớp tracking"}
            description={activeTrackingCheck.purchase_orders
              ? activeTrackingCheck.purchase_orders.map(({ external_order_code }) => external_order_code).join(", ")
                || "Tracking đã thuộc đơn VietTrung. Chưa xác định đơn mua Taobao liên quan."
              : "Có thể tiếp nhận và kiểm sản phẩm theo quyền được cấp."}
          />}

          {receivingOptionsError ? (
            <Alert
              showIcon
              type="error"
              message="Không thể tải danh sách nhân viên hoặc kho Trung Quốc"
              description={receivingOptionsError}
              action={<Button size="small" onClick={() => void loadReceivingOptions()}>Thử lại</Button>}
            />
          ) : null}

          {editingRecord && !editingRecord.receiverUserId && editingRecord.receiverName ? (
            <Alert
              showIcon
              type="warning"
              message={`Người nhận lịch sử: ${editingRecord.receiverName}`}
              description="Bản ghi cũ chưa có định danh nhân viên. Tên snapshot vẫn được giữ nguyên; hãy chọn nhân viên hợp lệ nếu cần cập nhật người nhận."
            />
          ) : null}

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

          <Form<PackageFormValues> name="cnPackageReceipt" form={form} layout="vertical" disabled={isSubmitting}
            onValuesChange={(changed) => {
              if (submitFeedback?.field && Object.hasOwn(changed, submitFeedback.field)) setSubmitFeedback(undefined);
            }}
          >
            <Form.Item
              label="Mã vận đơn"
              name="trackingCode"
              validateTrigger="onBlur"
              rules={[
                { required: true, whitespace: true, message: "Vui lòng nhập mã vận đơn thực tế." },
              ]}
            >
              <Input readOnly={Boolean(editingRecord || expectedReceipt)} maxLength={100}
                onBlur={(event) => void previewTrackingCode(event.target.value)}
                autoComplete="off" placeholder="Nhập mã vận đơn thực tế, không nhập mã đơn hàng..." />
            </Form.Item>

            <Form.Item
              label="Người nhận hàng"
              name="receiverUserId"
              rules={[{ required: true, message: "Vui lòng chọn người nhận hàng hợp lệ." }]}
            >
              <Select
                showSearch
                allowClear
                loading={isReceivingOptionsLoading}
                disabled={Boolean(receivingOptionsError)}
                placeholder="Tìm hoặc chọn nhân viên kho Trung Quốc"
                prefix={<UserOutlined />}
                options={receiverOptions}
                filterOption={(input, option) => String(option?.searchText || "").includes(input.trim().toLowerCase())}
                notFoundContent={isReceivingOptionsLoading ? "Đang tải nhân viên..." : "Không có nhân viên phù hợp"}
              />
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Kho hàng"
                  name="warehouseId"
                  rules={[{ required: true, message: "Vui lòng chọn kho hàng." }]}
                >
                  <Select
                    showSearch
                    allowClear
                    loading={isReceivingOptionsLoading}
                    disabled={Boolean(receivingOptionsError)}
                    placeholder="Chọn kho hàng Trung Quốc"
                    optionFilterProp="label"
                    options={receivingOptions.warehouses.map((warehouse) => ({
                      label: `${warehouse.name} (${warehouse.code})`,
                      value: warehouse.id,
                    }))}
                    notFoundContent={isReceivingOptionsLoading ? "Đang tải kho..." : "Không có kho Trung Quốc đang hoạt động"}
                  />
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
                  rules={[
                    { required: true, message: "Vui lòng chọn ngày nhận hàng." },
                    { validator: async (_, value?: PackageFormValues["receivedDate"]) => {
                      if (value && isCnReceivedAtInFuture(value)) {
                        throw new Error("Thời gian nhận hàng không được ở tương lai.");
                      }
                    } },
                  ]}
                >
                  <DatePicker showTime format="DD/MM/YYYY HH:mm" disabledDate={(date) => date.isAfter(dayjs(), "day")} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Trạng thái"
                  name="status"
                  rules={[{ required: true, message: "Vui lòng chọn trạng thái." }]}
                >
                  <Select disabled
                    options={[
                      { value: "matched", label: "Khớp" },
                      { value: "unmatched", label: "Chưa khớp / đang chờ xác minh" },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Ghi chú" name="note">
              <Input.TextArea rows={4} placeholder="Nhập ghi chú nếu có..." />
            </Form.Item>
            <Form.Item label="Tình trạng bên ngoài" name="packageCondition">
              <Select options={[
                { value: "normal", label: "Bình thường" },
                { value: "damaged", label: "Có dấu hiệu hư hỏng" },
                { value: "other", label: "Khác – mô tả trong ghi chú" },
              ]} />
            </Form.Item>
            {!editingRecord && <Form.Item name="receiptConfirmed" valuePropName="checked"
              rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("Vui lòng xác nhận đã nhận kiện thực tế.")) }]}>
              <Checkbox>Tôi xác nhận kho đã nhận kiện và thời gian nhận là chính xác.</Checkbox>
            </Form.Item>}
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

      {batchModalOpen && selectedRows.length > 0 && <AddPackagesToBatchModal
        packages={selectedRows}
        canReadOrders={canReadOrders}
        canReadBatches={canReadBatches}
        onCancel={() => setBatchModalOpen(false)}
        onSuccess={finishAddToBatch}
      />}

      {confirmingPackage && <ConfirmPackageItemsModal
        key={confirmingPackage.id}
        packageRecord={confirmingPackage}
        canInspect={canInspectPackage(confirmingPackage)}
        canVerify={canVerifyPurchases && hasReceivedTracking(confirmingPackage)}
        canReadOrders={canReadOrders}
        onCancel={() => setConfirmingPackage(null)}
        onVerificationSaved={() => {
          setExpectedInboundRefreshKey((value) => value + 1);
          void packageListQuery.refetch();
        }}
        onSubmit={handleConfirmPackageItems}
      />}
    </Space>
  );
};
