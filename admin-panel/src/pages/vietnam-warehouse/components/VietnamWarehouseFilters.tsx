import { Button, Card, Col, DatePicker, Form, Input, Row, Select, Space } from "antd";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { VietnamWarehouseFilterValues, VietnamWarehouseStatus } from "../types";

type Props = {
  form: ReturnType<typeof Form.useForm<VietnamWarehouseFilterValues>>[0];
  customerOptions: string[];
  receiverOptions: string[];
  onSearch: (values: VietnamWarehouseFilterValues) => void;
  onReset: () => void;
};

const STATUS_OPTIONS: Array<{ label: string; value: VietnamWarehouseStatus }> = [
  { label: "Chờ đối soát", value: "pending_check" },
  { label: "Đã kiểm", value: "checked" },
  { label: "Thiếu kiện", value: "missing" },
  { label: "Thừa kiện", value: "extra" },
  { label: "Đã nhập kho Việt Nam", value: "arrived_vn" },
];

export const VietnamWarehouseFilters = ({
  form,
  customerOptions,
  receiverOptions,
  onSearch,
  onReset,
}: Props) => {
  return (
    <Card title="Bộ lọc tìm kiếm">
      <Form<VietnamWarehouseFilterValues> form={form} layout="vertical" onFinish={onSearch}>
        <Row gutter={[16, 0]}>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="Mã lô hàng" name="batchCode">
              <Input placeholder="Nhập mã lô hàng" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="Trạng thái" name="status">
              <Select allowClear placeholder="Tất cả" options={STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="Mã vận đơn" name="trackingCode">
              <Input placeholder="Nhập mã vận đơn" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="Khách hàng" name="customerName">
              <Select
                allowClear
                placeholder="Tất cả"
                options={customerOptions.map((item) => ({ label: item, value: item }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="Nhận từ ngày" name="receivedFrom">
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} placeholder="Chọn ngày" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="Đến ngày" name="receivedTo">
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} placeholder="Chọn ngày" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12} xl={8}>
            <Form.Item label="Người nhận" name="receiverName">
              <Select
                allowClear
                placeholder="Tất cả"
                options={receiverOptions.map((item) => ({ label: item, value: item }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Space wrap>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
            Tìm kiếm
          </Button>
          <Button icon={<ReloadOutlined />} onClick={onReset}>
            Reset
          </Button>
        </Space>
      </Form>
    </Card>
  );
};
