import type {
  BatchInfoFormValues,
  ExpectedBatchPackage,
  ReceivedPackageDraft,
  VietnamWarehouseBatch,
} from "./types";
import dayjs from "dayjs";

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
  originWarehouseName: "Kho Quảng Châu",
  dispatchWeight: 100,
  transportContainerCount: 1,
  packagingType: "Bao tải",
  packageMaterialWeight: 2,
  dispatchLength: 120,
  dispatchWidth: 80,
  dispatchHeight: 90,
  carrierName: "Đơn vị vận chuyển mẫu",
  transportCode: "VC-001",
  status: "pending_check",
};

export const VIETNAM_WAREHOUSE_BATCH_FORM_DEFAULTS: BatchInfoFormValues = {
  batchCode: "QC280523.01",
  actualBatchWeight: 100,
  actualContainerCount: 1,
  outerCondition: "normal",
  receivedAt: dayjs(),
  remeasureDimensions: true,
  length: 120,
  width: 80,
  height: 90,
};

export const EXPECTED_BATCH_PACKAGES: ExpectedBatchPackage[] = [
  ...[
    ["TA130420045706", "ORD-240611-001", "Pham Gia Bao"], ["TA223455885", "ORD-240610-002", "Le Van C"],
    ["TA4577896544", "ORD-240610-003", "Bui Ngoc Mai"], ["TA13042004198", "ORD-240609-004", "Trinh Hai Yen"],
    ["TA8877665544", "ORD-240608-005", "Nguyen Minh Tam"],
  ].map(([trackingCode, orderCode, customerName], index) => ({ id: String(index + 1), trackingCode, orderCode, customerName, cnWeight: 10, length: 50, width: 40, height: 30, items: [] })),
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
    cnWeight: 12.5,
    weightDifference: 0,
    length: 50,
    width: 40,
    height: 30,
    physicalCondition: "normal",
    requiresItemInspection: false,
    itemInspectionStatus: "not_required",
    items: [],
    evidences: [],
    note: "Da kiem day du",
  },
];
