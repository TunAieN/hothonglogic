import { ClientError } from "graphql-request";
import dayjs from "dayjs";
import { GRAPHQL_API_URL, client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import { resolveMediaUrl } from "../../utils/mediaUrl";
import type {
  BatchInfoFormValues,
  ExpectedBatchPackage,
  ReceivedPackageDraft,
  VietnamWarehouseBatch,
  VietnamWarehouseReceiptData,
  VietnamWarehouseReceiptRecord,
  VietnamWarehouseReceiptStatus,
  VietnamWarehouseReceiptSummary,
  VietnamWarehouseStats,
  VietnamWarehouseStatus,
  VietnamWarehouseTableItem,
  PackageItemDetail,
  PackageEvidence,
  VietnamWarehouseFilterValues,
  VietnamWarehousePackageListItem,
  VietnamWarehousePackagePage,
  VietnamPackageErrorUpdateInput,
} from "./types";

type RawPackageItem = {
  order_item_id: string | number;
  quantity: number;
  order_item?: { product_name?: string; size?: string | null; color?: string | null } | null;
};

type RawCnPackage = {
  id: string | number;
  tracking_number?: string | null;
  weight?: number | null;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
  package_items?: RawPackageItem[];
  receiver_name?: string | null;
  order?: {
    order_code?: string | null;
    customer?: {
      name?: string | null;
    } | null;
  } | null;
};

type RawCnBatch = {
  id: string | number;
  batch_code: string;
  destination_warehouse_name?: string | null;
  total_packages?: number | null;
  total_weight?: number | null;
  status: string;
  arrived_at?: string | null;
  actual_batch_weight?: number | null;
  package_material_weight?: number | null;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
  transport_container_count?: number | null;
  packaging_type?: string | null;
  carrier_name?: string | null;
  transport_code?: string | null;
  departed_at?: string | null;
  expected_arrival_at?: string | null;
  warehouse?: { name?: string | null } | null;
};

type RawReceipt = {
  id: string | number;
  status: string;
  confirmed_at?: string | null;
  total_expected_packages: number;
  total_received_packages: number;
  total_inspected_packages: number;
  total_missing_packages: number;
  total_extra_packages: number;
  total_damaged_packages: number;
  actual_batch_weight?: number | null;
  actual_container_count?: number | null;
  outer_condition?: string | null;
  batch_weight_difference?: number | null;
  requires_resolution?: boolean | null;
  received_at?: string | null;
  package_material_weight?: number | null;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
  note?: string | null;
  batch_code?: string;
  warehouse?: { name?: string | null } | null;
  batch?: { batch_code?: string | null; destination_warehouse_name?: string | null } | null;
};

type RawVnPackage = {
  id: string | number;
  tracking_number_snapshot?: string | null;
  actual_weight?: number | null;
  cn_weight_snapshot?: number | null;
  weight_difference?: number | null;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
  actual_volume?: number | null;
  physical_condition?: string | null;
  requires_item_inspection?: boolean | null;
  item_inspection_status?: string | null;
  exception_reason?: string | null;
  error_resolution_status?: string | null;
  resolution_note?: string | null;
  resolution_action?: string | null;
  resolution_result?: string | null;
  expected_completion_at?: string | null;
  error_detected_at?: string | null;
  error_resolved_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  extra_fee?: number | null;
  wooden_fee?: number | null;
  other_fee?: number | null;
  order_code_snapshot?: string | null;
  customer_name_snapshot?: string | null;
  inspection_status: string;
  note?: string | null;
  scanned_at?: string | null;
  received_at?: string | null;
  handler?: {
    name?: string | null;
  } | null;
  resolver?: { name?: string | null } | null;
  receipt?: RawReceipt | null;
  cn_package?: RawCnPackage | null;
  inspected_items?: Array<{
    order_item_id?: string | number | null;
    product_name_snapshot: string;
    variant_snapshot?: string | null;
    expected_quantity: number;
    received_quantity: number;
    condition_status: string;
    note?: string | null;
  }>;
  evidences?: RawPackageEvidence[];
};

type RawPackageEvidence = {
  id: string | number;
  evidence_type: PackageEvidence["type"];
  url: string;
  thumbnail_url?: string | null;
  original_name: string;
  mime_type: string;
  file_size: number;
  created_at?: string | null;
  creator?: { name?: string | null } | null;
};

type RawSummary = {
  expectedCount: number;
  receivedCount: number;
  inspectedCount: number;
  extraCount: number;
  damagedCount: number;
  mismatchCount: number;
  weightMismatchCount: number;
  itemInspectionPendingCount: number;
  missingCount: number;
  storedCount: number;
  receivableCount: number;
  errorCount: number;
  batchWeightMismatch: boolean;
  containerMismatch: boolean;
  batchResolutionPending: boolean;
  hasIssues: boolean;
  matched: boolean;
};

type RawReceiptPayload = {
  batch: RawCnBatch;
  receipt: RawReceipt | null;
  expectedPackages: RawCnPackage[];
  receivedPackages: RawVnPackage[];
  summary: RawSummary;
};

type RawOverviewBatch = RawCnBatch & {
  packages: RawCnPackage[];
  vn_batch_receipt?: (RawReceipt & {
    packages: RawVnPackage[];
  }) | null;
};

const RECEIPT_PAYLOAD_FIELDS = `
  batch {
    id
    batch_code
    destination_warehouse_name
    total_packages
    total_weight
    status
    actual_batch_weight
    package_material_weight
    actual_length
    actual_width
    actual_height
    transport_container_count
    packaging_type
    carrier_name
    transport_code
    departed_at
    expected_arrival_at
    warehouse { name }
  }
  receipt {
    id
    status
    confirmed_at
    received_at
    actual_container_count
    outer_condition
    batch_weight_difference
    requires_resolution
    total_expected_packages
    total_received_packages
    total_inspected_packages
    total_missing_packages
    total_extra_packages
    total_damaged_packages
    actual_batch_weight
    package_material_weight
    actual_length
    actual_width
    actual_height
    note
  }
  expectedPackages {
    id
    tracking_number
    weight
    actual_length
    actual_width
    actual_height
    receiver_name
    order {
      order_code
      customer {
        name
      }
    }
    package_items {
      order_item_id
      quantity
      order_item { product_name size color }
    }
  }
  receivedPackages {
    id
    tracking_number_snapshot
    actual_weight
    cn_weight_snapshot
    weight_difference
    actual_length
    actual_width
    actual_height
    actual_volume
    physical_condition
    requires_item_inspection
    item_inspection_status
    exception_reason
    error_resolution_status
    resolution_note
    error_detected_at
    error_resolved_at
    extra_fee
    wooden_fee
    other_fee
    order_code_snapshot
    customer_name_snapshot
    inspection_status
    note
    scanned_at
    received_at
    created_at
    updated_at
    handler {
      name
    }
    resolver { name }
    cn_package {
      id tracking_number weight actual_length actual_width actual_height
      package_items {
        order_item_id quantity
        order_item { product_name size color }
      }
    }
    inspected_items {
      order_item_id product_name_snapshot variant_snapshot expected_quantity
      received_quantity condition_status note
    }
    evidences {
      id evidence_type url thumbnail_url original_name mime_type file_size created_at
      creator { name }
    }
  }
  summary {
    expectedCount
    receivedCount
    inspectedCount
    extraCount
    damagedCount
    mismatchCount
    weightMismatchCount
    itemInspectionPendingCount
    missingCount
    storedCount
    receivableCount
    errorCount
    batchWeightMismatch
    containerMismatch
    batchResolutionPending
    hasIssues
    matched
  }
`;

const VN_PACKAGE_LIST_FIELDS = `
  id
  tracking_number_snapshot
  cn_weight_snapshot
  actual_weight
  weight_difference
  actual_length
  actual_width
  actual_height
  physical_condition
  requires_item_inspection
  item_inspection_status
  exception_reason
  error_resolution_status
  resolution_note
  resolution_action
  resolution_result
  expected_completion_at
  error_detected_at
  error_resolved_at
  order_code_snapshot
  customer_name_snapshot
  inspection_status
  note
  scanned_at
  received_at
  created_at
  updated_at
  handler { name }
  resolver { name }
  receipt {
    id
    batch_code
    warehouse { name }
    batch { batch_code destination_warehouse_name }
  }
  cn_package {
    id tracking_number weight actual_length actual_width actual_height
    order { order_code customer { name } }
    package_items {
      order_item_id quantity
      order_item { product_name size color }
    }
  }
  inspected_items {
    order_item_id product_name_snapshot variant_snapshot expected_quantity
    received_quantity condition_status note
  }
  evidences {
    id evidence_type url thumbnail_url original_name mime_type file_size created_at
    creator { name }
  }
`;

const OVERVIEW_BATCH_FIELDS = `
  id
  batch_code
  destination_warehouse_name
  total_packages
  total_weight
  status
  arrived_at
  actual_batch_weight
  package_material_weight
  actual_length
  actual_width
  actual_height
  transport_container_count
  packaging_type
  carrier_name
  transport_code
  departed_at
  expected_arrival_at
  warehouse { name }
  packages {
    id
    tracking_number
    weight
    actual_length actual_width actual_height
    receiver_name
    order {
      order_code
      customer {
        name
      }
    }
    package_items {
      order_item_id quantity
      order_item { product_name size color }
    }
  }
  vn_batch_receipt {
    id
    status
    confirmed_at
    received_at
    actual_container_count
    outer_condition
    batch_weight_difference
    requires_resolution
    total_expected_packages
    total_received_packages
    total_inspected_packages
    total_missing_packages
    total_extra_packages
    total_damaged_packages
    actual_batch_weight
    package_material_weight
    actual_length
    actual_width
    actual_height
    note
    packages {
      id
      tracking_number_snapshot
      actual_weight
      cn_weight_snapshot
      weight_difference
      actual_length
      actual_width
      actual_height
      actual_volume
      physical_condition
      requires_item_inspection
      item_inspection_status
      exception_reason
      extra_fee
      wooden_fee
      other_fee
      order_code_snapshot
      customer_name_snapshot
      inspection_status
      note
      scanned_at
      received_at
      handler {
        name
      }
      cn_package {
        id tracking_number weight actual_length actual_width actual_height
        package_items {
          order_item_id quantity
          order_item { product_name size color }
        }
      }
      inspected_items {
        order_item_id product_name_snapshot variant_snapshot expected_quantity
        received_quantity condition_status note
      }
    }
  }
`;

const statusMap: Record<string, VietnamWarehouseStatus> = {
  pending: "pending_check",
  checking: "pending_check",
  mismatched: "mismatched",
  matched: "checked",
  inspected: "checked",
  missing: "missing",
  extra: "extra",
  damaged: "damaged",
  confirmed: "arrived_vn",
  arrived_vn: "arrived_vn",
};

const normalizeStatus = (status?: string | null): VietnamWarehouseStatus =>
  statusMap[status ?? ""] ?? "pending_check";

const normalizeReceiptStatus = (status?: string | null): VietnamWarehouseReceiptStatus =>
  (status ?? "checking") as VietnamWarehouseReceiptStatus;

const buildErrorStatusLabel = (summary: {
  missingCount: number;
  extraCount: number;
  damagedCount: number;
  mismatchCount?: number;
}) => {
  const parts: string[] = [];

  if (summary.missingCount > 0) {
    parts.push("Thieu kien");
  }

  if (summary.extraCount > 0) {
    parts.push("Thua kien");
  }

  if (summary.damagedCount > 0) {
    parts.push("Hư hỏng");
  }

  if ((summary.mismatchCount ?? 0) > 0) {
    parts.push("Sai lệch");
  }

  return parts.length > 0 ? parts.join(", ") : "Không có lỗi";
};

const buildProcessingStatusLabel = (status?: VietnamWarehouseReceiptStatus) => {
  switch (status) {
    case "confirmed":
      return "Da nhap kho";
    case "mismatched":
      return "Cho xu ly loi";
    case "matched":
      return "Da khop, cho xac nhan";
    case "checking":
      return "Đang kiểm";
    default:
      return "Đang kiểm";
  }
};

const buildVolumetricWeight = (
  weight?: number | null,
  length?: number | null,
  width?: number | null,
  height?: number | null,
  volume?: number | null,
) => {
  if (typeof volume === "number" && volume > 0) {
    return Math.max(weight ?? 0, (volume * 1_000_000) / 6000);
  }

  if (length && width && height) {
    return Math.max(weight ?? 0, (length * width * height) / 6000);
  }

  return weight ?? 0;
};

const mapBatch = (batch: RawCnBatch, receipt?: RawReceipt | null): VietnamWarehouseBatch => ({
  id: String(batch.id),
  batchCode: batch.batch_code,
  destinationWarehouseName: batch.destination_warehouse_name ?? "Kho Việt Nam",
  totalPackages: batch.total_packages ?? 0,
  totalWeight: Number(receipt?.actual_batch_weight ?? batch.total_weight ?? 0),
  originWarehouseName: batch.warehouse?.name ?? "Kho Trung Quốc",
  dispatchWeight: Number(batch.actual_batch_weight ?? batch.total_weight ?? 0),
  transportContainerCount: Number(batch.transport_container_count ?? 0),
  packagingType: batch.packaging_type ?? "Chưa cập nhật",
  packageMaterialWeight: Number(batch.package_material_weight ?? 0),
  dispatchLength: Number(batch.actual_length ?? 0),
  dispatchWidth: Number(batch.actual_width ?? 0),
  dispatchHeight: Number(batch.actual_height ?? 0),
  carrierName: batch.carrier_name ?? "Chưa cập nhật",
  transportCode: batch.transport_code ?? "Chưa cập nhật",
  departedAt: batch.departed_at,
  expectedArrivalAt: batch.expected_arrival_at,
  status: normalizeStatus(receipt?.status ?? batch.status),
});

const mapExpectedPackage = (item: RawCnPackage): ExpectedBatchPackage => ({
  id: String(item.id),
  trackingCode: item.tracking_number ?? "",
  orderCode: item.order?.order_code ?? "",
  customerName: item.order?.customer?.name ?? item.receiver_name ?? "",
  cnWeight: Number(item.weight ?? 0),
  length: Number(item.actual_length ?? 0),
  width: Number(item.actual_width ?? 0),
  height: Number(item.actual_height ?? 0),
  items: (item.package_items ?? []).map((packageItem): PackageItemDetail => ({
    orderItemId: String(packageItem.order_item_id),
    productName: packageItem.order_item?.product_name ?? `Item #${packageItem.order_item_id}`,
    variant: [packageItem.order_item?.size, packageItem.order_item?.color].filter(Boolean).join(" / ") || undefined,
    expectedQuantity: packageItem.quantity,
  })),
});

const mapReceivedPackage = (item: RawVnPackage): ReceivedPackageDraft => ({
  id: `received-${item.id}`,
  receiptPackageId: String(item.id),
  trackingCode: item.tracking_number_snapshot ?? "",
  orderCode: item.order_code_snapshot ?? "",
  customerName: item.customer_name_snapshot ?? "",
  volumetricWeight: buildVolumetricWeight(
    item.actual_weight,
    item.actual_length,
    item.actual_width,
    item.actual_height,
    item.actual_volume,
  ),
  status: normalizeStatus(item.inspection_status) as ReceivedPackageDraft["status"],
  weight: Number(item.actual_weight ?? 0),
  cnWeight: Number(item.cn_weight_snapshot ?? item.cn_package?.weight ?? 0),
  weightDifference: Number(item.weight_difference ?? 0),
  length: Number(item.actual_length ?? 0),
  width: Number(item.actual_width ?? 0),
  height: Number(item.actual_height ?? 0),
  physicalCondition: item.physical_condition ?? "normal",
  requiresItemInspection: Boolean(item.requires_item_inspection),
  itemInspectionStatus: item.item_inspection_status ?? "not_required",
  items: (item.inspected_items?.length
    ? item.inspected_items.map((inspected) => ({
        orderItemId: String(inspected.order_item_id ?? ""),
        productName: inspected.product_name_snapshot,
        variant: inspected.variant_snapshot ?? undefined,
        expectedQuantity: inspected.expected_quantity,
        receivedQuantity: inspected.received_quantity,
        conditionStatus: inspected.condition_status,
        note: inspected.note ?? undefined,
      }))
    : (item.cn_package?.package_items ?? []).map((packageItem) => ({
        orderItemId: String(packageItem.order_item_id),
        productName: packageItem.order_item?.product_name ?? `Item #${packageItem.order_item_id}`,
        variant: [packageItem.order_item?.size, packageItem.order_item?.color].filter(Boolean).join(" / ") || undefined,
        expectedQuantity: packageItem.quantity,
      }))),
  evidences: (item.evidences ?? []).map(mapPackageEvidence),
  note: item.note ?? undefined,
});

const mapPackageEvidence = (evidence: RawPackageEvidence): PackageEvidence => ({
  id: String(evidence.id),
  type: evidence.evidence_type,
  url: resolveMediaUrl(evidence.url),
  thumbnailUrl: resolveMediaUrl(evidence.thumbnail_url || evidence.url),
  originalName: evidence.original_name,
  mimeType: evidence.mime_type,
  fileSize: Number(evidence.file_size),
  createdAt: evidence.created_at ?? undefined,
  createdBy: evidence.creator?.name ?? undefined,
});

const buildPackageItems = (item: RawVnPackage): PackageItemDetail[] => item.inspected_items?.length
  ? item.inspected_items.map((inspected) => ({
      orderItemId: String(inspected.order_item_id ?? ""),
      productName: inspected.product_name_snapshot,
      variant: inspected.variant_snapshot ?? undefined,
      expectedQuantity: inspected.expected_quantity,
      receivedQuantity: inspected.received_quantity,
      conditionStatus: inspected.condition_status,
      note: inspected.note ?? undefined,
    }))
  : (item.cn_package?.package_items ?? []).map((packageItem) => ({
      orderItemId: String(packageItem.order_item_id),
      productName: packageItem.order_item?.product_name ?? `Item #${packageItem.order_item_id}`,
      variant: [packageItem.order_item?.size, packageItem.order_item?.color].filter(Boolean).join(" / ") || undefined,
      expectedQuantity: packageItem.quantity,
    }));

const getPackageErrorType = (item: RawVnPackage) => {
  if (item.requires_item_inspection) return "Chờ kiểm item";
  if (item.inspection_status === "extra") return "Kiện ngoài lô";
  if (item.inspection_status === "damaged") return "Hư hỏng";
  if (item.inspection_status === "mismatched") {
    return Math.abs(Number(item.weight_difference ?? 0)) > 0 ? "Sai lệch cân nặng" : "Sai lệch item";
  }
  return "Không có lỗi";
};

const mapWarehousePackage = (item: RawVnPackage): VietnamWarehousePackageListItem => ({
  id: String(item.id),
  receiptId: item.receipt?.id ? String(item.receipt.id) : undefined,
  trackingCode: item.tracking_number_snapshot ?? "",
  orderCode: item.order_code_snapshot ?? item.cn_package?.order?.order_code ?? "",
  batchCode: item.receipt?.batch_code ?? item.receipt?.batch?.batch_code ?? "",
  customerName: item.customer_name_snapshot ?? item.cn_package?.order?.customer?.name ?? "",
  warehouseName: item.receipt?.warehouse?.name ?? item.receipt?.batch?.destination_warehouse_name ?? "Kho Việt Nam",
  handlerName: item.handler?.name ?? "—",
  resolverName: item.resolver?.name ?? undefined,
  cnWeight: Number(item.cn_weight_snapshot ?? item.cn_package?.weight ?? 0),
  actualWeight: Number(item.actual_weight ?? 0),
  weightDifference: Number(item.weight_difference ?? 0),
  length: Number(item.actual_length ?? 0),
  width: Number(item.actual_width ?? 0),
  height: Number(item.actual_height ?? 0),
  physicalCondition: item.physical_condition ?? "normal",
  itemInspectionStatus: item.item_inspection_status ?? "not_required",
  requiresItemInspection: Boolean(item.requires_item_inspection),
  inspectionStatus: item.inspection_status,
  errorType: getPackageErrorType(item),
  errorResolutionStatus: item.error_resolution_status ?? undefined,
  exceptionReason: item.exception_reason ?? undefined,
  resolutionNote: item.resolution_note ?? undefined,
  resolutionAction: item.resolution_action ?? undefined,
  resolutionResult: item.resolution_result ?? undefined,
  expectedCompletionAt: item.expected_completion_at ?? undefined,
  note: item.note ?? undefined,
  scannedAt: item.scanned_at ?? undefined,
  errorDetectedAt: item.error_detected_at ?? undefined,
  errorResolvedAt: item.error_resolved_at ?? undefined,
  receivedAt: item.received_at ?? undefined,
  createdAt: item.created_at ?? undefined,
  updatedAt: item.updated_at ?? undefined,
  items: buildPackageItems(item),
  evidences: (item.evidences ?? []).map(mapPackageEvidence),
});

const EVIDENCE_API_URL = GRAPHQL_API_URL.replace(/\/graphql\/?$/, "/api");

const parseEvidenceApiError = async (response: Response) => {
  const payload = await response.json().catch(() => null) as { message?: string; errors?: Record<string, string[]> } | null;
  const validationMessage = payload?.errors ? Object.values(payload.errors).flat()[0] : undefined;
  return validationMessage || payload?.message || `Không thể xử lý ảnh minh chứng (${response.status}).`;
};

export const uploadVietnamPackageEvidences = async (
  packageId: string,
  files: File[],
  type: PackageEvidence["type"] = "reconciliation",
) => {
  if (!files.length) return [];
  const formData = new FormData();
  formData.append("evidence_type", type);
  files.forEach((file) => formData.append("images[]", file, file.name));
  const response = await fetch(`${EVIDENCE_API_URL}/vietnam-warehouse/packages/${packageId}/evidences`, {
    method: "POST",
    headers: { ...getGraphqlAuthHeaders(), Accept: "application/json" },
    body: formData,
  });
  if (!response.ok) throw new Error(await parseEvidenceApiError(response));
  const payload = await response.json() as { data: RawPackageEvidence[] };
  return payload.data.map(mapPackageEvidence);
};

export const deleteVietnamPackageEvidence = async (packageId: string, evidenceId: string) => {
  const response = await fetch(`${EVIDENCE_API_URL}/vietnam-warehouse/packages/${packageId}/evidences/${evidenceId}`, {
    method: "DELETE",
    headers: { ...getGraphqlAuthHeaders(), Accept: "application/json" },
  });
  if (!response.ok) throw new Error(await parseEvidenceApiError(response));
};

const mapReceipt = (receipt: RawReceipt | null): VietnamWarehouseReceiptRecord | null => {
  if (!receipt) {
    return null;
  }

  return {
    id: String(receipt.id),
    status: normalizeReceiptStatus(receipt.status),
    confirmedAt: receipt.confirmed_at,
    receivedAt: receipt.received_at,
    actualContainerCount: Number(receipt.actual_container_count ?? 0),
    outerCondition: receipt.outer_condition ?? "normal",
    batchWeightDifference: Number(receipt.batch_weight_difference ?? 0),
    requiresResolution: Boolean(receipt.requires_resolution),
    totalExpectedPackages: receipt.total_expected_packages,
    totalReceivedPackages: receipt.total_received_packages,
    totalInspectedPackages: receipt.total_inspected_packages,
    totalMissingPackages: receipt.total_missing_packages,
    totalExtraPackages: receipt.total_extra_packages,
    totalDamagedPackages: receipt.total_damaged_packages,
    actualBatchWeight: Number(receipt.actual_batch_weight ?? 0),
    packageMaterialWeight: Number(receipt.package_material_weight ?? 0),
    actualLength: Number(receipt.actual_length ?? 0),
    actualWidth: Number(receipt.actual_width ?? 0),
    actualHeight: Number(receipt.actual_height ?? 0),
    note: receipt.note,
  };
};

const mapSummary = (summary: RawSummary): VietnamWarehouseReceiptSummary => summary;

const mapReceiptPayload = (payload: RawReceiptPayload): VietnamWarehouseReceiptData => ({
  batch: mapBatch(payload.batch, payload.receipt),
  receipt: mapReceipt(payload.receipt),
  expectedPackages: payload.expectedPackages.map(mapExpectedPackage),
  receivedPackages: payload.receivedPackages.map(mapReceivedPackage),
  summary: mapSummary(payload.summary),
});

const getErrorMessage = (error: unknown) => {
  if (error instanceof ClientError) {
    return error.response.errors?.[0]?.message ?? "GraphQL request failed.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error.";
};

const requestGraphql = async <TResult, TVariables extends Record<string, unknown>>(
  query: string,
  variables: TVariables,
) => {
  syncGraphqlAuthToken();

  return client.request<TResult>(query, variables as never);
};

export const fetchVietnamWarehouseReceipt = async (batchCode: string) => {
  const query = `
    query VietnamWarehouseReceipt($batchCode: String!) {
      vietnamWarehouseReceipt(batch_code: $batchCode) {
        ${RECEIPT_PAYLOAD_FIELDS}
      }
    }
  `;

  const response = await requestGraphql<
    { vietnamWarehouseReceipt: RawReceiptPayload },
    { batchCode: string }
  >(query, { batchCode });

  return mapReceiptPayload(response.vietnamWarehouseReceipt);
};

export const fetchVietnamWarehousePackages = async (
  scope: "stored" | "error",
  filters: VietnamWarehouseFilterValues = {},
  page = 1,
  first = 10,
): Promise<VietnamWarehousePackagePage> => {
  const query = `
    query VietnamWarehousePackages($filter: VietnamWarehousePackageFilterInput, $page: Int!, $first: Int!) {
      vietnamWarehousePackages(filter: $filter, page: $page, first: $first) {
        data { ${VN_PACKAGE_LIST_FIELDS} }
        paginatorInfo { total currentPage lastPage perPage }
      }
    }
  `;
  const response = await requestGraphql<{
    vietnamWarehousePackages: {
      data: RawVnPackage[];
      paginatorInfo: { total: number; currentPage: number; lastPage: number; perPage: number };
    };
  }, { filter: Record<string, unknown>; page: number; first: number }>(query, {
    filter: {
      scope,
      tracking_number: filters.trackingCode?.trim() || undefined,
      batch_code: filters.batchCode?.trim() || undefined,
      customer_name: filters.customerName?.trim() || undefined,
      warehouse_id: filters.warehouseId || undefined,
      warehouse_name: filters.warehouseName?.trim() || undefined,
      handled_by: filters.handlerId || undefined,
      handler_name: filters.receiverName?.trim() || undefined,
      error_type: filters.errorType || undefined,
      resolution_status: filters.resolutionStatus || undefined,
      date_from: filters.receivedFrom?.startOf("day").format("YYYY-MM-DD HH:mm:ss"),
      date_to: filters.receivedTo?.endOf("day").format("YYYY-MM-DD HH:mm:ss"),
    },
    page,
    first,
  });
  const result = response.vietnamWarehousePackages;
  return { items: result.data.map(mapWarehousePackage), ...result.paginatorInfo };
};

export const fetchVietnamWarehousePackage = async (id: string) => {
  const query = `
    query VietnamWarehousePackage($id: ID!) {
      vietnamWarehousePackage(id: $id) { ${VN_PACKAGE_LIST_FIELDS} }
    }
  `;
  const response = await requestGraphql<
    { vietnamWarehousePackage: RawVnPackage },
    { id: string }
  >(query, { id });
  return mapWarehousePackage(response.vietnamWarehousePackage);
};

export const updateVietnamPackageError = async (packageId: string, input: VietnamPackageErrorUpdateInput) => {
  const mutation = `
    mutation UpdateVietnamPackageError($input: UpdateVietnamPackageErrorInput!) {
      updateVietnamPackageError(input: $input) { ${VN_PACKAGE_LIST_FIELDS} }
    }
  `;
  const response = await requestGraphql<
    { updateVietnamPackageError: RawVnPackage },
    { input: Record<string, unknown> }
  >(mutation, {
    input: {
      package_id: packageId,
      resolution_status: input.resolutionStatus,
      resolution_action: input.resolutionAction || null,
      resolution_result: input.resolutionResult || null,
      expected_completion_at: input.expectedCompletionAt || null,
      note: input.note || null,
    },
  });
  return mapWarehousePackage(response.updateVietnamPackageError);
};

export const startVietnamWarehouseReceipt = async (values: BatchInfoFormValues) => {
  const mutation = `
    mutation StartVietnamWarehouseReceipt($input: StartVietnamWarehouseReceiptInput!) {
      startVietnamWarehouseReceipt(input: $input) {
        id
      }
    }
  `;

  await requestGraphql<
    { startVietnamWarehouseReceipt: { id: string | number } },
    {
      input: {
        batch_code: string;
        actual_container_count: number;
        actual_batch_weight: number;
        actual_length?: number;
        actual_width?: number;
        actual_height?: number;
        actual_volume?: number;
        outer_condition: string;
        received_at: string;
        note?: string;
      };
    }
  >(mutation, {
    input: {
      batch_code: values.batchCode,
      actual_container_count: values.actualContainerCount,
      actual_batch_weight: values.actualBatchWeight,
      actual_length: values.remeasureDimensions ? values.length : undefined,
      actual_width: values.remeasureDimensions ? values.width : undefined,
      actual_height: values.remeasureDimensions ? values.height : undefined,
      actual_volume: values.remeasureDimensions && values.length && values.width && values.height
        ? Number(((values.length * values.width * values.height) / 1_000_000).toFixed(4))
        : undefined,
      outer_condition: values.outerCondition,
      received_at: values.receivedAt.format("YYYY-MM-DD HH:mm:ss"),
      note: values.note,
    },
  });

  return fetchVietnamWarehouseReceipt(values.batchCode);
};

export const scanVietnamPackage = async (
  receiptId: string,
  values: {
    trackingCode: string;
    weight: number;
    length: number;
    width: number;
    height: number;
    physicalCondition: string;
    requiresItemInspection?: boolean;
    exceptionReason?: string;
    note?: string;
    inspectionStatus?: "inspected" | "damaged";
  },
) => {
  const mutation = `
    mutation ScanVietnamPackage($input: ScanVietnamPackageInput!) {
      scanVietnamPackage(input: $input) {
        ${RECEIPT_PAYLOAD_FIELDS}
      }
    }
  `;

  const response = await requestGraphql<
    { scanVietnamPackage: RawReceiptPayload },
    {
      input: {
        receipt_id: string;
        tracking_number: string;
        actual_weight: number;
        actual_length: number;
        actual_width: number;
        actual_height: number;
        actual_volume: number;
        physical_condition: string;
        requires_item_inspection: boolean;
        exception_reason?: string;
        note?: string;
        inspection_status?: string;
      };
    }
  >(mutation, {
    input: {
      receipt_id: receiptId,
      tracking_number: values.trackingCode,
      actual_weight: values.weight,
      actual_length: values.length,
      actual_width: values.width,
      actual_height: values.height,
      actual_volume: Number(((values.length * values.width * values.height) / 1_000_000).toFixed(4)),
      physical_condition: values.physicalCondition,
      requires_item_inspection: Boolean(values.requiresItemInspection),
      exception_reason: values.exceptionReason,
      note: values.note,
      inspection_status: values.inspectionStatus,
    },
  });

  return mapReceiptPayload(response.scanVietnamPackage);
};

export const inspectVietnamPackageItems = async (
  packageId: string,
  items: PackageItemDetail[],
) => {
  const mutation = `
    mutation InspectVietnamPackageItems($packageId: ID!, $items: [VietnamPackageItemInspectionInput!]!) {
      inspectVietnamPackageItems(package_id: $packageId, items: $items) {
        ${RECEIPT_PAYLOAD_FIELDS}
      }
    }
  `;

  const response = await requestGraphql<
    { inspectVietnamPackageItems: RawReceiptPayload },
    { packageId: string; items: Array<Record<string, unknown>> }
  >(mutation, {
    packageId,
    items: items.map((item) => ({
      order_item_id: item.orderItemId,
      received_quantity: item.receivedQuantity ?? 0,
      condition_status: item.conditionStatus ?? "normal",
      note: item.note,
    })),
  });

  return mapReceiptPayload(response.inspectVietnamPackageItems);
};

export const resolveVietnamReceiptDiscrepancy = async (receiptId: string, resolutionNote: string) => {
  const mutation = `
    mutation ResolveVietnamReceiptDiscrepancy($receiptId: ID!, $resolutionNote: String!) {
      resolveVietnamReceiptDiscrepancy(receipt_id: $receiptId, resolution_note: $resolutionNote) {
        ${RECEIPT_PAYLOAD_FIELDS}
      }
    }
  `;
  const response = await requestGraphql<
    { resolveVietnamReceiptDiscrepancy: RawReceiptPayload },
    { receiptId: string; resolutionNote: string }
  >(mutation, { receiptId, resolutionNote });
  return mapReceiptPayload(response.resolveVietnamReceiptDiscrepancy);
};

export const resolveVietnamPackageDiscrepancy = async (packageId: string, resolutionNote: string) => {
  const mutation = `
    mutation ResolveVietnamPackageDiscrepancy($packageId: ID!, $resolutionNote: String!) {
      resolveVietnamPackageDiscrepancy(package_id: $packageId, resolution_note: $resolutionNote) {
        ${RECEIPT_PAYLOAD_FIELDS}
      }
    }
  `;
  const response = await requestGraphql<
    { resolveVietnamPackageDiscrepancy: RawReceiptPayload },
    { packageId: string; resolutionNote: string }
  >(mutation, { packageId, resolutionNote });
  return mapReceiptPayload(response.resolveVietnamPackageDiscrepancy);
};

export const removeVietnamPackage = async (packageId: string, batchCode: string) => {
  const mutation = `
    mutation RemoveVietnamPackage($id: ID!) {
      removeVietnamPackage(id: $id) {
        ${RECEIPT_PAYLOAD_FIELDS}
      }
    }
  `;

  await requestGraphql<{ removeVietnamPackage: RawReceiptPayload }, { id: string }>(mutation, {
    id: packageId,
  });

  return fetchVietnamWarehouseReceipt(batchCode);
};

export const moveVietnamWarehouseReceiptToErrorQueue = async (
  receiptId: string,
  batchCode: string,
) => {
  const mutation = `
    mutation MoveVietnamWarehouseReceiptToErrorQueue($receiptId: ID!) {
      moveVietnamWarehouseReceiptToErrorQueue(receipt_id: $receiptId) {
        id
      }
    }
  `;

  await requestGraphql<
    { moveVietnamWarehouseReceiptToErrorQueue: { id: string | number } },
    { receiptId: string }
  >(mutation, { receiptId });

  return fetchVietnamWarehouseReceipt(batchCode);
};

export const confirmVietnamWarehouseReceipt = async (receiptId: string, batchCode: string) => {
  const mutation = `
    mutation ConfirmVietnamWarehouseReceipt($receiptId: ID!) {
      confirmVietnamWarehouseReceipt(receipt_id: $receiptId) {
        id
      }
    }
  `;

  await requestGraphql<
    { confirmVietnamWarehouseReceipt: { id: string | number } },
    { receiptId: string }
  >(mutation, { receiptId });

  return fetchVietnamWarehouseReceipt(batchCode);
};

export const mapReceiptDataToTableData = (
  payload: VietnamWarehouseReceiptData,
): VietnamWarehouseTableItem[] =>
  [
    {
      id: payload.receipt?.id ?? payload.batch.id,
      receiptId: payload.receipt?.id,
      receiptStatus: payload.receipt?.status,
      receivedDate: payload.receipt?.confirmedAt ?? new Date().toISOString(),
      handlerName: "Admin",
      batchCode: payload.batch.batchCode,
      warehouseName: payload.batch.destinationWarehouseName,
      totalPackages: payload.summary.expectedCount,
      receivedCount: payload.summary.receivedCount,
      missingCount: payload.summary.missingCount,
      extraCount: payload.summary.extraCount,
      damagedCount: payload.summary.damagedCount,
      status:
        payload.receipt?.status === "confirmed"
          ? "arrived_vn"
          : payload.receipt?.status === "mismatched"
            ? "mismatched"
            : "pending_check",
      errorStatusLabel: buildErrorStatusLabel(payload.summary),
      processingStatusLabel: buildProcessingStatusLabel(payload.receipt?.status),
      receiverName: "Admin",
      trackingCode: payload.expectedPackages.map((item) => item.trackingCode).join(" "),
      customerName: payload.expectedPackages.map((item) => item.customerName).join(" "),
    },
  ];

const mapOverviewBatchToTableData = (batch: RawOverviewBatch): VietnamWarehouseTableItem[] => {
  const receipt = batch.vn_batch_receipt;

  if (!receipt) {
    return [];
  }

  const expectedPackages = batch.packages.map(mapExpectedPackage);
  const receivedPackages = receipt.packages.map(mapReceivedPackage);
  const handlerName =
    receipt.packages.find((item) => item.handler?.name)?.handler?.name ?? "Admin";

  return [
    {
      id: String(receipt.id),
      receiptId: String(receipt.id),
      receiptStatus: normalizeReceiptStatus(receipt.status),
      receivedDate: receipt.confirmed_at ?? batch.arrived_at ?? new Date().toISOString(),
      handlerName,
      batchCode: batch.batch_code,
      warehouseName: batch.destination_warehouse_name ?? "Kho Việt Nam",
      totalPackages: receipt.total_expected_packages ?? expectedPackages.length,
      receivedCount: receipt.total_received_packages ?? receivedPackages.length,
      missingCount: receipt.total_missing_packages ?? 0,
      extraCount: receipt.total_extra_packages ?? 0,
      damagedCount: receipt.total_damaged_packages ?? 0,
      status:
        receipt.status === "confirmed"
          ? "arrived_vn"
          : receipt.status === "mismatched"
            ? "mismatched"
            : "pending_check",
      errorStatusLabel: buildErrorStatusLabel({
        missingCount: receipt.total_missing_packages ?? 0,
        extraCount: receipt.total_extra_packages ?? 0,
        damagedCount: receipt.total_damaged_packages ?? 0,
      }),
      processingStatusLabel: buildProcessingStatusLabel(normalizeReceiptStatus(receipt.status)),
      receiverName: handlerName,
      trackingCode: expectedPackages.map((item) => item.trackingCode).join(" "),
      customerName: expectedPackages.map((item) => item.customerName).join(" "),
    },
  ];
};

export const buildBatchInfoDefaults = (
  payload: VietnamWarehouseReceiptData,
): BatchInfoFormValues => ({
  batchCode: payload.batch.batchCode,
  actualBatchWeight: payload.receipt?.actualBatchWeight || payload.batch.dispatchWeight || 0,
  actualContainerCount: payload.receipt?.actualContainerCount || payload.batch.transportContainerCount || 1,
  outerCondition: payload.receipt?.outerCondition || "normal",
  receivedAt: payload.receipt?.receivedAt ? dayjs(payload.receipt.receivedAt) : dayjs(),
  remeasureDimensions: Boolean(payload.receipt?.actualLength),
  length: payload.receipt?.actualLength || undefined,
  width: payload.receipt?.actualWidth || undefined,
  height: payload.receipt?.actualHeight || undefined,
  note: payload.receipt?.note ?? undefined,
});

export const buildStatsFromTableData = (
  tableData: VietnamWarehouseTableItem[],
): VietnamWarehouseStats => ({
  totalBatches: new Set(tableData.map((item) => item.batchCode)).size,
  importedBatches: tableData.filter((item) => item.status === "arrived_vn").length,
  pendingCheckBatches: tableData.filter((item) => item.status === "pending_check").length,
  discrepancyBatches: tableData.filter((item) => item.status === "mismatched").length,
});

export const fetchVietnamWarehouseOverview = async () => {
  const query = `
    query VietnamWarehouseOverview($page: Int!, $first: Int!) {
      cnBatches(page: $page, first: $first) {
        data {
          ${OVERVIEW_BATCH_FIELDS}
        }
        paginatorInfo {
          total
        }
      }
    }
  `;

  const response = await requestGraphql<
    {
    cnBatches: {
      data: RawOverviewBatch[];
      paginatorInfo: {
        total: number;
      };
    };
  },
    { page: number; first: number }
  >(query, { page: 1, first: 200 });

  const batchesWithReceipt = response.cnBatches.data.filter(
    (item: RawOverviewBatch) => Boolean(item.vn_batch_receipt),
  );

  const listedBatches = batchesWithReceipt;

  const tableData = listedBatches.flatMap(mapOverviewBatchToTableData);
  const totalBatches = batchesWithReceipt.length;
  const importedBatches = batchesWithReceipt.filter(
    (item: RawOverviewBatch) => item.vn_batch_receipt?.status === "confirmed",
  ).length;
  const pendingCheckBatches = batchesWithReceipt.filter((item: RawOverviewBatch) =>
    ["checking", "matched"].includes(item.vn_batch_receipt?.status ?? ""),
  ).length;
  const discrepancyBatches = batchesWithReceipt.filter(
    (item: RawOverviewBatch) => item.vn_batch_receipt?.status === "mismatched",
  ).length;

  return {
    tableData,
    stats: {
      totalBatches,
      importedBatches,
      pendingCheckBatches,
      discrepancyBatches,
    } satisfies VietnamWarehouseStats,
  };
};

export { getErrorMessage };
