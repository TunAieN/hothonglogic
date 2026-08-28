export type EmployeeStatus = "active" | "locked" | "inactive";

export type EmployeeRole =
  | "admin"
  | "sales_staff"
  | "accountant"
  | "customer_service"
  | "china_warehouse_staff"
  | "vietnam_warehouse_staff"
  | "shipping_staff";

export type Department =
  | "sales"
  | "customer_service"
  | "china_warehouse"
  | "vietnam_warehouse"
  | "accounting"
  | "administration"
  | "shipping";

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
export type EmployeeApiStatus = EmployeeStatus;
export type EmployeeGender = "male" | "female" | "other";

export interface EmployeeManager {
  id: string;
  name: string;
  role?: import("./common").Role | null;
}

export interface EmployeeStatisticItem {
  key: string;
  label: string;
  value: string;
  suffix?: string | null;
}

export interface EmployeeActivity {
  id: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  created_at: string;
}

export interface EmployeeRecord {
  id: string;
  name: string;
  email: string;
  role_id?: string | number | null;
  role?: import("./common").Role | null;
  phone?: string | null;
  address?: string | null;
  birthday?: string | null;
  gender?: EmployeeGender | null;
  note?: string | null;
  department?: Department | null;
  joined_at?: string | null;
  manager_id?: string | number | null;
  manager?: EmployeeManager | null;
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
  birthday?: string | null;
  gender?: EmployeeGender | null;
  note?: string | null;
  department: Department;
  joined_at?: string | null;
  manager_id?: string | number | null;
  status?: EmployeeApiStatus | string | null;
}

export interface EmployeeUpdateInput {
  name: string;
  email: string;
  password?: string | null;
  role_id: string | number;
  phone?: string | null;
  address?: string | null;
  birthday?: string | null;
  gender?: EmployeeGender | null;
  note?: string | null;
  department: Department;
  joined_at?: string | null;
  manager_id?: string | number | null;
  status: EmployeeApiStatus | string;
}
