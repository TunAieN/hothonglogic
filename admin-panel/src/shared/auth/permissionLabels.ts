export const PERMISSION_GROUP_LABELS: Record<string, string> = {
  customers: "Khách hàng",
  orders: "Đơn hàng",
  employees: "Nhân viên",
  roles: "Vai trò",
  cn_packages: "Kiện hàng Trung Quốc",
  cn_batches: "Lô hàng Trung Quốc",
  vn_warehouse: "Kho Việt Nam",
  payment_vouchers: "Phiếu thanh toán",
  payments: "Thanh toán",
  invoices: "Hóa đơn",
  shipping_rates: "Bảng giá vận chuyển",
  exchange_rates: "Tỷ giá",
  revenue_report: "Báo cáo doanh thu",
  shipping_queue: "Hàng chờ xuất",
  shipping_tasks: "Nhiệm vụ xuất hàng",
  export_slips: "Phiếu xuất hàng",
  audit_logs: "Nhật ký hệ thống",
  settings: "Cấu hình",
};

const ACTION_LABELS: Record<string, string> = {
  read: "Xem",
  create: "Thêm",
  update: "Cập nhật",
  delete: "Xóa",
  inspect: "Kiểm tra",
  dispatch: "Xuất lô",
  receive: "Tiếp nhận",
  scan: "Scan",
  resolve_discrepancy: "Xử lý sai lệch",
  confirm: "Xác nhận",
  complete: "Hoàn thành",
};

export const getPermissionLabel = (permission: string): string => {
  if (permission === "all") {
    return "Toàn quyền hệ thống";
  }

  const separator = permission.lastIndexOf(".");
  const group = separator >= 0 ? permission.slice(0, separator) : permission;
  const action = separator >= 0 ? permission.slice(separator + 1) : "";
  const groupLabel = PERMISSION_GROUP_LABELS[group] ?? "Chức năng hệ thống";
  const actionLabel = ACTION_LABELS[action] ?? "Thao tác";

  return `${actionLabel} ${groupLabel.toLocaleLowerCase("vi")}`;
};

export const groupPermissions = (permissions: string[]) => {
  const groups = new Map<string, string[]>();

  permissions.forEach((permission) => {
    const separator = permission.lastIndexOf(".");
    const key = permission === "all" ? "all" : permission.slice(0, separator);
    const current = groups.get(key) ?? [];
    current.push(permission);
    groups.set(key, current);
  });

  return Array.from(groups, ([key, items]) => ({
    key,
    label: key === "all" ? "Quản trị hệ thống" : (PERMISSION_GROUP_LABELS[key] ?? "Khác"),
    permissions: items,
  }));
};
