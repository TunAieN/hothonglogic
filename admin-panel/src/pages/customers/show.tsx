import type { CSSProperties } from "react";
import { Show } from "@refinedev/antd";
import { useShow } from "@refinedev/core";
import {
    Avatar,
    Breadcrumb,
    Button,
    Card,
    Col,
    Descriptions,
    Dropdown,
    Flex,
    Progress,
    Row,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
    CalendarOutlined,
    DownloadOutlined,
    EnvironmentOutlined,
    ExportOutlined,
    HomeOutlined,
    MailOutlined,
    MoreOutlined,
    PhoneOutlined,
    RiseOutlined,
    SafetyCertificateOutlined,
    ShoppingOutlined,
    StarFilled,
    UserOutlined,
} from "@ant-design/icons";
import type { ICustomer, IOrder } from "../../interfaces";
import mapImage from "../../assets/map.png";

const { Text, Title, Paragraph } = Typography;

type PurchaseStatus = IOrder["status"];

interface PurchaseHistoryItem {
    id: string;
    orderCode: string;
    orderDate: string;
    totalAmount: number;
    status: PurchaseStatus;
}

interface CustomerProfile extends Omit<ICustomer, "orders"> {
    tier: string;
    lifetimeValue: number;
    lifetimeProgress: number;
    logisticsRegion: string;
    orders: PurchaseHistoryItem[];
}

const pageStyle: CSSProperties = {
    maxWidth: 1680,
    width: "100%",
};

const mapWrapStyle: CSSProperties = {
    height: 176,
    overflow: "hidden",
    position: "relative",
};

const mapImageStyle: CSSProperties = {
    height: "100%",
    objectFit: "cover",
    width: "100%",
};

const mapMarkerStyle: CSSProperties = {
    border: "2px solid #ffffff",
    borderRadius: "50%",
    height: 12,
    position: "absolute",
    width: 12,
};

const mockCustomer: CustomerProfile = {
    id: "CUS-1048",
    name: "Alexander Vance",
    email: "avance@enterprise-logistics.com",
    phone: "+1 (555) 924-1028",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80",
    status: "active",
    address: "882 Highline Boulevard, Suite 400, Seattle, WA 98104",
    created_at: "2021-10-14T09:30:00.000Z",
    orders_count: 5,
    tier: "Premium Member - Gold Tier",
    lifetimeValue: 42910,
    lifetimeProgress: 72,
    logisticsRegion: "Seattle region",
    orders: [
        {
            id: "1",
            orderCode: "ORD-82109",
            orderDate: "2024-05-24T10:10:00.000Z",
            totalAmount: 1240.5,
            status: "delivered",
        },
        {
            id: "2",
            orderCode: "ORD-879442",
            orderDate: "2024-05-18T11:45:00.000Z",
            totalAmount: 892.2,
            status: "shipped",
        },
        {
            id: "3",
            orderCode: "ORD-875102",
            orderDate: "2024-05-12T15:20:00.000Z",
            totalAmount: 205,
            status: "delivered",
        },
        {
            id: "4",
            orderCode: "ORD-869204",
            orderDate: "2024-04-29T08:30:00.000Z",
            totalAmount: 450,
            status: "cancelled",
        },
        {
            id: "5",
            orderCode: "ORD-861198",
            orderDate: "2024-04-15T13:00:00.000Z",
            totalAmount: 1580.3,
            status: "delivered",
        },
    ],
};

const statusColor: Record<PurchaseStatus, string> = {
    pending: "gold",
    shipped: "blue",
    delivered: "green",
    cancelled: "red",
};

const statusLabel: Record<PurchaseStatus, string> = {
    pending: "Pending",
    shipped: "In Transit",
    delivered: "Delivered",
    cancelled: "Cancelled",
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
});

const formatDate = (value?: string) => {
    if (!value) {
        return "-";
    }

    return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(value));
};

