import type { Dayjs } from "dayjs";
import type {
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
  receiverUserId?: string;
  trackingCode: string;
  originalTrackingNumber?: string | null;
  receivedDate: string;
  receivedAt?: string;
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
  receiptConfirmed?: boolean;
  trackingCode: string;
  receiverUserId?: string;
  warehouseId?: string;
  weight: number;
  actualLength?: number;
  actualWidth?: number;
  actualHeight?: number;
  packageCondition?: string;
  receivedDate: Dayjs;
  status: PackageMatchStatus;
  note?: string;
};

export type TrackingValidation = {
  valid: boolean;
  matched: boolean;
  message?: string | null;
  existing_package_id?: string | null;
  order_code?: string | null;
  purchase_orders?: Array<{ id: string; external_order_code: string; shop_name?: string | null }> | null;
};

export type ChinaWarehouseReceivingOptions = {
  warehouses: Array<{ id: string; code: string; name: string; address?: string | null; status: string }>;
  receivers: Array<{
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    department?: string | null;
    status: string;
    role?: { id: string; key?: string | null; name: string; description?: string | null; permissions?: string[] | null } | null;
  }>;
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
