/* eslint-disable react-refresh/only-export-components */
import { Tag } from "antd";

export const formatVnd = (value?: number | null) =>
  `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value ?? 0)} VND`;

export const formatWeight = (value?: number | null) =>
  `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value ?? 0)} kg`;

export const taskStatusLabels: Record<string, string> = {
  created: "Đã tạo",
  preparing: "Đang chuẩn bị",
  in_transit: "Đang giao",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  pending: "Đã tạo",
  delivered: "Hoàn thành",
  returned: "Hoàn trả",
};

export const ShippingStatusTag = ({ status }: { status: string }) => {
  return <Tag bordered={false} className={`shipping-status-pill shipping-status-pill--${status}`}>
    {taskStatusLabels[status] ?? status}
  </Tag>;
};
