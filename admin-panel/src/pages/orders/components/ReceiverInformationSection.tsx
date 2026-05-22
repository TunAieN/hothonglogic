import { Col, Form, Input, Row, Select } from "antd";
import { CarOutlined } from "@ant-design/icons";
import { OrderEditSectionCard } from "./OrderEditSectionCard";
import type { OrderEditFormValues, SelectOption } from "../orderEditTypes";

type ReceiverInformationSectionProps = {
  shippingMethodOptions: SelectOption[];
};

export const ReceiverInformationSection = ({
  shippingMethodOptions,
}: ReceiverInformationSectionProps) => (
  <OrderEditSectionCard icon={<CarOutlined />} title="Receiver Information">
    <Row gutter={[20, 0]}>
      <Col xs={24} md={12}>
        <Form.Item<OrderEditFormValues>
          label="Tên"
          name="receiverName"
          rules={[{ required: true, message: "Vui lòng nhập tên người nhận" }]}
        >
          <Input placeholder="Nhập tên người nhận" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item<OrderEditFormValues>
          label="Điện thoại"
          name="receiverPhone"
          rules={[{ required: true, message: "Vui lòng nhập số điện thoại" }]}
        >
          <Input placeholder="Nhập số điện thoại" />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item<OrderEditFormValues>
          label="Địa chỉ nhận"
          name="receiverAddress"
          rules={[{ required: true, message: "Vui lòng nhập địa chỉ nhận" }]}
        >
          <Input placeholder="Nhập địa chỉ người nhận" />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item<OrderEditFormValues>
          label="Phương thức vận chuyển"
          name="shippingMethod"
          rules={[{ required: true, message: "Vui lòng chọn phương thức vận chuyển" }]}
        >
          <Select
            options={shippingMethodOptions}
            placeholder="Chọn phương thức vận chuyển"
          />
        </Form.Item>
      </Col>
    </Row>
  </OrderEditSectionCard>
);