const getProfileFromRecord = (record?: ICustomer): CustomerProfile => {
    if (!record) {
        return mockCustomer;
    }

    const orders = Array.isArray(record.orders)
        ? record.orders.map((order) => ({
              id: order.id,
              orderCode: order.order_code || `ORD-${order.id}`,
              orderDate: order.created_at,
              totalAmount: order.total_amount,
              status: order.status,
          }))
        : [];

    const lifetimeValue = orders.reduce(
        (total, order) => total + order.totalAmount,
        0,
    );

    return {
        ...record,
        tier: record.status === "active" ? "Premium Member - Gold Tier" : "Standard Member",
        lifetimeValue: lifetimeValue || mockCustomer.lifetimeValue,
        lifetimeProgress: lifetimeValue ? Math.min(Math.round(lifetimeValue / 650), 100) : 72,
        logisticsRegion: "Seattle region",
        orders: orders.length > 0 ? orders : mockCustomer.orders,
    };
};

const KpiCard = ({ label, value, helper, icon, color, bg }: any) => (
    <Card size="small" style={{ height: "100%" }}>
        <Flex align="center" justify="space-between">
            <Statistic
                title={label}
                value={value}
                valueStyle={{ fontWeight: 600 }}
            />

            <Flex
                align="center"
                justify="center"
                style={{
                    background: bg,
                    color: color,
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                }}
            >
                {icon}
            </Flex>
        </Flex>

        <Text type="secondary" style={{ fontSize: 12 }}>
            {helper}
        </Text>
    </Card>
);

