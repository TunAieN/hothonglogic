import { Button, Col, Form, Input, InputNumber, Row, Select, Space, Typography } from "antd";
import { DeleteOutlined, FileTextOutlined, PlusOutlined } from "@ant-design/icons";
import { OrderEditSectionCard } from "./OrderEditSectionCard";
import type { SelectOption, ShippingEntryFormValue } from "../orderEditTypes";

const { Text } = Typography;

type ShippingInfoSectionProps = {
  shippingCompanyOptions: SelectOption[];
  packagingTypeOptions: SelectOption[];
};

export const ShippingInfoSection = ({
  shippingCompanyOptions,
  packagingTypeOptions,
}: ShippingInfoSectionProps) => {
  const shippingEntries = Form.useWatch("shippingEntries") as ShippingEntryFormValue[] | undefined;
  const hasTrackingNumber = (shippingEntries ?? []).some((entry) => entry?.trackingCode?.trim());

  return (
    <OrderEditSectionCard icon={<FileTextOutlined />} title="Order Shipping Info">
      <Space direction="vertical" size={18} style={{ width: "100%" }}>
        <div className="order-edit-tip-banner">
          Chu y: Doi voi nhung kien hang co tong gia tri tu 1 trieu tro len, ban nen ke khai tong gia
          tri kien hang de duoc huong chinh sach dam bao neu co.
        </div>

        {!hasTrackingNumber ? (
          <Text type="secondary" className="order-edit-muted-note">
            Chua co ma van don
          </Text>
        ) : null}

        <Form.List name="shippingEntries">
          {(fields, { add, remove }) => (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              {fields.map((field) => (
                <Row gutter={[20, 0]} key={field.key} align="middle">
                  <Col xs={24} md={10}>
                    <Form.Item
                      {...field}
                      label="Tracking Number"
                      name={[field.name, "trackingCode"]}
                    >
                      <Input placeholder="Nhap ma van don sau khi shop phat hang" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item
                      {...field}
                      label="Gia tri kien hang (RMB)"
                      name={[field.name, "parcelValue"]}
                    >
                      <InputNumber
                        min={0}
                        precision={2}
                        style={{ width: "100%" }}
                        addonAfter="RMB"
                        placeholder="0.00"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item
                      {...field}
                      label="Cong ty chuyen phat"
                      name={[field.name, "shippingCompany"]}
                      rules={[{ required: true, message: "Vui long chon cong ty chuyen phat" }]}
                    >
                      <Select
                        options={shippingCompanyOptions}
                        placeholder="Chon don vi"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={21}>
                    <Form.Item
                      {...field}
                      label="Gia co"
                      name={[field.name, "packagingType"]}
                      rules={[{ required: true, message: "Vui long chon loai dong goi" }]}
                    >
                      <Select
                        options={packagingTypeOptions}
                        placeholder="Chon loai dong goi"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={3}>
                    <div className="order-edit-shipping-remove">
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                        disabled={fields.length === 1}
                      />
                    </div>
                  </Col>
                </Row>
              ))}

              <Button
                className="order-edit-add-tracking"
                icon={<PlusOutlined />}
                onClick={() =>
                  add({
                    trackingCode: "",
                    parcelValue: 0,
                    shippingCompany: "vn-express",
                    packagingType: "wooden-crating",
                  })
                }
              >
                Them ma kien hang
              </Button>
              <Text type="secondary" className="order-edit-muted-note">
                Co the them nhieu tracking trong cung mot don hang de theo doi tach kien.
              </Text>
            </Space>
          )}
        </Form.List>
      </Space>
    </OrderEditSectionCard>
  );
};
