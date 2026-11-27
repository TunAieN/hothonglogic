import type { OrderSummary } from "./order";

export type CustomerStatus = "active" | "inactive" | "blocked";

export interface Customer {
  id: string;
  code?: string;
  name: string;
  vip_group?: string | null;
  vip_qualified_spend_vnd?: number;
  next_vip_tier_name?: string | null;
  next_vip_threshold_vnd?: number | null;
  vip_progress_percent?: number;
  vipTier?: {
    id: string; code: string; name: string; priority: number; minimum_spend_vnd: number;
    base_deposit_percent?: number | null; credit_limit_vnd?: number | null;
    deposit_policy_enabled: boolean; is_default: boolean; is_active: boolean;
  } | null;
  vipHistories?: Array<{
    id: string; change_type: string; qualified_spend_vnd: number; reason: string; created_at: string;
    fromTier?: { id: string; name: string } | null; toTier?: { id: string; name: string } | null;
  }>;
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
