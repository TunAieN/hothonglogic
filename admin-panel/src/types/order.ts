import type { User } from "./common";
import type { Customer } from "./customer";

export type OrderStatus = "pending" | "shipped" | "delivered" | "cancelled";

export interface OrderItem {
  id: string;
  product_name: string;
  product_link?: string | null;
  price_cny: number;
  quantity: number;
  note?: string | null;
  product_image?: string | null;
}

export interface OrderItemInput {
  product_name: string;
  product_link?: string | null;
  price_cny: number;
  quantity: number;
  note?: string | null;
  product_image?: string | null;
}

export interface OrderSummary {
  id: string;
  order_code: string;
  customer_id?: string;
  customer: Pick<Customer, "id" | "name" | "email" | "phone" | "address" | "avatar">;
  creator: Pick<User, "id" | "name">;
  status: OrderStatus | string;
  total_amount: number;
  created_at: string;
  items: OrderItem[];
}

export interface Order extends OrderSummary {
  customer: Customer;
  creator: Pick<User, "id" | "name">;
  items: OrderItem[];
}

export interface OrderCreateInput {
  customer_id: string;
  items: OrderItemInput[];
}

export interface OrderUpdateInput {
  customer_id?: string;
  items?: OrderItemInput[];
  status?: OrderStatus | string;
}
