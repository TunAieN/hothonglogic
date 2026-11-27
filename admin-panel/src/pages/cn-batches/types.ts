import type { Dayjs } from "dayjs";
import type { CnBatch, CnBatchStatus, CnBatchUpdateInput, CnPackage } from "../../shared/types";

export type BatchShippingType = "fast" | "normal";

export type BatchViewModel = {
  id: string;
  batchCode: string;
  originWarehouseName: string;
  receivingWarehouseName: string;
  receivingWarehouseId?: string;
  status: CnBatchStatus;
  shippingType: BatchShippingType;
  totalPackages: number;
  totalWeight: number;
  totalVolume: number;
  packagingType?: "bag" | "carton" | "cardboard" | "wood";
  transportContainerCount?: number;
  actualBatchWeight?: number;
  packageMaterialWeight?: number;
  actualLength?: number;
  actualWidth?: number;
  actualHeight?: number;
  actualVolume?: number;
  carrierName?: string;
  transportCode?: string;
  routeName?: string;
  vehiclePlate?: string;
  driverName?: string;
  driverPhone?: string;
  freightCost?: number;
  handedOverAt?: string;
  dispatchNote?: string;
  departedAt?: string;
  expectedArrivalAt?: string;
  arrivedAt?: string;
  createdAt?: string;
  note?: string;
  packages: CnPackage[];
};

export type BatchDispatchReview = {
  version: string;
  destination_ready: boolean;
  issues: string[];
  packages: { id: string; issues: string[]; warnings: string[] }[];
  destinations: { id: string; name: string; code: string }[];
};

export type BatchFilters = {
  batchCode?: string;
  receivingWarehouseName?: string;
  status?: CnBatchStatus;
  shippingType?: BatchShippingType;
  departedFrom?: Dayjs;
  departedTo?: Dayjs;
};

export type BatchEditFormValues = {
  batchCode: string;
  receivingWarehouseName: string;
  status: CnBatchStatus;
  shippingType: BatchShippingType;
  freightCost?: number;
  totalWeight: number;
  totalVolume: number;
  departedAt: Dayjs;
  expectedArrivalAt: Dayjs;
  note?: string;
  packages: BatchPackageRow[];
};

export type BatchPackageRow = {
  key: string;
  id?: string;
  trackingNumber: string;
  weight?: number;
  height?: number;
  length?: number;
  width?: number;
  volume?: number;
};

export type BatchApiRecord = CnBatch & {
  destination_warehouse_id?: string | null;
  destination_warehouse?: { id: string; name: string } | null;
};
export type BatchUpdateInput = CnBatchUpdateInput;
