import type { Dayjs } from "dayjs";
import type { CnBatch, CnBatchStatus, CnBatchUpdateInput, CnPackage } from "../../types";

export type BatchShippingType = "fast" | "normal";

export type BatchViewModel = {
  id: string;
  batchCode: string;
  originWarehouseName: string;
  receivingWarehouseName: string;
  status: CnBatchStatus;
  shippingType: BatchShippingType;
  totalPackages: number;
  totalWeight: number;
  totalVolume: number;
  departedAt?: string;
  expectedArrivalAt?: string;
  arrivedAt?: string;
  createdAt?: string;
  note?: string;
  packages: CnPackage[];
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

export type BatchApiRecord = CnBatch;
export type BatchUpdateInput = CnBatchUpdateInput;
