import { Button, Card, Col, Form, Input, Row, Typography } from "antd";
import type { VietnamWarehouseBatch } from "../types";

const { Text } = Typography;

type Props = {
  form: ReturnType<typeof Form.useForm<{ batchCode: string }>>[0];
  batchPreview?: VietnamWarehouseBatch;
  onSubmit: (values: { batchCode: string }) => void;
};

export const BatchReceiveCard = ({ form, batchPreview, onSubmit }: Props) => {
  return (
    <Card
      title="Nhập hàng vào kho VN theo mã lô"
      extra={
        <Text type="secondary">
          B1: nhập thông tin lô hàng • B2: nhập kiện hàng và so khớp với lô Trung Quốc
        </Text>
      }
    >
      <Form<{ batchCode: string }> form={form} layout="vertical" onFinish={onSubmit}>
        <Row gutter={[16, 0]} align="bottom">
          <Col xs={24} lg={8}>
            <Form.Item
              label="Nhập mã lô hàng"
              name="batchCode"
              rules={[{ required: true, message: "Vui lòng nhập mã lô hàng." }]}
            >
              <Input placeholder="Nhập mã lô hàng" />
            </Form.Item>
          </Col>
          <Col xs={24} lg={10}>
            <Form.Item label="Thông tin lô hàng">
              <Input
                disabled
                value={
                  batchPreview
                    ? `${batchPreview.batchCode} • ${batchPreview.destinationWarehouseName} • ${batchPreview.totalPackages} kiện`
                    : ""
                }
                placeholder="Thông tin lô hàng"
              />
            </Form.Item>
          </Col>
          <Col xs={24} lg={6}>
            <Form.Item>
              <Button type="primary" htmlType="submit" block>
                Tiếp tục
              </Button>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  );
};
