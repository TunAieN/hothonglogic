import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ChinaWarehousePackage } from "../types";

const { Text } = Typography;

type SelectionRow = {
  orderItemId: string;
  productName: string;
  variant: string;
  orderedQuantity: number;
  shopLabel: string;
  checked: boolean;
  quantity: number;
};

type Props = {
  open: boolean;
  loading?: boolean;
  packageRecord: ChinaWarehousePackage | null;
  onCancel: () => void;
  onSubmit: (items: Array<{ order_item_id: string; quantity: number }>) => Promise<void>;
};

const getVariantLabel = (color?: string | null, size?: string | null) =>
  [color, size].filter(Boolean).join(" / ") || "-";

export const ConfirmPackageItemsModal = ({
  open,
  loading,
  packageRecord,
  onCancel,
  onSubmit,
}: Props) => {
  const [rows, setRows] = useState<SelectionRow[]>([]);

  useEffect(() => {
    if (!open || !packageRecord) {
      return;
    }

    setRows(
      packageRecord.orderItems.map((item) => {
        const confirmed = packageRecord.packageItems.find(
          (packageItem) => String(packageItem.order_item_id) === String(item.id),
        );

        return {
          orderItemId: String(item.id),
          productName: item.product_name,
          variant: getVariantLabel(item.color, item.size),
          orderedQuantity: Number(item.quantity),
          shopLabel: item.shop_name ?? item.seller ?? "-",
          checked: Boolean(confirmed),
          quantity: Number(confirmed?.quantity ?? 1),
        };
      }),
    );
  }, [open, packageRecord]);

  const selectedCount = useMemo(
    () => rows.filter((row) => row.checked).length,
    [rows],
  );

  const columns: ColumnsType<SelectionRow> = [
    {
      title: "Chọn",
      key: "checked",
      width: 70,
      render: (_, row) => (
        <Checkbox
          checked={row.checked}
          onChange={(event) =>
            setRows((current) =>
              current.map((item) =>
                item.orderItemId === row.orderItemId
                  ? { ...item, checked: event.target.checked }
                  : item,
              ),
            )
          }
        />
      ),
    },
    {
      title: "Sản phẩm",
      dataIndex: "productName",
      key: "productName",
    },
    {
      title: "Shop",
      dataIndex: "shopLabel",
      key: "shopLabel",
      width: 160,
    },
    {
      title: "Phân loại",
      dataIndex: "variant",
      key: "variant",
      width: 140,
    },
    {
      title: "SL đặt",
      dataIndex: "orderedQuantity",
      key: "orderedQuantity",
      width: 90,
      align: "center",
    },
    {
      title: "SL trong kiện",
      key: "quantity",
      width: 140,
      render: (_, row) => (
        <InputNumber
          min={1}
          max={Math.max(row.orderedQuantity, 1)}
          value={row.quantity}
          disabled={!row.checked}
          onChange={(value) =>
            setRows((current) =>
              current.map((item) =>
                item.orderItemId === row.orderItemId
                  ? {
                      ...item,
                      quantity: Math.max(1, Math.min(Number(value ?? 1), item.orderedQuantity)),
                    }
                  : item,
              ),
            )
          }
        />
      ),
    },
  ];

  const handleSubmit = async () => {
    const items = rows
      .filter((row) => row.checked)
      .map((row) => ({
        order_item_id: row.orderItemId,
        quantity: row.quantity,
      }));

    await onSubmit(items);
  };

  return (
    <Modal
      title={`Xác nhận item trong kiện - ${packageRecord?.trackingCode ?? ""}`}
      open={open}
      onCancel={onCancel}
      width={980}
      destroyOnClose
      footer={
        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
          <Button onClick={onCancel}>Hủy</Button>
          <Button
            type="primary"
            loading={loading}
            disabled={!packageRecord || packageRecord.orderItems.length === 0 || selectedCount === 0}
            onClick={() => void handleSubmit()}
          >
            Lưu xác nhận
          </Button>
        </Space>
      }
    >
      {!packageRecord?.orderId ? (
        <Alert
          type="warning"
          showIcon
          message="Mã vận đơn này chưa khớp với đơn hàng trên hệ thống."
        />
      ) : packageRecord.orderItems.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          message="Đơn hàng này chưa có item để đối chiếu."
        />
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Space wrap>
            <Tag color="blue">Đơn: {packageRecord.invoiceCode ?? "-"}</Tag>
            <Tag color="gold">KH: {packageRecord.customerName ?? "-"}</Tag>
            <Tag color="green">Đã chọn {selectedCount} item</Tag>
          </Space>
          <Text type="secondary">
            Kho Trung Quốc xác nhận item thực tế có trong kiện này. Chỉ chọn item thuộc chính đơn hàng của tracking.
          </Text>
          <Table<SelectionRow>
            rowKey="orderItemId"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 760 }}
          />
        </Space>
      )}
    </Modal>
  );
};
