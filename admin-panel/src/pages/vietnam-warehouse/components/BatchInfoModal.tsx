import { useEffect } from "react";
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
} from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import type { BatchInfoFormValues } from "../types";

type Props = {
  open: boolean;
  initialValues: BatchInfoFormValues;
  loading?: boolean;
  onCancel: () => void;
  onStart: (values: BatchInfoFormValues) => Promise<void> | void;
};

const PACKAGING_TYPE_OPTIONS = [
  { label: "Dong go", value: "Dong go" },
  { label: "Bao tai", value: "Bao tai" },
  { label: "Nep bia", value: "Nep bia" },
];

export const BatchInfoModal = ({ open, initialValues, loading, onCancel, onStart }: Props) => {
  const [form] = Form.useForm<BatchInfoFormValues>();

  useEffect(() => {
    if (!open) {
      return;
    }

    form.setFieldsValue(initialValues);
  }, [form, initialValues, open]);

  const handleStart = async () => {
    const values = await form.validateFields();
    await onStart(values);
  };

  return (
    <Modal
      title="Nhập thông tin lô hàng vào hệ thống"
      open={open}
      onCancel={onCancel}
      width={900}
      destroyOnClose
      footer={
        <Space>
          <Button icon={<CloseOutlined />} onClick={onCancel}>
            Hủy
          </Button>
          <Button type="primary" icon={<CheckOutlined />} loading={loading} onClick={() => void handleStart()}>
            Bat dau
          </Button>
        </Space>
      }
    >
      <Form<BatchInfoFormValues> form={form} layout="vertical">
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item
              label="Ma lo hang"
              name="batchCode"
              rules={[{ required: true, message: "Vui lòng nhập mã lô hàng." }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Khoi luong lo hang (kg)"
              name="batchWeight"
              rules={[{ required: true, message: "Vui lòng nhập khối lượng lô hàng." }]}
            >
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Khoi luong go/bao tai (kg)"
              name="packagingWeight"
              rules={[{ required: true, message: "Vui lòng nhập khối lượng gỗ/bao tải." }]}
            >
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Gia co"
              name="packagingType"
              rules={[{ required: true, message: "Vui lòng chọn loại đóng gói." }]}
            >
              <Select options={PACKAGING_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Chieu dai (cm)"
              name="length"
              rules={[{ required: true, message: "Vui lòng nhập chiều dài." }]}
            >
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Chieu rong (cm)"
              name="width"
              rules={[{ required: true, message: "Vui lòng nhập chiều rộng." }]}
            >
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Chieu cao (cm)"
              name="height"
              rules={[{ required: true, message: "Vui lòng nhập chiều cao." }]}
            >
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};
