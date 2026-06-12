import type { Dayjs } from "dayjs";

export type VietnamWarehouseStatus =
  | "pending_check"
  | "mismatched"
  | "checked"
  | "missing"
  | "extra"
  | "damaged"
  | "arrived_vn";

export type VietnamWarehouseReceiptStatus =
  | "draft"
  | "checking"
  | "matched"
  | "mismatched"
  | "confirmed"
  | "cancelled";

export type VietnamWarehouseFilterValues = {
  batchCode?: string;
  status?: VietnamWarehouseStatus;
  trackingCode?: string;
  customerName?: string;
  receivedFrom?: Dayjs;
  receivedTo?: Dayjs;
  receiverName?: string;
};

export type VietnamWarehouseTableItem = {
  id: string;
  receiptId?: string;
  receiptStatus?: VietnamWarehouseReceiptStatus;
  receivedDate: string;
  handlerName: string;
  batchCode: string;
  warehouseName: string;
  totalPackages: number;
  receivedCount: number;
  missingCount: number;
  extraCount: number;
  damagedCount: number;
  status: VietnamWarehouseStatus;
  errorStatusLabel: string;
  processingStatusLabel: string;
  receiverName: string;
  trackingCode: string;
  customerName: string;
};

export type VietnamWarehouseBatch = {
  id: string;
  batchCode: string;
  destinationWarehouseName: string;
  totalPackages: number;
  totalWeight: number;
  status: VietnamWarehouseStatus;
};

export type ExpectedBatchPackage = {
  trackingCode: string;
  orderCode: string;
  customerName: string;
};

export type BatchInfoFormValues = {
  batchCode: string;
  batchWeight: number;
  packagingWeight: number;
  packagingType: string;
  length: number;
  width: number;
  height: number;
};

export type ReceivePackageFormValues = {
  trackingCode: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  orderCode: string;
  customerName: string;
  extraFeeRmb: number;
  declaredValue: number;
  surcharge: number;
  note?: string;
};

export type ReceivedPackageDraft = {
  id: string;
  receiptPackageId?: string;
  trackingCode: string;
  orderCode: string;
  customerName: string;
  volumetricWeight: number;
  status: Extract<VietnamWarehouseStatus, "checked" | "missing" | "extra" | "damaged" | "mismatched">;
  weight: number;
  length: number;
  width: number;
  height: number;
  extraFeeRmb: number;
  declaredValue: number;
  surcharge: number;
  note?: string;
};

export type ComparisonSummary = {
  importedCount: number;
  expectedCount: number;
  matchedCount: number;
  missingCount: number;
  extraCount: number;
  missingTrackingCodes: string[];
};

export type ReceiveBatchSubmitPayload = {
  batch: VietnamWarehouseBatch;
  receivedPackages: ReceivedPackageDraft[];
};

export type VietnamWarehouseStats = {
  totalBatches: number;
  importedBatches: number;
  pendingCheckBatches: number;
  discrepancyBatches: number;
};

export type VietnamWarehouseReceiptSummary = {
  expectedCount: number;
  receivedCount: number;
  inspectedCount: number;
  extraCount: number;
  damagedCount: number;
  missingCount: number;
  matched: boolean;
};

export type VietnamWarehouseReceiptRecord = {
  id: string;
  status: VietnamWarehouseReceiptStatus;
  confirmedAt?: string | null;
  actualBatchWeight?: number;
  packageMaterialWeight?: number;
  actualLength?: number;
  actualWidth?: number;
  actualHeight?: number;
  note?: string | null;
  totalExpectedPackages: number;
  totalReceivedPackages: number;
  totalInspectedPackages: number;
  totalMissingPackages: number;
  totalExtraPackages: number;
  totalDamagedPackages: number;
};

export type VietnamWarehouseReceiptData = {
  batch: VietnamWarehouseBatch;
  receipt: VietnamWarehouseReceiptRecord | null;
  expectedPackages: ExpectedBatchPackage[];
  receivedPackages: ReceivedPackageDraft[];
  summary: VietnamWarehouseReceiptSummary;
};
