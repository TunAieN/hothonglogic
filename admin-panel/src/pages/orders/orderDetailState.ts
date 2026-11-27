export type OrderPrimaryAction = {
  enabled: boolean;
  label: string;
};

export const getOrderPrimaryAction = (status?: string | null): OrderPrimaryAction => {
  switch (status?.toLowerCase()) {
    case "pending":
      return { enabled: true, label: "Xác nhận đơn hàng" };
    case "awaiting_deposit":
      return { enabled: true, label: "Theo dõi thanh toán đặt cọc" };
    case "deposited":
      return { enabled: true, label: "Bắt đầu đặt hàng" };
    case "purchasing":
      return { enabled: true, label: "Xác nhận đã đặt hàng" };
    case "awaiting_tracking":
    case "waiting_cn_warehouse":
      return { enabled: true, label: "Quản lý mã vận đơn" };
    case "receiving":
    case "shipped":
    case "delivered":
      return { enabled: false, label: "Đang xử lý vận chuyển" };
    case "completed":
      return { enabled: false, label: "Đơn hàng đã hoàn thành" };
    case "cancelled":
    case "rejected":
      return { enabled: false, label: "Đơn hàng đã hủy" };
    case "complaint":
      return { enabled: false, label: "Đang xử lý khiếu nại" };
    default:
      return { enabled: false, label: "Không có thao tác phù hợp" };
  }
};
