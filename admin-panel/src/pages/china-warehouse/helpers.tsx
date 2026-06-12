import { Tag, Typography } from "antd";
import dayjs from "dayjs";
import type {
  BatchModalFormValues,
  ChinaWarehouseApiRecord,
  ChinaWarehouseBatchRecord,
  ChinaWarehouseCreateInput,
  ChinaWarehousePackage,
  ChinaWarehouseUpdateInput,
  PackageFormValues,
  PackageMatchStatus,
} from "./types";

const { Text } = Typography;

export const getStatusTag = (status: PackageMatchStatus) => {
  if (status === "matched") {
    return <Tag color="green">Khớp</Tag>;
  }

  return <Tag color="orange">Chưa khớp</Tag>;
};

export const isPackageEligibleForBatch = (record: ChinaWarehousePackage) =>
  !record.batchId && !record.batchCode && record.isImportedToVietnam !== true;

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

export const getNextBatchCode = (
  warehouseCode: string,
  date: Date,
  existingBatches: string[],
) => {
  const dateCode = dayjs(date).format("DDMMYYYY");
  const prefix = `${warehouseCode}${dateCode}`;
  const todaysSequence =
    existingBatches.reduce((maxSequence, batch) => {
      if (!batch.startsWith(prefix)) {
        return maxSequence;
      }

      const sequence = Number(batch.slice(prefix.length));

      if (!Number.isFinite(sequence)) {
        return maxSequence;
      }

      return Math.max(maxSequence, sequence);
    }, 0) + 1;

  return `${prefix}${todaysSequence}`;
};

export const formatWeight = (weight: number) => `${weight.toFixed(weight % 1 === 0 ? 0 : 2)} kg`;

export const mapRecordToFormValues = (record: ChinaWarehousePackage): PackageFormValues => ({
  trackingCode: record.trackingCode,
  receiverName: record.receiverName,
  warehouseName: record.warehouseName,
  weight: record.weight,
  receivedDate: dayjs(record.receivedDate),
  status: record.status,
  note: record.note,
});

export const getWarehouseCode = (warehouseName: string) => {
  const normalized = warehouseName.toLowerCase();

  if (normalized.includes("quảng châu a") || normalized.includes("quang chau a")) {
    return "QCA";
  }

  if (normalized.includes("thâm quyến b") || normalized.includes("tham quyen b")) {
    return "SZB";
  }

  if (normalized.includes("thâm quyến") || normalized.includes("tham quyen")) {
    return "SZ";
  }

  return "QC";
};

export const getWarehouseDisplayName = (warehouseName?: string, warehouseCode?: string) => {
  const normalizedName = warehouseName?.toLowerCase() ?? "";
  const normalizedCode = warehouseCode?.toUpperCase() ?? "";

  if (normalizedCode === "QCA" || normalizedName.includes("quang chau a")) {
    return "Kho Quảng Châu A";
  }

  if (normalizedCode === "SZB" || normalizedName.includes("tham quyen b")) {
    return "Kho Thâm Quyến B";
  }

  if (normalizedCode === "SZ" || normalizedName.includes("tham quyen")) {
    return "Kho Thâm Quyến";
  }

  return "Kho Quảng Châu";
};

export const getPackageSelectionReason = (record: ChinaWarehousePackage) => {
  if (record.batchCode) {
    return "Kiện đã nằm trong lô hàng.";
  }

  if (record.isImportedToVietnam) {
    return "Kiện đã nhập kho Việt Nam.";
  }

  return "";
};

export const getAvailableBatchOptions = (
  batches: ChinaWarehouseBatchRecord[],
  warehouseId?: string,
) =>
  batches.filter(
    (batch) =>
      batch.warehouse_id === warehouseId &&
      !["exporting", "arrived_vn", "completed", "cancelled"].includes(batch.status),
  );

export const getBatchDisplayName = (batch: ChinaWarehouseBatchRecord) => {
  const statusMap: Record<ChinaWarehouseBatchRecord["status"], string> = {
    pending: "Chờ xuất kho",
    exporting: "Đang vận chuyển",
    arrived_vn: "Đã về kho Việt Nam",
    completed: "Hoàn tất",
    cancelled: "Đã hủy",
  };

  return `${batch.batch_code} - ${statusMap[batch.status]}`;
};

export const mapBatchFormValuesToInput = (
  values: BatchModalFormValues,
  packageIds: string[],
) => ({
  cn_batch_id: values.batchMode === "existing" ? values.cnBatchId : null,
  cn_package_ids: packageIds,
  destination_warehouse_name:
    values.batchMode === "create" ? values.destinationWarehouseName?.trim() || null : null,
  shipping_type: values.batchMode === "create" ? values.shippingType ?? "normal" : null,
  expected_arrival_at:
    values.batchMode === "create" && values.expectedArrivalAt
      ? values.expectedArrivalAt.format("YYYY-MM-DD HH:mm:ss")
      : null,
  note: values.batchMode === "create" ? values.note?.trim() || null : null,
});

export const renderBatchTag = (batchCode?: string) =>
  batchCode ? <Tag color="blue">{batchCode}</Tag> : <Text type="secondary">Chưa vào lô</Text>;

export const mapApiRecordToPackage = (record: ChinaWarehouseApiRecord): ChinaWarehousePackage => ({
  id: record.id,
  warehouseId: record.warehouse_id,
  warehouseCode: record.warehouse?.code,
  warehouseName: getWarehouseDisplayName(record.warehouse?.name, record.warehouse?.code),
  orderId: record.order_id ?? undefined,
  orderTrackingId: record.order_tracking_id ?? undefined,
  receiverName: record.receiver_name?.trim() || record.order?.customer?.name || "Chưa có người nhận",
  trackingCode: record.tracking_number?.trim() || "Chưa có mã vận đơn",
  receivedDate: record.received_at
    ? dayjs(record.received_at).format("YYYY-MM-DD")
    : dayjs(record.created_at ?? undefined).format("YYYY-MM-DD"),
  weight: typeof record.weight === "number" ? record.weight : 0,
  volume: typeof record.volume === "number" ? record.volume : undefined,
  declaredValue: typeof record.declared_value === "number" ? record.declared_value : undefined,
  carrier: record.carrier ?? undefined,
  customerName: record.order?.customer?.name || undefined,
  invoiceCode: record.order?.order_code || undefined,
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
  warehouse_code: getWarehouseCode(values.warehouseName),
  warehouse_name: values.warehouseName,
  receiver_name: values.receiverName.trim(),
  tracking_number: values.trackingCode.trim().toUpperCase(),
  weight: Number(values.weight),
  note: values.note?.trim() || null,
  status: values.status,
  received_at: values.receivedDate
    ? values.receivedDate.format("YYYY-MM-DD HH:mm:ss")
    : null,
});

export const mapFormValuesToUpdateInput = (
  values: PackageFormValues,
): ChinaWarehouseUpdateInput => ({
  warehouse_code: getWarehouseCode(values.warehouseName),
  warehouse_name: values.warehouseName,
  receiver_name: values.receiverName.trim(),
  tracking_number: values.trackingCode.trim().toUpperCase(),
  weight: Number(values.weight),
  note: values.note?.trim() || null,
  status: values.status,
  received_at: values.receivedDate
    ? values.receivedDate.format("YYYY-MM-DD HH:mm:ss")
    : null,
});
