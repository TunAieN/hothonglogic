export const formatVnd = (value) => value === null || value === undefined
  ? "Chưa có dữ liệu"
  : new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);

export const formatDateTime = (value) => {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Thời gian không hợp lệ";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
};

export const orderStatusMap = Object.freeze({
  pending: { label: "Chờ xử lý", tone: "neutral", group: "processing" },
  awaiting_deposit: { label: "Chờ đặt cọc", tone: "warning", group: "payment" },
  deposited: { label: "Đã đặt cọc", tone: "info", group: "processing" },
  purchasing: { label: "Đang mua hàng", tone: "warning", group: "processing" },
  awaiting_tracking: { label: "Chờ shop phát hàng", tone: "info", group: "processing" },
  waiting_cn_warehouse: { label: "Chờ về kho Trung Quốc", tone: "info", group: "shipping" },
  receiving: { label: "Đang tiếp nhận", tone: "info", group: "shipping" },
  shipped: { label: "Đang vận chuyển", tone: "info", group: "shipping" },
  delivered: { label: "Đã giao", tone: "success", group: "complete" },
  completed: { label: "Hoàn tất", tone: "success", group: "complete" },
  complaint: { label: "Khiếu nại", tone: "danger", group: "issue" },
  cancelled: { label: "Đã hủy", tone: "danger", group: "issue" },
});

export const getOrderStatus = (status) => orderStatusMap[status] || { label: status || "Chưa xác định", tone: "neutral", group: "unknown" };
