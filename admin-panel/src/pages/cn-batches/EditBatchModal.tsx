import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import type { Key } from "react";
import {
  calculateBatchTotals,
  calculatePackageVolume,
  mapBatchToEditFormValues,
} from "./helpers";
import type { BatchEditFormValues, BatchPackageRow, BatchViewModel } from "./types";
import "./edit-batch-modal.css";

const { Text } = Typography;

type Props = {
  batch: BatchViewModel | null;
  receivingWarehouseOptions: Array<{ label: string; value: string }>;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (values: BatchEditFormValues) => Promise<void>;
};

const SHIPPING_OPTIONS = [
  { label: "Nhanh", value: "fast" },
  { label: "Thường", value: "normal" },
];

const emptyPackageRow = (): BatchPackageRow => ({
  key: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  trackingNumber: "",
  weight: undefined,
  length: undefined,
  width: undefined,
  height: undefined,
  volume: 0,
});

export const EditBatchModal = ({
  batch,
  receivingWarehouseOptions,
  loading,
  onCancel,
  onSubmit,
}: Props) => {
  const [form] = Form.useForm<BatchEditFormValues>();
  const watchedPackages = Form.useWatch("packages", { form, preserve: true });
  const packages = useMemo(() => watchedPackages ?? [], [watchedPackages]);
  const [editingRowKeys, setEditingRowKeys] = useState<Key[]>([]);
  const totals = useMemo(() => calculateBatchTotals(packages), [packages]);

  useEffect(() => {
    if (!batch) return;

    form.resetFields();
    form.setFieldsValue(mapBatchToEditFormValues(batch));
  }, [batch, form]);

  useEffect(() => {
    if (!batch) return;

    form.setFieldsValue({
      totalWeight: Number(totals.totalWeight.toFixed(2)),
      totalVolume: Number(totals.totalVolume.toFixed(4)),
    });
  }, [batch, form, totals.totalVolume, totals.totalWeight]);

  const handleSubmit = async () => {
    if (!batch) return;

    try {
      const values = await form.validateFields();
      const normalizedCodes = values.packages.map((pkg) => pkg.trackingNumber.trim().toUpperCase());

      if (new Set(normalizedCodes).size !== normalizedCodes.length) {
        message.error("Danh sách có mã vận đơn bị trùng.");
        return;
      }

      if (values.expectedArrivalAt.isSame(values.departedAt) || values.expectedArrivalAt.isBefore(values.departedAt)) {
        form.setFields([{ name: "expectedArrivalAt", errors: ["Ngày nhận dự kiến phải sau ngày phát."] }]);
        return;
      }

      const fallbackPackages = mapBatchToEditFormValues(batch).packages;
      await onSubmit({
        ...values,
        packages: values.packages?.length ? values.packages : fallbackPackages,
      });
    } catch {
      // Field errors are displayed next to their inputs.
    }
  };

  return (
    <Modal
      title="Sửa thông tin lô hàng vận chuyển"
      open={Boolean(batch)}
      onCancel={onCancel}
      afterClose={() => setEditingRowKeys([])}
      width={1400}
      className="batch-edit-modal"
      destroyOnClose
      forceRender
      maskClosable={false}
      confirmLoading={loading}
      okText="Lưu thay đổi"
      cancelText="Hủy"
      onOk={() => void handleSubmit()}
      styles={{ body: { maxHeight: "calc(100vh - 190px)", overflowY: "auto" } }}
    >
      {batch ? (
        <Form<BatchEditFormValues> form={form} layout="vertical" requiredMark>
          <Row gutter={[24, 0]}>
            <Col xs={24} lg={8}>
              <Form.Item label="Mã lô hàng" name="batchCode" rules={[{ required: true }]}>
                <Input
                  readOnly
                  suffix={
                    <Button
                      type="text"
                      size="small"
                      aria-label="Sao chép mã lô"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        void navigator.clipboard.writeText(batch.batchCode);
                        message.success("Đã sao chép mã lô.");
                      }}
                    />
                  }
                />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item label="Kho nhận" name="receivingWarehouseName" rules={[{ required: true, message: "Vui lòng chọn kho nhận." }]}>
                <Select showSearch options={receivingWarehouseOptions} placeholder="Chọn kho nhận" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item label="Trạng thái" name="status" rules={[{ required: true }]}>
                <Select
                  disabled
                  options={[{ value: "pending", label: <Tag color="gold">Chờ xuất kho</Tag> }]}
                />
              </Form.Item>
            </Col>

            <Col xs={24} lg={8}>
              <Form.Item label="Ngày phát" name="departedAt" rules={[{ required: true, message: "Vui lòng chọn ngày phát." }]}>
                <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item label="Loại hình vận chuyển" name="shippingType" rules={[{ required: true }]}>
                <Select options={SHIPPING_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item label="Giá cước" name="freightCost" rules={[{ type: "number", min: 0, message: "Giá cước không được âm." }]}>
                <InputNumber min={0} precision={2} addonAfter="RMB" placeholder="Nhập giá cước" style={{ width: "100%" }} />
              </Form.Item>
            </Col>

            <Col xs={24} lg={8}>
              <Form.Item label="Khối lượng lô hàng" name="totalWeight" rules={[{ required: true }]}>
                <Input readOnly value={totals.totalWeight.toFixed(2)} suffix="kg" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item label="Thể tích" name="totalVolume" rules={[{ required: true }]}>
                <Input readOnly value={totals.totalVolume.toFixed(4)} suffix="m³" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={8}>
              <Form.Item label="Ngày nhận dự kiến" name="expectedArrivalAt" rules={[{ required: true, message: "Vui lòng chọn ngày nhận dự kiến." }]}>
                <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item label="Ghi chú" name="note">
                <Input.TextArea
                  rows={3}
                  maxLength={500}
                  showCount
                  placeholder="Nhập lưu ý về đóng gói, vận chuyển hoặc bàn giao..."
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.List name="packages" rules={[{ validator: async (_, value) => value?.length ? Promise.resolve() : Promise.reject(new Error("Lô hàng phải có ít nhất một vận đơn.")) }]}>
            {(fields, { add, remove }, { errors }) => {
              const columns: ColumnsType<{ fieldKey: number; row: BatchPackageRow }> = [
                {
                  title: "#",
                  key: "index",
                  width: 56,
                  align: "center",
                  render: (_, __, index) => index + 1,
                },
                {
                  title: "Mã vận đơn",
                  key: "trackingNumber",
                  width: 210,
                  render: (_, item) => {
                    const editing = editingRowKeys.includes(item.row.key);
                    return editing ? (
                      <Form.Item name={[item.fieldKey, "trackingNumber"]} style={{ margin: 0 }} rules={[{ required: true, message: "Nhập mã vận đơn." }]}>
                        <Input disabled={Boolean(item.row.id)} placeholder="Nhập mã đã có tại kho TQ" />
                      </Form.Item>
                    ) : <Text strong>{item.row.trackingNumber}</Text>;
                  },
                },
                ...(["weight", "length", "width", "height"] as const).map((field) => ({
                  title: field === "weight" ? "Khối lượng (kg)" : field === "length" ? "Dài (cm)" : field === "width" ? "Rộng (cm)" : "Cao (cm)",
                  key: field,
                  width: 145,
                  align: "center" as const,
                  render: (_: unknown, item: { fieldKey: number; row: BatchPackageRow }) => {
                    const editing = editingRowKeys.includes(item.row.key);
                    const value = item.row[field];
                    return editing ? (
                      <Form.Item
                        name={[item.fieldKey, field]}
                        style={{ margin: 0 }}
                        rules={field === "weight"
                          ? [{ required: true, message: "Bắt buộc." }, { type: "number", min: 0.01, message: "> 0" }]
                          : [{ type: "number", min: 0, message: "Không âm." }]}
                      >
                        <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                      </Form.Item>
                    ) : <Text>{Number(value ?? 0).toFixed(field === "weight" ? 2 : 0)}</Text>;
                  },
                })),
                {
                  title: "Thể tích (m³)",
                  key: "volume",
                  width: 150,
                  align: "center",
                  render: (_, item) => <Text>{calculatePackageVolume(item.row).toFixed(4)}</Text>,
                },
                {
                  title: "Hành động",
                  key: "actions",
                  width: 120,
                  align: "center",
                  render: (_, item) => {
                    const editing = editingRowKeys.includes(item.row.key);
                    return (
                      <Space size="small">
                        <Button
                          type="text"
                          className={editing ? "batch-row-done" : "batch-row-edit"}
                          icon={editing ? <span aria-hidden>✓</span> : <EditOutlined />}
                          aria-label={editing ? "Hoàn tất sửa" : "Sửa vận đơn"}
                          onClick={() => setEditingRowKeys((current) => editing
                            ? current.filter((key) => key !== item.row.key)
                            : [...current, item.row.key])}
                        />
                        <Popconfirm
                          title="Gỡ vận đơn khỏi lô?"
                          description="Kiện vẫn được giữ tại kho Trung Quốc."
                          okText="Gỡ"
                          cancelText="Hủy"
                          onConfirm={() => {
                            remove(item.fieldKey);
                            setEditingRowKeys((current) => current.filter((key) => key !== item.row.key));
                          }}
                        >
                          <Button danger type="text" icon={<DeleteOutlined />} aria-label="Gỡ vận đơn" />
                        </Popconfirm>
                      </Space>
                    );
                  },
                },
              ];

              const dataSource = fields.map((field, index) => ({
                key: field.key,
                fieldKey: index,
                row: packages[index] ?? {
                  key: String(field.key),
                  trackingNumber: "",
                  volume: 0,
                },
              }));

              return (
                <Card
                  className="batch-package-card"
                  title="Danh sách vận đơn"
                  extra={
                    <Button
                      type="primary"
                      ghost
                      icon={<PlusOutlined />}
                      onClick={() => {
                        const row = emptyPackageRow();
                        add(row);
                        setEditingRowKeys((current) => [...current, row.key]);
                      }}
                    >
                      Thêm vận đơn
                    </Button>
                  }
                >
                  <Table
                    rowKey="key"
                    columns={columns}
                    dataSource={dataSource}
                    pagination={false}
                    scroll={{ x: 1100 }}
                    size="middle"
                    summary={() => (
                      <Table.Summary.Row className="batch-total-row">
                        <Table.Summary.Cell index={0} />
                        <Table.Summary.Cell index={1}><Text strong>Tổng cộng</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="center"><Text strong>{totals.totalWeight.toFixed(2)} kg</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={3} />
                        <Table.Summary.Cell index={4} />
                        <Table.Summary.Cell index={5} />
                        <Table.Summary.Cell index={6} align="center"><Text strong>{totals.totalVolume.toFixed(4)} m³</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={7} />
                      </Table.Summary.Row>
                    )}
                  />
                  <Form.ErrorList errors={errors} />
                </Card>
              );
            }}
          </Form.List>
        </Form>
      ) : null}
    </Modal>
  );
};
