import type {
  BatchInfoFormValues,
  ExpectedBatchPackage,
  ReceivedPackageDraft,
  VietnamWarehouseBatch,
} from "./types";

export const VIETNAM_WAREHOUSE_STATS = {
  totalBatches: 128,
  importedBatches: 102,
  pendingCheckBatches: 18,
  discrepancyBatches: 8,
};

export const VIETNAM_WAREHOUSE_BATCH: VietnamWarehouseBatch = {
  id: "batch-1",
  batchCode: "QC280523.01",
  destinationWarehouseName: "Kho Ha Noi",
  totalPackages: 5,
  totalWeight: 100,
  status: "pending_check",
};

export const VIETNAM_WAREHOUSE_BATCH_FORM_DEFAULTS: BatchInfoFormValues = {
  batchCode: "QC280523.01",
  batchWeight: 100,
  packagingWeight: 2,
  packagingType: "Dong go",
  length: 120,
  width: 80,
  height: 90,
};

export const EXPECTED_BATCH_PACKAGES: ExpectedBatchPackage[] = [
  { trackingCode: "TA130420045706", orderCode: "ORD-240611-001", customerName: "Pham Gia Bao" },
  { trackingCode: "TA223455885", orderCode: "ORD-240610-002", customerName: "Le Van C" },
  { trackingCode: "TA4577896544", orderCode: "ORD-240610-003", customerName: "Bui Ngoc Mai" },
  { trackingCode: "TA13042004198", orderCode: "ORD-240609-004", customerName: "Trinh Hai Yen" },
  { trackingCode: "TA8877665544", orderCode: "ORD-240608-005", customerName: "Nguyen Minh Tam" },
];

export const INITIAL_RECEIVED_PACKAGES: ReceivedPackageDraft[] = [
  {
    id: "received-1",
    trackingCode: "TA130420045706",
    orderCode: "ORD-240611-001",
    customerName: "Pham Gia Bao",
    volumetricWeight: 12.5,
    status: "checked",
    weight: 12.5,
    length: 50,
    width: 40,
    height: 30,
    extraFeeRmb: 0,
    declaredValue: 800,
    surcharge: 0,
    note: "Da kiem day du",
  },
];
