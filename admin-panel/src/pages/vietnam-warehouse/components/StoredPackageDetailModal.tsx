import { Descriptions, Modal, Space, Table, Tag, Timeline, Typography } from "antd";
import dayjs from "dayjs";
import type { VietnamWarehousePackageListItem } from "../types";

const { Text } = Typography;
const conditionLabels: Record<string, string> = { normal: "Nguyên vẹn", dented: "Móp", torn: "Rách", wet: "Ướt", broken: "Vỡ/hỏng", opened: "Đã mở", other: "Khác" };
const formatDateTime = (value?: string) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—";

type Props = { open: boolean; loading?: boolean; item: VietnamWarehousePackageListItem | null; onClose: () => void };

export const StoredPackageDetailModal = ({ open, loading, item, onClose }: Props) => (
  <Modal title="Chi tiết kiện đã nhập kho" open={open} onCancel={onClose} footer={null} width={980} loading={loading}>
    {item ? <Space orientation="vertical" size={18} style={{ width: "100%" }}>
      <Descriptions title="Thông tin cơ bản" bordered size="small" column={3}>
        <Descriptions.Item label="Mã vận đơn"><Text copyable strong>{item.trackingCode}</Text></Descriptions.Item>
        <Descriptions.Item label="Mã đơn hàng">{item.orderCode || "—"}</Descriptions.Item>
        <Descriptions.Item label="Mã lô hàng">{item.batchCode}</Descriptions.Item>
        <Descriptions.Item label="Khách hàng">{item.customerName}</Descriptions.Item>
        <Descriptions.Item label="Kho nhận">{item.warehouseName}</Descriptions.Item>
        <Descriptions.Item label="Người xử lý">{item.handlerName}</Descriptions.Item>
        <Descriptions.Item label="Ngày nhập kho">{formatDateTime(item.receivedAt)}</Descriptions.Item>
      </Descriptions>
      <Descriptions title="Đối soát" bordered size="small" column={3}>
        <Descriptions.Item label="Khối lượng kho TQ">{item.cnWeight.toFixed(2)} kg</Descriptions.Item>
        <Descriptions.Item label="Khối lượng kho VN">{item.actualWeight.toFixed(2)} kg</Descriptions.Item>
        <Descriptions.Item label="Chênh lệch">{item.weightDifference > 0 ? "+" : ""}{item.weightDifference.toFixed(2)} kg</Descriptions.Item>
        <Descriptions.Item label="Kích thước">{item.length} × {item.width} × {item.height} cm</Descriptions.Item>
        <Descriptions.Item label="Tình trạng ngoài">{conditionLabels[item.physicalCondition] ?? item.physicalCondition}</Descriptions.Item>
        <Descriptions.Item label="Kiểm item">{item.itemInspectionStatus === "completed" ? "Đã kiểm" : "Không kiểm"}</Descriptions.Item>
        <Descriptions.Item label="Kết quả"><Tag color="green">Đã khớp · Đã nhập kho</Tag></Descriptions.Item>
      </Descriptions>
      {item.items.length ? <Table size="small" pagination={false} rowKey="orderItemId" dataSource={item.items} columns={[
        { title: "Item", dataIndex: "productName" }, { title: "Phân loại", dataIndex: "variant" },
        { title: "SL dự kiến", dataIndex: "expectedQuantity" }, { title: "SL thực nhận", dataIndex: "receivedQuantity", render: (value, row) => value ?? row.expectedQuantity },
        { title: "Tình trạng", dataIndex: "conditionStatus", render: (value) => conditionLabels[value] ?? value ?? "Nguyên vẹn" },
      ]} /> : null}
      <Descriptions title="Ghi chú" bordered size="small" column={1}>
        <Descriptions.Item label="Ghi chú kho VN">{item.note || "Không có"}</Descriptions.Item>
        <Descriptions.Item label="Lý do bất thường">{item.exceptionReason || "Không có"}</Descriptions.Item>
      </Descriptions>
      <div><Text strong>Lịch sử</Text><Timeline style={{ marginTop: 14 }} items={[
        { color: "blue", children: <>Quét kiện<br/><Text type="secondary">{formatDateTime(item.scannedAt)}</Text></> },
        ...(item.itemInspectionStatus === "completed" ? [{ color: "gold", children: <>Đối soát item hoàn tất<br/><Text type="secondary">{formatDateTime(item.errorResolvedAt ?? item.updatedAt)}</Text></> }] : []),
        { color: "green", children: <>Xác nhận nhập kho<br/><Text type="secondary">{formatDateTime(item.receivedAt)}</Text></> },
      ]} /></div>
    </Space> : null}
  </Modal>
);
