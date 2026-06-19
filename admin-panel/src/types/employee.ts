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
