import { Tag, Typography } from "antd";
import dayjs from "dayjs";
import { parseCnReceivedAt, serializeCnReceivedAt } from "./receivedAt";
import type {
  ChinaWarehouseApiRecord,
  ChinaWarehouseCreateInput,
  ChinaWarehousePackage,
  ChinaWarehouseUpdateInput,
  PackageFormValues,
  PackageMatchStatus,
} from "./types";

const { Text } = Typography;

export const getStatusTag = (status: PackageMatchStatus) => {
  if (status === "matched") {
    return <Tag color="green">Khop tracking</Tag>;
  }

  return <Tag color="orange">Chưa khớp tracking</Tag>;
};

export const isPackageEligibleForBatch = (record: ChinaWarehousePackage) =>
  getPackageSelectionReason(record) === "";

export const canSelectPackage = (record: ChinaWarehousePackage) =>
  isPackageEligibleForBatch(record);

export const canDeletePackage = (record: ChinaWarehousePackage) => {
  if (record.batchCode) {
    return {
      canDelete: false,
      reason: "Kiện đã nằm trong lô hàng, không thể xóa.",
    };
  }

  if (record.isImportedToVietnam) {
    return {
      canDelete: false,
      reason: "Kiện đã nhập kho Việt Nam, không thể xóa.",
    };
  }

  return {
    canDelete: true,
    reason: "",
  };
};

export const calculateSelectedTotalWeight = (selectedRows: ChinaWarehousePackage[]) =>
  selectedRows.reduce((total, item) => total + item.weight, 0);


export const formatWeight = (weight: number) => `${weight.toFixed(weight % 1 === 0 ? 0 : 2)} kg`;

export const mapRecordToFormValues = (record: ChinaWarehousePackage): PackageFormValues => ({
  trackingCode: record.trackingCode,
  receiverUserId: record.receiverUserId ?? (record.receiverName ? `legacy:${record.id}` : undefined),
  warehouseId: record.warehouseId,
  weight: record.weight,
  actualLength: record.actualLength,
  actualWidth: record.actualWidth,
  actualHeight: record.actualHeight,
  packageCondition: record.packageCondition ?? "normal",
  receivedDate: record.receivedAt ? parseCnReceivedAt(record.receivedAt) : dayjs(record.receivedDate),
  status: record.status,
  note: record.note,
});

export const getPackageSelectionReason = (record: ChinaWarehousePackage) => {
  if (record.batchId || record.batchCode) {
    return "Kiện đã nằm trong lô hàng.";
  }

  if (record.isImportedToVietnam) {
    return "Kiện đã nhập kho Việt Nam.";
  }

  if (!record.receivedAt) {
    return "Kiện chưa được tiếp nhận tại kho Trung Quốc.";
  }
  if (record.status !== "matched" || !record.originalTrackingNumber?.trim()) {
    return "Kiện chưa khớp tracking hợp lệ.";
  }
  if (record.weight <= 0) {
    return "Kiện chưa có khối lượng thực tế.";
  }
  if (!record.packageItems.some(({ quantity }) => quantity > 0)) {
    return "Cần xác nhận sản phẩm trong kiện trước khi thêm vào lô.";
  }

  return "";
};


export const renderBatchTag = (batchCode?: string) =>
  batchCode ? <Tag color="blue">{batchCode}</Tag> : <Text type="secondary">Chưa vào lô</Text>;

export const mapApiRecordToPackage = (record: ChinaWarehouseApiRecord): ChinaWarehousePackage => ({
  id: record.id,
  warehouseId: record.warehouse_id,
  warehouseCode: record.warehouse?.code,
  warehouseName: record.warehouse?.name?.trim() || "Kho không xác định",
  orderId: record.order_id ?? undefined,
  orderTrackingId: record.order_tracking_id ?? undefined,
  receiverName: record.receiver_name?.trim() || record.order?.customer?.name || "Chưa có người nhận",
  receiverUserId: record.receiver_user_id ?? record.receiver?.id ?? undefined,
  trackingCode: record.tracking_number?.trim() || "Chưa có mã vận đơn",
  originalTrackingNumber: record.tracking_number,
  receivedAt: record.received_at ?? undefined,
  receivedDate: record.received_at
    ? parseCnReceivedAt(record.received_at).format("YYYY-MM-DD")
    : dayjs(record.created_at ?? undefined).format("YYYY-MM-DD"),
  weight: typeof record.weight === "number" ? record.weight : 0,
  actualLength: typeof record.actual_length === "number" ? record.actual_length : undefined,
  actualWidth: typeof record.actual_width === "number" ? record.actual_width : undefined,
  actualHeight: typeof record.actual_height === "number" ? record.actual_height : undefined,
  volume: typeof record.volume === "number" ? record.volume : undefined,
  volumetricWeight: typeof record.volumetric_weight === "number" ? record.volumetric_weight : undefined,
  chargeableWeight: typeof record.chargeable_weight === "number" ? record.chargeable_weight : undefined,
  packageCondition: record.package_condition ?? undefined,
  declaredValue: typeof record.declared_value === "number" ? record.declared_value : undefined,
  carrier: record.carrier ?? undefined,
  customerName: record.order?.customer?.name || undefined,
  invoiceCode: record.order?.order_code || undefined,
  orderItems: record.order?.items ?? [],
  packageItems: record.package_items ?? [],
  confirmedItemCount: record.package_items?.length ?? 0,
  batchCode: record.current_batch_package?.batch?.batch_code || undefined,
  batchId: record.current_batch_package?.batch?.id || undefined,
  batchStatus: record.current_batch_package?.batch?.status || undefined,
  status: record.status === "matched" ? "matched" : "unmatched",
  note: record.note ?? undefined,
  isImportedToVietnam: false,
});

export const mapFormValuesToCreateInput = (
  values: PackageFormValues,
): ChinaWarehouseCreateInput => ({
  warehouse_id: values.warehouseId,
  receiver_user_id: values.receiverUserId!,
  tracking_number: values.trackingCode.trim().toUpperCase(),
  weight: Number(values.weight),
  actual_length: values.actualLength ?? null,
  actual_width: values.actualWidth ?? null,
  actual_height: values.actualHeight ?? null,
  note: values.note?.trim() || null,
  package_condition: values.packageCondition?.trim() || "normal",
  status: values.status,
  received_at: values.receivedDate
    ? serializeCnReceivedAt(values.receivedDate)
    : null,
});

export const mapFormValuesToUpdateInput = (
  values: PackageFormValues,
): ChinaWarehouseUpdateInput => ({
  warehouse_id: values.warehouseId,
  ...(!values.receiverUserId?.startsWith("legacy:") && values.receiverUserId
    ? { receiver_user_id: values.receiverUserId }
    : {}),
  weight: Number(values.weight),
  actual_length: values.actualLength ?? null,
  actual_width: values.actualWidth ?? null,
  actual_height: values.actualHeight ?? null,
  note: values.note?.trim() || null,
  package_condition: values.packageCondition?.trim() || "normal",
  status: values.status,
  received_at: values.receivedDate
    ? serializeCnReceivedAt(values.receivedDate)
    : null,
});
