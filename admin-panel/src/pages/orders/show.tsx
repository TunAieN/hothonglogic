import { Show, NumberField } from "@refinedev/antd";
import { Typography, Card, Descriptions, Table, Row, Col, Tag, Space, Divider } from "antd";
import { useShow } from "@refinedev/core";
import { ShoppingOutlined, UserOutlined } from "@ant-design/icons";
import type { IOrder } from "../../interfaces";

const { Title, Text } = Typography;

export const OrderShow = () => {
    const { query } = useShow<IOrder>();
    const { data, isLoading } = query;

    const record = data?.data;

    return (
        <Show isLoading={isLoading}>
            <Row gutter={[16, 16]}>
                <Col xs={24} lg={16}>
                    <Card
                        title={
                            <Space>
                                <ShoppingOutlined />
                                <span>Order Details</span>
                            </Space>
                        }
                        bordered={false}
                    >
                        <Descriptions column={2}>
                            <Descriptions.Item label="Order Number">
                                <Text strong>{record?.order_code}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Status">
                                <Tag color="blue">{record?.status?.toUpperCase()}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Order Date">
                                {record?.created_at}
                            </Descriptions.Item>
                            <Descriptions.Item label="Total Amount">
                                <NumberField
                                    value={record?.total_amount}
                                    options={{ style: "currency", currency: "USD" }}
                                />
                            </Descriptions.Item>
                        </Descriptions>

                        <Divider />

                        <Title level={5}>Items</Title>
                        <Table
                            dataSource={record?.items}
                            pagination={false}
                            rowKey="id"
                            size="small"
                        >
                            <Table.Column dataIndex="product_name" title="Product" />
                            <Table.Column
                                dataIndex="price_cny"
                                title="Price"
                                render={(value) => (
                                    <NumberField
                                        value={value}
                                        options={{ style: "currency", currency: "USD" }}
                                    />
                                )}
                            />
                            <Table.Column dataIndex="quantity" title="Quantity" />
                            <Table.Column
                                title="Subtotal"
                                render={(_, item: any) => (
                                    <NumberField
                                        value={item.price_cny * item.quantity}
                                        options={{ style: "currency", currency: "USD" }}
                                    />
                                )}
                            />
                        </Table>
                    </Card>
                </Col>
                <Col xs={24} lg={8}>
                    <Card
                        title={
                            <Space>
                                <UserOutlined />
                                <span>Customer Info</span>
                            </Space>
                        }
                        bordered={false}
                    >
                        <Descriptions column={1}>
                            <Descriptions.Item label="Name">
                                {record?.customer?.name}
                            </Descriptions.Item>
                            <Descriptions.Item label="Email">
                                {record?.customer?.email}
                            </Descriptions.Item>
                            <Descriptions.Item label="Phone">
                                {record?.customer?.phone}
                            </Descriptions.Item>
                            <Descriptions.Item label="Shipping Address">
                                {record?.customer?.address}
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>

                    <Card title="Payment Summary" bordered={false} style={{ marginTop: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                            <Text>Subtotal</Text>
                            <NumberField value={record?.total_amount} options={{ style: "currency", currency: "USD" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                            <Text>Shipping</Text>
                            <NumberField value={0} options={{ style: "currency", currency: "USD" }} />
                        </div>
                        <Divider style={{ margin: "12px 0" }} />
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <Text strong>Total</Text>
                            <Text strong>
                                <NumberField value={record?.total_amount} options={{ style: "currency", currency: "USD" }} />
                            </Text>
                        </div>
                    </Card>
                </Col>
            </Row>
        </Show>
    );
};
