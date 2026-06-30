import { ClientError } from "graphql-request";
import { client, syncGraphqlAuthToken } from "../../providers/graphqlClient";
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
} from "./types";

type RawCnPackage = {
  id: string | number;
  tracking_number?: string | null;
  weight?: number | null;
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
  package_material_weight?: number | null;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
  note?: string | null;
};

type RawVnPackage = {
  id: string | number;
  tracking_number_snapshot?: string | null;
  actual_weight?: number | null;
  actual_length?: number | null;
  actual_width?: number | null;
  actual_height?: number | null;
  actual_volume?: number | null;
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
};

type RawSummary = {
  expectedCount: number;
  receivedCount: number;
  inspectedCount: number;
  extraCount: number;
  damagedCount: number;
  missingCount: number;
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
  }
  receipt {
    id
    status
    confirmed_at
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
    receiver_name
    order {
      order_code
      customer {
        name
      }
    }
  }
  receivedPackages {
    id
    tracking_number_snapshot
    actual_weight
    actual_length
    actual_width
    actual_height
    actual_volume
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
  }
  summary {
    expectedCount
    receivedCount
    inspectedCount
    extraCount
    damagedCount
    missingCount
    matched
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
  packages {
    id
    tracking_number
    weight
    receiver_name
    order {
      order_code
      customer {
        name
      }
    }
  }
  vn_batch_receipt {
    id
    status
    confirmed_at
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
      actual_length
      actual_width
      actual_height
      actual_volume
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
}) => {
  const parts: string[] = [];

  if (summary.missingCount > 0) {
    parts.push("Thieu kien");
  }

  if (summary.extraCount > 0) {
    parts.push("Thua kien");
  }

  if (summary.damagedCount > 0) {
    parts.push("Hu hong");
  }

  return parts.length > 0 ? parts.join(", ") : "Khong co loi";
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
    return volume;
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
  status: normalizeStatus(receipt?.status ?? batch.status),
});

const mapExpectedPackage = (item: RawCnPackage): ExpectedBatchPackage => ({
  trackingCode: item.tracking_number ?? "",
  orderCode: item.order?.order_code ?? "",
  customerName: item.order?.customer?.name ?? item.receiver_name ?? "",
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
  length: Number(item.actual_length ?? 0),
  width: Number(item.actual_width ?? 0),
  height: Number(item.actual_height ?? 0),
  extraFeeRmb: Number(item.extra_fee ?? 0),
  declaredValue: Number(item.wooden_fee ?? 0),
  surcharge: Number(item.other_fee ?? 0),
  note: item.note ?? undefined,
});

const mapReceipt = (receipt: RawReceipt | null): VietnamWarehouseReceiptRecord | null => {
  if (!receipt) {
    return null;
  }

  return {
    id: String(receipt.id),
    status: normalizeReceiptStatus(receipt.status),
    confirmedAt: receipt.confirmed_at,
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
        actual_batch_weight: number;
        package_material_weight: number;
        actual_length: number;
        actual_width: number;
        actual_height: number;
        actual_volume: number;
        wooden_fee: number;
        other_fee: number;
        note: string;
      };
    }
  >(mutation, {
    input: {
      batch_code: values.batchCode,
      actual_batch_weight: values.batchWeight,
      package_material_weight: values.packagingWeight,
      actual_length: values.length,
      actual_width: values.width,
      actual_height: values.height,
      actual_volume: Number(((values.length * values.width * values.height) / 1000000).toFixed(3)),
      wooden_fee: values.packagingType === "Đóng gỗ" ? values.packagingWeight : 0,
      other_fee: 0,
      note: values.packagingType,
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
    orderCode?: string;
    customerName?: string;
    extraFeeRmb?: number;
    declaredValue?: number;
    surcharge?: number;
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
        extra_fee: number;
        wooden_fee: number;
        other_fee: number;
        order_code_snapshot?: string;
        customer_name_snapshot?: string;
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
      actual_volume: Number(((values.length * values.width * values.height) / 6000).toFixed(3)),
      extra_fee: values.extraFeeRmb ?? 0,
      wooden_fee: values.declaredValue ?? 0,
      other_fee: values.surcharge ?? 0,
      order_code_snapshot: values.orderCode,
      customer_name_snapshot: values.customerName,
      note: values.note,
      inspection_status: values.inspectionStatus,
    },
  });

  return mapReceiptPayload(response.scanVietnamPackage);
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
  batchWeight: payload.receipt?.actualBatchWeight || payload.batch.totalWeight || 0,
  packagingWeight: payload.receipt?.packageMaterialWeight || 0,
  packagingType: payload.receipt?.note || "Dong go",
  length: payload.receipt?.actualLength || 0,
  width: payload.receipt?.actualWidth || 0,
  height: payload.receipt?.actualHeight || 0,
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

  const listedBatches = batchesWithReceipt.filter((item: RawOverviewBatch) =>
    ["confirmed", "mismatched"].includes(item.vn_batch_receipt?.status ?? ""),
  );

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
