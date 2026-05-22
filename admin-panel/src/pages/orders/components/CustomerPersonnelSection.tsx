import { Col, Form, Row, Select } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { OrderEditSectionCard } from "./OrderEditSectionCard";
import type { OrderEditFormValues, SelectOption } from "../orderEditTypes";

type CustomerPersonnelSectionProps = {
  staffOptions: SelectOption[];
  customerOptions: SelectOption[];
};

export const CustomerPersonnelSection = ({
  staffOptions,
  customerOptions,
}: CustomerPersonnelSectionProps) => (
  <OrderEditSectionCard icon={<UserOutlined />} title="Customer & Personnel">
    <Row gutter={[20, 0]}>
      <Col xs={24} md={12}>
        <Form.Item<OrderEditFormValues>
          label="Nhân viên CSKH"
          name="accountManagerId"
          rules={[{ required: true, message: "Vui lòng chọn nhân viên CSKH" }]}
        >
          <Select
            options={staffOptions}
            placeholder="Chọn nhân viên phụ trách"
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item<OrderEditFormValues>
          label="Khách hàng"
          name="customerId"
          rules={[{ required: true, message: "Vui lòng chọn khách hàng" }]}
        >
          <Select
            options={customerOptions}
            placeholder="Chọn khách hàng"
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
      </Col>
    </Row>
  </OrderEditSectionCard>
);
