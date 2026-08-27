import type { OrderSummary } from "./order";

export type CustomerStatus = "active" | "inactive" | "blocked";

export interface Customer {
  id: string;
  code?: string;
  name: string;
  vip_group?: string | null;
  phone: string;
  email: string;
  avatar?: string;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  address: string;
  note?: string | null;
  status: CustomerStatus;
  created_at: string;
  orders: OrderSummary[];
  orders_count: number;
}

export interface CustomerCreateInput {
  code: string;
  name: string;
  vip_group?: string | null;
  phone: string;
  email?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  address?: string | null;
  note?: string | null;
}

export interface CustomerUpdateInput extends Partial<CustomerCreateInput> {
  status?: CustomerStatus | string | null;
}
