import type { Dayjs } from "dayjs";
import type {
  CnBatch,
  CnBatchStatus,
  CnPackage,
  CnPackageItem,
  CnPackageCreateInput,
  CnPackageUpdateInput,
  OrderItem,
} from "../../shared/types";

export type PackageMatchStatus = "matched" | "unmatched";

export type ChinaWarehousePackage = {
  id: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName: string;
  orderId?: string;
  orderTrackingId?: string;
  receiverName: string;
  trackingCode: string;
  receivedDate: string;
  weight: number;
  actualLength?: number;
  actualWidth?: number;
  actualHeight?: number;
  volume?: number;
  volumetricWeight?: number;
  chargeableWeight?: number;
  packageCondition?: string;
  declaredValue?: number;
  carrier?: string;
  customerName?: string;
  invoiceCode?: string;
  orderItems: OrderItem[];
  packageItems: CnPackageItem[];
  confirmedItemCount: number;
  batchCode?: string;
  batchId?: string;
  batchStatus?: CnBatchStatus;
  status: PackageMatchStatus;
  note?: string;
  isImportedToVietnam?: boolean;
};

export type PackageFormValues = {
  trackingCode: string;
  receiverName: string;
  warehouseName: string;
  weight: number;
  actualLength?: number;
  actualWidth?: number;
  actualHeight?: number;
  packageCondition?: string;
  receivedDate: Dayjs;
  status: PackageMatchStatus;
  note?: string;
};

export type ChinaWarehouseFilters = {
  warehouseName?: string;
  trackingCode?: string;
  receiverName?: string;
  status?: PackageMatchStatus;
  receivedFrom?: Dayjs;
  receivedTo?: Dayjs;
};

export type ChinaWarehouseApiRecord = CnPackage;
export type ChinaWarehouseCreateInput = CnPackageCreateInput;
export type ChinaWarehouseUpdateInput = CnPackageUpdateInput;
export type ChinaWarehouseBatchRecord = CnBatch;

export type BatchMode = "create" | "existing";

export type BatchModalFormValues = {
  batchMode: BatchMode;
  cnBatchId?: string;
  shippingType?: "fast" | "normal";
  destinationWarehouseName?: string;
  expectedArrivalAt?: Dayjs;
  note?: string;
};
