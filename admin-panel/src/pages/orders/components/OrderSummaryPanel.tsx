import { Badge, Button, Card, Space, Typography } from "antd";
import { CheckCircleOutlined, SaveOutlined } from "@ant-design/icons";

const { Text } = Typography;

type OrderSummaryPanelProps = {
  orderReference: string;
  totalAmount: number;
  statusLabel: string;
  isSaving: boolean;
  isConfirming: boolean;
  isEditable: boolean;
  onConfirm: () => void;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export const OrderSummaryPanel = ({
  orderReference,
  totalAmount,
  statusLabel,
  isSaving,
  isConfirming,
  isEditable,
  onConfirm,
}: OrderSummaryPanelProps) => (
  <Card className="order-edit-summary-card" bordered={false}>
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div>
        <Text className="order-edit-summary-kicker">Final Submission</Text>
      </div>

      <div className="order-edit-summary-row">
        <Text>Order Reference</Text>
        <Text strong>{orderReference}</Text>
      </div>
      <div className="order-edit-summary-row">
        <Text>Value (RMB)</Text>
        <Text strong>{formatCurrency(totalAmount)} ¥</Text>
      </div>
      <div className="order-edit-summary-row">
        <Text>Status</Text>
        <Badge
          color="#12a150"
          text={<span className="order-edit-live-badge">LIVE SYNC: {statusLabel}</span>}
        />
      </div>

      <Button
        className="order-edit-confirm-button"
        icon={<CheckCircleOutlined />}
        disabled={!isEditable}
        loading={isConfirming}
        onClick={onConfirm}
        type="primary"
      >
        Xác nhận đơn hàng
      </Button>
      <Button
        className="order-edit-update-button"
        disabled={!isEditable}
        form="order-edit-form"
        htmlType="submit"
        icon={<SaveOutlined />}
        loading={isSaving}
      >
        Cập nhật
      </Button>
    </Space>
  </Card>
);
