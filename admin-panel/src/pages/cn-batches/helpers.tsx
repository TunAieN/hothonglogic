import { Tag } from "antd";
import dayjs from "dayjs";
import type { CnBatchStatus, CnPackage } from "../../shared/types";
import type { BatchApiRecord, BatchEditFormValues, BatchPackageRow, BatchShippingType, BatchUpdateInput, BatchViewModel } from "./types";

const DEFAULT_RECEIVING_WAREHOUSE = "Kho Hà Nội (VN)";

export const getBatchStatusTag = (status: CnBatchStatus) => {
  const config: Record<CnBatchStatus, { color: string; label: string }> = {
    pending: { color: "default", label: "Chờ xuất kho" },
    exporting: { color: "processing", label: "Đang vận chuyển" },
    arrived_vn: { color: "blue", label: "Đã về kho Việt Nam" },
    completed: { color: "success", label: "Hoàn tất" },
    cancelled: { color: "error", label: "Đã hủy" },
  };

  const current = config[status];

  return <Tag color={current.color}>{current.label}</Tag>;
};

export const getShippingTypeTag = (type: BatchShippingType) =>
  type === "fast" ? <Tag color="magenta">Nhanh</Tag> : <Tag color="gold">Thường</Tag>;

export const formatWeight = (weight?: number | null) => `${Number(weight ?? 0).toFixed(1)} kg`;

export const formatVolume = (volume?: number | null) => `${Number(volume ?? 0).toFixed(2)} m³`;

export const canEditBatch = (batch: BatchViewModel) =>
  batch.status === "pending"
    ? { allowed: true, reason: "" }
    : { allowed: false, reason: "Chỉ lô ở trạng thái chờ xuất kho mới được sửa." };

export const canDeleteBatch = (batch: BatchViewModel) =>
  batch.status === "pending"
    ? { allowed: true, reason: "" }
    : { allowed: false, reason: "Chỉ lô ở trạng thái chờ xuất kho mới được xóa." };

export const canCreateVietnamInboundTask = (batch: BatchViewModel) =>
  batch.status === "arrived_vn"
    ? { allowed: true, reason: "" }
    : { allowed: false, reason: "Chỉ lô đã về kho Việt Nam mới tạo được nhiệm vụ nhập kho." };

const getPackageVolume = (pkg: CnPackage) => Number(pkg.volume ?? 0);

export const calculatePackageVolume = (pkg: Pick<BatchPackageRow, "height" | "length" | "width" | "volume">) => {
  const height = Number(pkg.height ?? 0);
  const length = Number(pkg.length ?? 0);
  const width = Number(pkg.width ?? 0);

  if (height > 0 && length > 0 && width > 0) {
    return Number(((height * length * width) / 1_000_000).toFixed(4));
  }

  return Number(pkg.volume ?? 0);
};

export const calculateBatchTotals = (packages: BatchPackageRow[]) =>
  packages.reduce(
    (totals, pkg) => ({
      totalWeight: totals.totalWeight + Number(pkg.weight ?? 0),
      totalVolume: totals.totalVolume + calculatePackageVolume(pkg),
    }),
    { totalWeight: 0, totalVolume: 0 },
  );

export const mapPackageToEditableRow = (pkg: CnPackage, index: number): BatchPackageRow => ({
  key: pkg.id || `pkg-${index}`,
  id: pkg.id,
  trackingNumber: pkg.tracking_number ?? "",
  weight: typeof pkg.weight === "number" ? pkg.weight : undefined,
  volume: typeof pkg.volume === "number" ? pkg.volume : undefined,
  height: typeof pkg.actual_height === "number" ? pkg.actual_height : undefined,
  length: typeof pkg.actual_length === "number" ? pkg.actual_length : undefined,
  width: typeof pkg.actual_width === "number" ? pkg.actual_width : undefined,
});

export const mapApiBatchToViewModel = (record: BatchApiRecord): BatchViewModel => {
  const packages = record.packages ?? [];

  return {
    id: record.id,
    batchCode: record.batch_code,
    originWarehouseName: record.warehouse?.name ?? "Kho Trung Quốc",
    receivingWarehouseName: record.destination_warehouse_name?.trim() || DEFAULT_RECEIVING_WAREHOUSE,
    status: record.status,
    shippingType: record.shipping_type ?? "normal",
    totalPackages: Number(record.total_packages ?? packages.length),
    totalWeight: Number(record.total_weight ?? packages.reduce((sum, pkg) => sum + Number(pkg.weight ?? 0), 0)),
    totalVolume: packages.reduce((sum, pkg) => sum + getPackageVolume(pkg), 0),
    packagingType: record.packaging_type ?? undefined,
    transportContainerCount: record.transport_container_count ?? undefined,
    actualBatchWeight: record.actual_batch_weight ?? undefined,
    packageMaterialWeight: record.package_material_weight ?? undefined,
    actualLength: record.actual_length ?? undefined,
    actualWidth: record.actual_width ?? undefined,
    actualHeight: record.actual_height ?? undefined,
    actualVolume: record.actual_volume ?? undefined,
    carrierName: record.carrier_name ?? undefined,
    transportCode: record.transport_code ?? undefined,
    routeName: record.route_name ?? undefined,
    vehiclePlate: record.vehicle_plate ?? undefined,
    driverName: record.driver_name ?? undefined,
    driverPhone: record.driver_phone ?? undefined,
    freightCost: record.freight_cost ?? undefined,
    handedOverAt: record.handed_over_at ?? undefined,
    dispatchNote: record.dispatch_note ?? undefined,
    departedAt: record.departed_at ?? undefined,
    expectedArrivalAt: record.expected_arrival_at ?? undefined,
    arrivedAt: record.arrived_at ?? undefined,
    createdAt: record.created_at ?? undefined,
    note: record.note ?? undefined,
    packages,
  };
};

export const mapBatchToEditFormValues = (batch: BatchViewModel): BatchEditFormValues => ({
  batchCode: batch.batchCode,
  receivingWarehouseName: batch.receivingWarehouseName,
  status: batch.status,
  shippingType: batch.shippingType,
  freightCost: batch.freightCost,
  totalWeight: batch.totalWeight,
  totalVolume: batch.totalVolume,
  departedAt: dayjs(batch.departedAt ?? batch.createdAt ?? undefined),
  expectedArrivalAt: dayjs(batch.expectedArrivalAt ?? batch.arrivedAt ?? batch.departedAt ?? undefined),
  note: batch.note,
  packages: batch.packages.map(mapPackageToEditableRow),
});

export const mapEditFormValuesToInput = (values: BatchEditFormValues): BatchUpdateInput => ({
  destination_warehouse_name: values.receivingWarehouseName.trim(),
  shipping_type: values.shippingType,
  departed_at: values.departedAt.format("YYYY-MM-DD HH:mm:ss"),
  expected_arrival_at: values.expectedArrivalAt.format("YYYY-MM-DD HH:mm:ss"),
  note: values.note?.trim() || null,
  freight_cost: values.freightCost ?? null,
  packages: values.packages.map((pkg) => ({
    id: pkg.id,
    tracking_number: pkg.trackingNumber.trim(),
    weight: Number(pkg.weight ?? 0),
    actual_length: pkg.length ?? null,
    actual_width: pkg.width ?? null,
    actual_height: pkg.height ?? null,
  })),
});
