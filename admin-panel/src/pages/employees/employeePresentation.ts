import type { Department, EmployeeStatus } from "../../shared/types/employee";

export const DEPARTMENT_LABELS: Record<Department, string> = {
  administration: "Phòng Quản trị",
  sales: "Phòng Kinh doanh",
  customer_service: "Phòng Chăm sóc khách hàng",
  china_warehouse: "Kho Trung Quốc",
  vietnam_warehouse: "Kho Việt Nam",
  accounting: "Phòng Kế toán",
  shipping: "Bộ phận Xuất hàng",
};

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Đang hoạt động",
  locked: "Tạm khóa",
  inactive: "Nghỉ việc",
};

export const GENDER_LABELS: Record<string, string> = {
  male: "Nam",
  female: "Nữ",
  other: "Khác",
};

export const getEmployeeCode = (id: string | number): string => {
  const numericId = Number(id);
  return Number.isFinite(numericId) ? `NV${String(numericId).padStart(3, "0")}` : `NV${id}`;
};

export const getEmployeeInitials = (name: string): string => name
  .trim()
  .split(/\s+/)
  .slice(-2)
  .map((part) => part.charAt(0).toUpperCase())
  .join("") || "NV";
