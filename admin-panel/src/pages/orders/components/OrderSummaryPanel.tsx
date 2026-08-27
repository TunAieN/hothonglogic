import { Badge, Button, Card, Space, Typography } from "antd";
import { CheckCircleOutlined, SaveOutlined } from "@ant-design/icons";
import { formatCny } from "../../../shared/utils/currency";

const { Text } = Typography;

type OrderSummaryPanelProps = {
  orderReference: string;
  totalAmount: number;
  statusLabel: string;
  isSaving: boolean;
  isConfirming: boolean;
  canSave: boolean;
  canConfirm?: boolean;
  saveLabel?: string;
  onConfirm?: () => void;
};


export const OrderSummaryPanel = ({
  orderReference,
  totalAmount,
  statusLabel,
  isSaving,
  isConfirming,
  canSave,
  canConfirm = false,
  saveLabel = "Cập nhật",
  onConfirm,
}: OrderSummaryPanelProps) => (
  <Card className="order-edit-summary-card" variant="borderless">
    <Space orientation="vertical" size={24} style={{ width: "100%" }}>
      <div>
        <Text className="order-edit-summary-kicker">Tóm tắt đơn hàng</Text>
      </div>

      <div className="order-edit-summary-row">
        <Text>Mã đơn hàng</Text>
        <Text strong>{orderReference}</Text>
      </div>
      <div className="order-edit-summary-row">
        <Text>Tổng tiền hàng (CNY)</Text>
        <Text strong>{formatCny(totalAmount)}</Text>
      </div>
      <div className="order-edit-summary-row">
        <Text>Trạng thái</Text>
        <Badge
          color="#12a150"
          text={<span className="order-edit-live-badge">LIVE SYNC: {statusLabel}</span>}
        />
      </div>

      {canConfirm && onConfirm ? (
        <Button
          className="order-edit-confirm-button"
          icon={<CheckCircleOutlined />}
          loading={isConfirming}
          onClick={onConfirm}
          type="primary"
        >
          Xác nhận đơn hàng
        </Button>
      ) : null}
      <Button
        className="order-edit-update-button"
        disabled={!canSave}
        form="order-edit-form"
        htmlType="submit"
        icon={<SaveOutlined />}
        loading={isSaving}
      >
        {saveLabel}
      </Button>
    </Space>
  </Card>
);
