export type EmployeeStatus = "active" | "locked" | "inactive";

export type EmployeeRole =
  | "admin"
  | "staff"
  | "accountant"
  | "customer_service"
  | "warehouse_staff";

export type Department =
  | "sales"
  | "customer_service"
  | "china_warehouse"
  | "vietnam_warehouse"
  | "accounting"
  | "administration";

export interface Employee {
  id: string;
  code: string;
  fullName: string;
  email: string;
  phone: string;
  department: Department;
  role: EmployeeRole;
  status: EmployeeStatus;
  createdAt: string;
  note?: string;
  temporaryPassword?: string;
  avatar?: string;
}
export type EmployeeApiStatus = "active" | "inactive";

export interface EmployeeRecord {
  id: string;
  name: string;
  email: string;
  role_id?: string | number | null;
  role?: import("./common").Role | null;
  phone?: string | null;
  address?: string | null;
  status?: EmployeeApiStatus | string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface EmployeeCreateInput {
  name: string;
  email: string;
  password: string;
  role_id: string | number;
  phone?: string | null;
  address?: string | null;
  status?: EmployeeApiStatus | string | null;
}

export interface EmployeeUpdateInput {
  name: string;
  email: string;
  password?: string | null;
  role_id: string | number;
  phone?: string | null;
  address?: string | null;
  status: EmployeeApiStatus | string;
}