export const CustomerShow = () => {
    const { query } = useShow<ICustomer>({
        resource: "customers",
    });
    const { data, isLoading } = query;
    console.log("Raw data from useShow:", data);
    const customer = getProfileFromRecord(data?.data);
    console.log("Customer data:", customer);
    const columns: ColumnsType<PurchaseHistoryItem> = [
        {
            title: "Order ID",
            dataIndex: "orderCode",
            key: "orderCode",
            render: (value: string) => <Text strong>{value}</Text>,
        },
        {
            title: "Order Date",
            dataIndex: "orderDate",
            key: "orderDate",
            render: (value: string) => <Text>{formatDate(value)}</Text>,
        },
        {
            title: "Total Amount",
            dataIndex: "totalAmount",
            key: "totalAmount",
            align: "right",
            render: (value: number) => <Text strong>{currencyFormatter.format(value)}</Text>,
        },
        {
            title: "Status",
            dataIndex: "status",
            key: "status",
            render: (value: PurchaseStatus) => (
                <Tag color={statusColor[value]}>
                    {statusLabel[value]}
                </Tag>
            ),
        },
        {
            title: "Actions",
            key: "actions",
            align: "center",
            width: 96,
            render: () => (
                <Dropdown
                    trigger={["click"]}
                    menu={{
                        items: [
                            { key: "view", label: "View order" },
                            { key: "invoice", label: "Download invoice" },
                        ],
                    }}
                >
                    <Button aria-label="Order actions" icon={<MoreOutlined />} size="small" type="text" />
                </Dropdown>
            ),
        },
    ];

    return (
        <Show
            breadcrumb={false}
            headerButtons={() => null}
            isLoading={isLoading}
            title={false}
        >
            <Space orientation="vertical" size="large" style={pageStyle}>
                <Row align="bottom" justify="space-between" gutter={[16, 16]}>
                    <Col>
                        <Space orientation="vertical" size={8}>
                            <Breadcrumb
                                items={[
                                    { title: "Directory" },
                                    { title: "Customers" },
                                    { title: customer.name },
                                ]}
                            />
                            <Title level={2} style={{ margin: 0 }}>
                                Customer Profile
                            </Title>
                        </Space>
                    </Col>
                    <Col>
                        <Space wrap>
                            <Button icon={<ExportOutlined />}>
                                Edit Profile
                            </Button>
                            <Button icon={<MailOutlined />} type="primary">
                                Contact Customer
                            </Button>
                        </Space>
                    </Col>
                </Row>

                <Row gutter={[24, 24]} align="stretch">
                    <Col xs={24} lg={8} xl={6} xxl={5}>
                        <Card style={{ height: "100%" }}>
                            <Space align="center" orientation="vertical" size={10} style={{ width: "100%" }}>
                                <Avatar
                                    alt={customer.name}
                                    icon={<UserOutlined />}
                                    size={96}
                                    src={customer.avatar}
                                />
                                <Space align="center" orientation="vertical" size={2}>
                                    <Title level={4} style={{ margin: 0 }}>
                                        {customer.name}
                                    </Title>
                                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                                        {customer.tier}
                                    </Tag>
                                </Space>
                            </Space>

                            <Descriptions
                                column={1}
                                layout="vertical"
                                size="small"
                                style={{ marginTop: 24 }}
                                items={[
                                    {
                                        key: "email",
                                        label: (
                                            <Space size={4}>
                                                <MailOutlined />
                                                Email Address
                                            </Space>
                                        ),
                                        children: customer.email,
                                    },
                                    {
                                        key: "phone",
                                        label: (
                                            <Space size={4}>
                                                <PhoneOutlined />
                                                Phone Number
                                            </Space>
                                        ),
                                        children: customer.phone,
                                    },
                                    {
                                        key: "address",
                                        label: (
                                            <Space size={4}>
                                                <HomeOutlined />
                                                Primary Address
                                            </Space>
                                        ),
                                        children: customer.address,
                                    },
                                    {
                                        key: "created_at",
                                        label: (
                                            <Space size={4}>
                                                <CalendarOutlined />
                                                Join Date
                                            </Space>
                                        ),
                                        children: formatDate(customer.created_at),
                                    },
                                ]}
                            />

                            <Card size="small" title="Lifetime Value" style={{ marginTop: 16 }}>
                                <Text strong>{currencyFormatter.format(customer.lifetimeValue)}</Text>
                                <Progress
                                    percent={customer.lifetimeProgress}
                                    showInfo={false}
                                    style={{ marginTop: 8 }}
                                />
                            </Card>
                        </Card>
                    </Col>

                    <Col xs={24} lg={16} xl={18} xxl={19}>
                        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
                            <Row gutter={[16, 16]}>
                                <Col xs={24} md={8}>
                                    <KpiCard
                                        helper="Across active accounts"
                                        icon={<ShoppingOutlined />}
                                        color="#1890ff"
                                        bg="#e6f7ff"
                                        label="Total Orders"
                                        value={String(customer.orders.length)}
                                    />
                                </Col>
                                <Col xs={24} md={8}>
                                    <KpiCard
                                        helper="Month over month"
                                        icon={<RiseOutlined />}
                                        color="#52c41a"
                                        bg="#f6ffed"
                                        label="Avg. Growth"
                                        value="14.2%"
                                    />
                                </Col>
                                <Col xs={24} md={8}>
                                    <KpiCard
                                        helper="Feedback score"
                                        icon={<StarFilled />}
                                        color="#fa8c16"
                                        bg="#fff7e6"
                                        label="Feedback Score"
                                        value="4.9"
                                    />
                                </Col>
                            </Row>

                            <Card
                                title="Purchase History"
                                extra={<Button icon={<DownloadOutlined />} size="small">Export CSV</Button>}
                            >
                                <Paragraph type="secondary">
                                    Recent orders and transaction status.
                                </Paragraph>
                                <Table<PurchaseHistoryItem>
                                    columns={columns}
                                    dataSource={customer.orders}
                                    pagination={false}
                                    rowKey="id"
                                    scroll={{ x: 960 }}
                                    size="middle"
                                />
                                <div style={{ marginTop: 16, textAlign: "center" }}>
                                    <Button type="link">View All Transactions</Button>
                                </div>
                            </Card>

                            <Card
                                title="Logistics Coverage"
                                extra={<SafetyCertificateOutlined />}
                            >
                                <Paragraph type="secondary">
                                    Active shipments for this customer in the {customer.logisticsRegion}.
                                </Paragraph>
                                <div style={{ marginTop: 16, ...mapWrapStyle }}>
                                    <img alt="Logistics coverage map" src={mapImage} style={mapImageStyle} />
                                    <span
                                        style={{
                                            ...mapMarkerStyle,
                                            background: "#0b5cad",
                                            left: "64%",
                                            top: "30%",
                                        }}
                                    />
                                    <span
                                        style={{
                                            ...mapMarkerStyle,
                                            background: "#0b6b55",
                                            left: "38%",
                                            top: "52%",
                                        }}
                                    />
                                    <Tag
                                        icon={<EnvironmentOutlined />}
                                        style={{
                                            bottom: 14,
                                            position: "absolute",
                                            right: 14,
                                        }}
                                    >
                                        2 active lanes
                                    </Tag>
                                </div>
                            </Card>
                        </Space>
                    </Col>
                </Row>
            </Space>
        </Show>
    );
};
