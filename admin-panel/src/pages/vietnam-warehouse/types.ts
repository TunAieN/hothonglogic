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
  warehouseId?: string;
  warehouseName?: string;
  handlerId?: string;
  errorType?: string;
  resolutionStatus?: string;
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
  originWarehouseName: string;
  dispatchWeight: number;
  transportContainerCount: number;
  packagingType: string;
  packageMaterialWeight: number;
  dispatchLength: number;
  dispatchWidth: number;
  dispatchHeight: number;
  carrierName: string;
  transportCode: string;
  departedAt?: string | null;
  expectedArrivalAt?: string | null;
  status: VietnamWarehouseStatus;
};

export type ExpectedBatchPackage = {
  id: string;
  trackingCode: string;
  orderCode: string;
  customerName: string;
  cnWeight: number;
  length: number;
  width: number;
  height: number;
  items: PackageItemDetail[];
};

export type PackageItemDetail = {
  orderItemId: string;
  productName: string;
  variant?: string;
  expectedQuantity: number;
  receivedQuantity?: number;
  conditionStatus?: string;
  note?: string;
};

export type BatchInfoFormValues = {
  batchCode: string;
  actualBatchWeight: number;
  actualContainerCount: number;
  outerCondition: string;
  receivedAt: Dayjs;
  remeasureDimensions?: boolean;
  length?: number;
  width?: number;
  height?: number;
  note?: string;
};

export type ReceivePackageFormValues = {
  trackingCode: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  physicalCondition: string;
  requiresItemInspection?: boolean;
  exceptionReason?: string;
  note?: string;
};

export type PackageEvidence = {
  id: string;
  type: "reconciliation" | "inspection" | "resolution" | "document";
  url: string;
  thumbnailUrl?: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt?: string;
  createdBy?: string;
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
  cnWeight: number;
  weightDifference: number;
  length: number;
  width: number;
  height: number;
  physicalCondition: string;
  requiresItemInspection: boolean;
  itemInspectionStatus: string;
  items: PackageItemDetail[];
  evidences: PackageEvidence[];
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

export type VietnamWarehousePackageListItem = {
  id: string;
  receiptId?: string;
  trackingCode: string;
  orderCode: string;
  batchCode: string;
  customerName: string;
  warehouseName: string;
  handlerName: string;
  resolverName?: string;
  cnWeight: number;
  actualWeight: number;
  weightDifference: number;
  length: number;
  width: number;
  height: number;
  physicalCondition: string;
  itemInspectionStatus: string;
  requiresItemInspection: boolean;
  inspectionStatus: string;
  errorType: string;
  errorResolutionStatus?: string;
  exceptionReason?: string;
  resolutionNote?: string;
  resolutionAction?: string;
  resolutionResult?: string;
  expectedCompletionAt?: string;
  note?: string;
  scannedAt?: string;
  errorDetectedAt?: string;
  errorResolvedAt?: string;
  receivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  items: PackageItemDetail[];
  evidences: PackageEvidence[];
};

export type VietnamPackageErrorUpdateInput = {
  resolutionStatus: "pending" | "verifying" | "processing" | "rejected";
  resolutionAction?: string;
  resolutionResult?: string;
  expectedCompletionAt?: string;
  note?: string;
};

export type VietnamWarehousePackagePage = {
  items: VietnamWarehousePackageListItem[];
  total: number;
  currentPage: number;
  lastPage: number;
  perPage: number;
};

export type VietnamWarehouseReceiptRecord = {
  id: string;
  status: VietnamWarehouseReceiptStatus;
  confirmedAt?: string | null;
  actualBatchWeight?: number;
  actualContainerCount?: number;
  outerCondition?: string;
  batchWeightDifference?: number;
  requiresResolution?: boolean;
  receivedAt?: string | null;
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
