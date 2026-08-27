import { useEffect } from "react";
import { Alert, Button, Checkbox, Col, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Row, Select, Space, Tag, Typography } from "antd";
import { ArrowRightOutlined, CloseOutlined } from "@ant-design/icons";
import type { BatchInfoFormValues, VietnamWarehouseBatch } from "../types";

const { Text } = Typography;
type Props = { open: boolean; batch: VietnamWarehouseBatch; initialValues: BatchInfoFormValues; loading?: boolean; onCancel: () => void; onStart: (values: BatchInfoFormValues) => Promise<void> | void };
const conditionOptions = [
  { label: "Nguyên vẹn", value: "normal" }, { label: "Móp méo", value: "dented" },
  { label: "Rách bao/thùng", value: "torn" }, { label: "Ướt", value: "wet" },
  { label: "Vỡ/hỏng", value: "broken" }, { label: "Có dấu hiệu đã mở", value: "opened" },
  { label: "Khác", value: "other" },
];

export const BatchInfoModal = ({ batch, open, initialValues, loading, onCancel, onStart }: Props) => {
  const [form] = Form.useForm<BatchInfoFormValues>();
  const actualWeight = Form.useWatch("actualBatchWeight", form) ?? 0;
  const actualContainers = Form.useWatch("actualContainerCount", form) ?? 0;
  const outerCondition = Form.useWatch("outerCondition", form) ?? "normal";
  const remeasureDimensions = Form.useWatch("remeasureDimensions", form);
  const weightDifference = actualWeight - batch.dispatchWeight;
  const hasWeightIssue = batch.dispatchWeight > 0 && Math.abs(weightDifference) > Math.max(0.5, batch.dispatchWeight * 0.02);
  const hasContainerIssue = batch.transportContainerCount > 0 && actualContainers !== batch.transportContainerCount;

  useEffect(() => { if (open) form.setFieldsValue(initialValues); }, [form, initialValues, open]);

  return (
    <Modal
      title={<Space orientation="vertical" size={0}><span>Tiếp nhận lô hàng tại kho Việt Nam</span><Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>Bước 1/2 · Đối chiếu tình trạng ngoài và thông tin bàn giao</Text></Space>}
      open={open} onCancel={onCancel} width={1040} destroyOnClose
      footer={<Space><Button icon={<CloseOutlined />} onClick={onCancel}>Hủy</Button><Button type="primary" icon={<ArrowRightOutlined />} loading={loading} onClick={() => void form.validateFields().then(onStart)}>Lưu và quét kiện</Button></Space>}
    >
      <Space orientation="vertical" size={18} style={{ width: "100%" }}>
        <div style={{ padding: 16, borderRadius: 10, background: "#f6f9ff" }}>
          <Descriptions title={<Space>Thông tin xuất kho Trung Quốc <Tag color="blue">{batch.batchCode}</Tag></Space>} column={3} size="small">
            <Descriptions.Item label="Hành trình">{batch.originWarehouseName} → {batch.destinationWarehouseName}</Descriptions.Item>
            <Descriptions.Item label="Số kiện">{batch.totalPackages} kiện</Descriptions.Item>
            <Descriptions.Item label="Số bao/thùng">{batch.transportContainerCount || "—"}</Descriptions.Item>
            <Descriptions.Item label="Khối lượng xuất">{batch.dispatchWeight.toFixed(2)} kg</Descriptions.Item>
            <Descriptions.Item label="Đóng gói">{batch.packagingType}</Descriptions.Item>
            <Descriptions.Item label="Mã chuyến">{batch.transportCode}</Descriptions.Item>
            <Descriptions.Item label="Đơn vị vận chuyển">{batch.carrierName}</Descriptions.Item>
            <Descriptions.Item label="Kích thước lô">{batch.dispatchLength && batch.dispatchWidth && batch.dispatchHeight ? `${batch.dispatchLength} × ${batch.dispatchWidth} × ${batch.dispatchHeight} cm` : "Không đo ở kho TQ"}</Descriptions.Item>
            <Descriptions.Item label="Dự kiến đến">{batch.expectedArrivalAt ? new Date(batch.expectedArrivalAt).toLocaleString("vi-VN") : "—"}</Descriptions.Item>
          </Descriptions>
        </div>

        <Form<BatchInfoFormValues> form={form} layout="vertical" requiredMark>
          <Row gutter={[16, 0]}>
            <Col xs={24} md={8}><Form.Item label="Mã lô hàng" name="batchCode"><Input readOnly /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item label="Thời gian nhận thực tế" name="receivedAt" rules={[{ required: true, message: "Chọn thời gian nhận lô." }]}><DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item label="Số bao/thùng thực nhận" name="actualContainerCount" rules={[{ required: true, message: "Nhập số bao/thùng." }]}><InputNumber min={1} precision={0} style={{ width: "100%" }} addonAfter="bao/thùng" /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item label="Khối lượng cân thực tế" name="actualBatchWeight" rules={[{ required: true, message: "Nhập khối lượng thực tế." }]}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} addonAfter="kg" /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item label="Tình trạng bên ngoài" name="outerCondition" rules={[{ required: true, message: "Chọn tình trạng lô." }]}><Select options={conditionOptions} /></Form.Item></Col>
            <Col xs={24} md={8}><Form.Item label="Đo lại kích thước lô" name="remeasureDimensions" valuePropName="checked"><Checkbox>Thực hiện đo lại tại kho VN</Checkbox></Form.Item></Col>
            {remeasureDimensions ? (["length", "width", "height"] as const).map((field, index) => <Col xs={24} md={8} key={field}><Form.Item label={["Chiều dài", "Chiều rộng", "Chiều cao"][index]} name={field} rules={[{ required: true, message: "Không được để trống." }]}><InputNumber min={0.01} precision={1} style={{ width: "100%" }} addonAfter="cm" /></Form.Item></Col>) : null}
            <Col span={24}><Form.Item label="Ghi chú tiếp nhận" name="note" rules={[{ validator: (_, value) => outerCondition !== "normal" && !String(value ?? "").trim() ? Promise.reject(new Error("Cần mô tả khi lô hàng không nguyên vẹn.")) : Promise.resolve() }]}><Input.TextArea rows={3} maxLength={500} showCount placeholder="Mô tả tình trạng bàn giao, ảnh biên bản hoặc lưu ý xử lý..." /></Form.Item></Col>
          </Row>
        </Form>

        {hasWeightIssue || hasContainerIssue || outerCondition !== "normal" ? <Alert type="warning" showIcon message="Phát hiện chênh lệch khi tiếp nhận" description={[hasWeightIssue ? `Khối lượng lệch ${weightDifference > 0 ? "+" : ""}${weightDifference.toFixed(2)} kg.` : "", hasContainerIssue ? `Số bao/thùng: TQ ${batch.transportContainerCount}, VN ${actualContainers}.` : "", outerCondition !== "normal" ? "Tình trạng bên ngoài không nguyên vẹn." : ""].filter(Boolean).join(" ") + " Lô vẫn có thể quét kiện nhưng chưa được xác nhận nhập kho cho tới khi xử lý."} /> : <Alert type="success" showIcon message="Thông tin bàn giao ban đầu khớp với dữ liệu xuất kho Trung Quốc." />}
      </Space>
    </Modal>
  );
};
