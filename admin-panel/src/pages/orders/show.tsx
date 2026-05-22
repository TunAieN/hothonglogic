import { useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DeleteButton, NumberField, Show } from "@refinedev/antd";
import { useShow, useUpdate } from "@refinedev/core";
import {
    Avatar,
    Breadcrumb,
    Button,
    Card,
    Col,
    Divider,
    Grid,
    Image,
    message,
    Row,
    Space,
    Tag,
    Typography,
} from "antd";
import type { ImageProps } from "antd";
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    DeleteOutlined,
    EnvironmentOutlined,
    MailOutlined,
    PhoneOutlined,
    PrinterOutlined,
    ReloadOutlined,
    SearchOutlined,
    ShoppingOutlined,
    SyncOutlined,
    TruckOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { Link } from "react-router";
import type { IOrder, IOrderItem } from "../../interfaces";

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type StepKey = "pending" | "confirmed" | "shipped" | "delivered";

type StatusMeta = {
    color: string;
    label: string;
};

const orderJourneyStatuses = ["pending", "approved", "shipped", "delivered"] as const;

const currencyOptions = { style: "currency", currency: "USD" } as const;

const statusMetaMap: Record<string, StatusMeta> = {
    pending: { color: "blue", label: "Pending" },
    approved: { color: "gold", label: "Approved" },
    confirmed: { color: "gold", label: "Confirmed" },
    deposit: { color: "gold", label: "Confirmed" },
    shipped: { color: "cyan", label: "Shipped" },
    receiving: { color: "cyan", label: "Shipped" },
    delivered: { color: "green", label: "Delivered" },
    completed: { color: "green", label: "Delivered" },
    complaint: { color: "red", label: "Complaint" },
    cancelled: { color: "red", label: "Cancelled" },
};

const trackerSteps: Array<{
    key: StepKey;
    title: string;
    icon: ReactNode;
}> = [
    { key: "pending", title: "Pending", icon: <ClockCircleOutlined /> },
    { key: "confirmed", title: "Confirmed", icon: <SyncOutlined /> },
    { key: "shipped", title: "Shipped", icon: <TruckOutlined /> },
    { key: "delivered", title: "Delivered", icon: <CheckCircleOutlined /> },
];

const surfaceCardStyle: CSSProperties = {
    borderRadius: 28,
    border: "1px solid #dbe3f0",
    boxShadow: "0 22px 60px rgba(15, 23, 42, 0.08)",
    background:
        "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.98) 100%)",
};

const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#102a56",
};

const mutedTextStyle: CSSProperties = {
    color: "#64748b",
};

const actionButtonStyle: CSSProperties = {
    height: 42,
    borderRadius: 14,
    fontWeight: 600,
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
};

const primaryButtonStyle: CSSProperties = {
    ...actionButtonStyle,
    background: "#0b4aa2",
    borderColor: "#0b4aa2",
};

const dangerButtonStyle: CSSProperties = {
    ...actionButtonStyle,
    background: "#dc2626",
    borderColor: "#dc2626",
};

const trackerContainerStyle: CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: 0,
    overflowX: "auto",
    paddingBottom: 4,
};

const trackerStepStyle: CSSProperties = {
    position: "relative",
    flex: 1,
    minWidth: 160,
    paddingRight: 16,
};

const trackerLineStyle: CSSProperties = {
    position: "absolute",
    top: 22,
    left: 56,
    right: -8,
    height: 3,
    borderRadius: 999,
    background: "#d7e1f0",
};

const itemRowStyle: CSSProperties = {
    padding: "20px 0",
    borderBottom: "1px solid #e7edf6",
};

const summaryRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
};

const infoCardBodyStyle: CSSProperties = {
    padding: 24,
};

const formatDateTime = (value?: string) => {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const getStatusMeta = (status?: string): StatusMeta => {
    if (!status) {
        return { color: "default", label: "Unknown" };
    }

    return statusMetaMap[status.toLowerCase()] ?? {
        color: "default",
        label: status.replace(/_/g, " "),
    };
};

const getTrackerStepIndex = (status?: string) => {
    const normalizedStatus = status?.toLowerCase();

    if (!normalizedStatus) {
        return 0;
    }
    const normalizedJourneyStatus =
        normalizedStatus === "completed"
            ? "delivered"
            : normalizedStatus === "receiving"
              ? "shipped"
              : ["approved", "confirmed", "deposit"].includes(normalizedStatus)
                ? "approved"
                : normalizedStatus;

    const currentStep = orderJourneyStatuses.indexOf(
        normalizedJourneyStatus as (typeof orderJourneyStatuses)[number],
    );

    return currentStep >= 0 ? currentStep : 0;
};

const getProductSku = (item: IOrderItem, index: number) => {
    const productCode = item.product_name
        .split(/\s+/)
        .map((part) => part.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
        .filter(Boolean)
        .slice(0, 3)
        .join("-");

    return productCode ? `SKU-${productCode}` : `SKU-ITEM-${index + 1}`;
};

const getInitials = (value?: string) =>
    value
        ?.split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("") || "CU";

const ProductThumb = ({ item }: { item: IOrderItem }) => {
    const imageProps: ImageProps = {
        src: item.product_image ?? undefined,
        alt: item.product_name,
        width: 72,
        height: 72,
        style: { objectFit: "cover", borderRadius: 18 },
        preview: false,
        fallback: "",
    };

    if (item.product_image) {
        return <Image {...imageProps} />;
    }

    return (
        <div
            style={{
                width: 72,
                height: 72,
                borderRadius: 18,
                background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                border: "1px solid #c7d8f8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
            }}
        >
            <ShoppingOutlined style={{ fontSize: 24, color: "#0b4aa2" }} />
        </div>
    );
};

const InfoRow = ({
    icon,
    label,
    value,
}: {
    icon: ReactNode;
    label: string;
    value?: ReactNode;
}) => (
    <div
        style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 20,
            padding: "14px 0",
        }}
    >
        <div
            style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                background: "#edf4ff",
                color: "#0b4aa2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
            }}
        >
            {icon}
        </div>
        <Space direction="vertical" size={2} style={{ width: "100%" }}>
            <Text style={{ ...mutedTextStyle, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
                {label}
            </Text>
            <Text strong style={{ color: "#0f172a", fontSize: 15 }}>
                {value || "-"}
            </Text>
        </Space>
    </div>
);

export const OrderShow = () => {
    const { query } = useShow<IOrder>();
    const { data, isLoading } = query;
    const { mutate: updateOrderStatus } = useUpdate<IOrder>();
    const [messageApi, contextHolder] = message.useMessage();
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const navigateScreens = useBreakpoint();
    const trackerRef = useRef<HTMLDivElement | null>(null);

    const record = data?.data;

    const items = useMemo(() => record?.items ?? [], [record?.items]);
    const currentStepIndex = getTrackerStepIndex(record?.status);
    const statusMeta = getStatusMeta(record?.status);

    const itemsSubtotal = useMemo(
        () => items.reduce((sum, item) => sum + item.price_cny * item.quantity, 0),
        [items],
    );

    const handleTrackOrder = () => {
        trackerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const handlePrint = () => {
        window.print();
    };

    const handleConfirmOrder = () => {
        if (!record?.id || record.status?.toLowerCase() !== "pending") {
            return;
        }

        setIsUpdatingStatus(true);
        updateOrderStatus(
            {
                resource: "orders",
                id: record.id,
                values: { status: "approved" },
            },
            {
                onSuccess: async () => {
                    messageApi.success("Đã xác nhận đơn hàng.");
                    await query.refetch();
                    setIsUpdatingStatus(false);
                },
                onError: (error) => {
                    messageApi.error(error instanceof Error ? error.message : "Không thể xác nhận đơn hàng.");
                    setIsUpdatingStatus(false);
                },
            },
        );
    };

    return (
        <>
            {contextHolder}
            <Show
                isLoading={isLoading}
                title={false}
                headerButtons={() => <></>}
                contentProps={{
                    style: {
                        padding: 0,
                        background: "transparent",
                        boxShadow: "none",
                    },
                }}
            >
                <div
                    style={{
                        minHeight: "100%",
                        background:
                            "radial-gradient(circle at top right, rgba(59,130,246,0.08), transparent 28%), #f4f7fb",
                    }}
                >
                    <Space direction="vertical" size={24} style={{ width: "100%" }}>
                    <Card bordered={false} style={surfaceCardStyle} styles={{ body: { padding: 28 } }}>
                        <Space direction="vertical" size={20} style={{ width: "100%" }}>
                            <Breadcrumb
                                items={[
                                    { title: <Link to="/orders">Orders</Link> },
                                    { title: "Order Details" },
                                ]}
                            />

                            <Row gutter={[20, 20]} align="middle" justify="space-between">
                                <Col xs={24} xl={10}>
                                    <Space direction="vertical" size={10}>
                                        <Space size={12} wrap>
                                            <Button
                                                icon={<SearchOutlined />}
                                                style={{
                                                    ...actionButtonStyle,
                                                    width: 42,
                                                    paddingInline: 0,
                                                }}
                                                onClick={handleTrackOrder}
                                            />
                                            <Title
                                                level={1}
                                                style={{
                                                    margin: 0,
                                                    color: "#0f172a",
                                                    fontSize: navigateScreens.md ? 38 : 30,
                                                    lineHeight: 1.08,
                                                }}
                                            >
                                                {record?.order_code || "Order Details"}
                                            </Title>
                                            <Tag
                                                color={statusMeta.color}
                                                style={{
                                                    borderRadius: 999,
                                                    padding: "6px 14px",
                                                    fontWeight: 700,
                                                    textTransform: "uppercase",
                                                    marginInlineEnd: 0,
                                                }}
                                            >
                                                {statusMeta.label}
                                            </Tag>
                                        </Space>
                                        <Text style={{ ...mutedTextStyle, fontSize: 15 }}>
                                            Placed on {formatDateTime(record?.created_at)}
                                        </Text>
                                    </Space>
                                </Col>

                                <Col xs={24} xl={14}>
                                    <Space
                                        size={[12, 12]}
                                        wrap
                                        style={{
                                            width: "100%",
                                            justifyContent: navigateScreens.xl ? "flex-end" : "flex-start",
                                        }}
                                    >
                                        <Button
                                            type="primary"
                                            icon={<TruckOutlined />}
                                            style={primaryButtonStyle}
                                            onClick={handleTrackOrder}
                                        >
                                            Track Order
                                        </Button>
                                        <Button
                                            icon={<PrinterOutlined />}
                                            style={actionButtonStyle}
                                            onClick={handlePrint}
                                        >
                                            Print Label
                                        </Button>
                                        <Button
                                            icon={<ReloadOutlined />}
                                            style={actionButtonStyle}
                                            onClick={() => query.refetch()}
                                        >
                                            Refresh
                                        </Button>
                                        <DeleteButton
                                            recordItemId={record?.id}
                                            resource="orders"
                                            icon={<DeleteOutlined />}
                                            style={dangerButtonStyle}
                                            disabled={!record?.id}
                                        >
                                            Delete Order
                                        </DeleteButton>
                                    </Space>
                                </Col>
                            </Row>
                        </Space>
                    </Card>

                    <div ref={trackerRef}>
                        <Card bordered={false} style={surfaceCardStyle} styles={{ body: { padding: 28 } }}>
                        <Space direction="vertical" size={24} style={{ width: "100%" }}>
                            <Title level={5} style={sectionTitleStyle}>
                                Order Journey
                            </Title>

                            <div style={trackerContainerStyle}>
                                {trackerSteps.map((step, index) => {
                                    const isActive = index === currentStepIndex;
                                    const isCompleted = index < currentStepIndex;
                                    const tone = isActive || isCompleted ? "#0b4aa2" : "#94a3b8";

                                    return (
                                        <div key={step.key} style={trackerStepStyle}>
                                            {index < trackerSteps.length - 1 ? (
                                                <div
                                                    style={{
                                                        ...trackerLineStyle,
                                                        background:
                                                            index < currentStepIndex ? "#0b4aa2" : "#d7e1f0",
                                                    }}
                                                />
                                            ) : null}

                                            <Space direction="vertical" size={10}>
                                                <div
                                                    style={{
                                                        width: 44,
                                                        height: 44,
                                                        borderRadius: 16,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        background: isActive
                                                            ? "#0b4aa2"
                                                            : isCompleted
                                                              ? "#dbeafe"
                                                              : "#ffffff",
                                                        color: isActive
                                                            ? "#ffffff"
                                                            : isCompleted
                                                              ? "#0b4aa2"
                                                              : "#94a3b8",
                                                        border: `1px solid ${
                                                            isActive || isCompleted ? "#0b4aa2" : "#d7e1f0"
                                                        }`,
                                                        boxShadow: isActive
                                                            ? "0 14px 28px rgba(11, 74, 162, 0.28)"
                                                            : "0 8px 18px rgba(15, 23, 42, 0.05)",
                                                        position: "relative",
                                                        zIndex: 1,
                                                    }}
                                                >
                                                    {step.icon}
                                                </div>

                                                <Space direction="vertical" size={0}>
                                                    <Text strong style={{ color: tone, fontSize: 14 }}>
                                                        {step.title}
                                                    </Text>
                                                    <Text style={{ ...mutedTextStyle, fontSize: 12 }}>
                                                        {index <= currentStepIndex
                                                            ? formatDateTime(record?.created_at)
                                                            : "Waiting..."}
                                                    </Text>
                                                </Space>
                                            </Space>
                                        </div>
                                    );
                                })}
                            </div>
                        </Space>
                        </Card>
                    </div>

                    <Row gutter={[24, 24]} align="stretch">
                        <Col xs={24} xxl={16}>
                            <Card bordered={false} style={surfaceCardStyle} styles={{ body: { padding: 28 } }}>
                                <Space direction="vertical" size={24} style={{ width: "100%" }}>
                                    <Row justify="space-between" align="middle" gutter={[16, 16]}>
                                        <Col>
                                            <Space size={10}>
                                                <div
                                                    style={{
                                                        width: 42,
                                                        height: 42,
                                                        borderRadius: 14,
                                                        background: "#edf4ff",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        color: "#0b4aa2",
                                                    }}
                                                >
                                                    <ShoppingOutlined />
                                                </div>
                                                <Title level={4} style={{ margin: 0, color: "#0f172a" }}>
                                                    Items Summary
                                                </Title>
                                            </Space>
                                        </Col>
                                        <Col>
                                            <Tag
                                                style={{
                                                    margin: 0,
                                                    borderRadius: 999,
                                                    padding: "4px 12px",
                                                    background: "#eff6ff",
                                                    borderColor: "#dbeafe",
                                                    color: "#0b4aa2",
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {items.length} item{items.length === 1 ? "" : "s"}
                                            </Tag>
                                        </Col>
                                    </Row>

                                    <div>
                                        {items.map((item, index) => (
                                            <div key={item.id ?? `${item.product_name}-${index}`} style={itemRowStyle}>
                                                <Row gutter={[16, 16]} align="middle">
                                                    <Col xs={24} md={15}>
                                                        <Space size={16} align="start">
                                                            <ProductThumb item={item} />
                                                            <Space direction="vertical" size={4}>
                                                                <Text strong style={{ color: "#0f172a", fontSize: 15 }}>
                                                                    {item.product_name}
                                                                </Text>
                                                                <Text style={{ ...mutedTextStyle, fontSize: 12 }}>
                                                                    {getProductSku(item, index)}
                                                                </Text>
                                                                <Text style={{ ...mutedTextStyle, fontSize: 13 }}>
                                                                    Quantity: {item.quantity}
                                                                </Text>
                                                            </Space>
                                                        </Space>
                                                    </Col>
                                                    <Col xs={12} md={4}>
                                                        <Space direction="vertical" size={2}>
                                                            <Text style={{ ...mutedTextStyle, fontSize: 11, textTransform: "uppercase" }}>
                                                                Price
                                                            </Text>
                                                            <Text strong style={{ color: "#0f172a" }}>
                                                                <NumberField value={item.price_cny} options={currencyOptions} />
                                                            </Text>
                                                        </Space>
                                                    </Col>
                                                    <Col xs={12} md={5}>
                                                        <Space
                                                            direction="vertical"
                                                            size={2}
                                                            style={{ width: "100%", textAlign: navigateScreens.md ? "right" : "left" }}
                                                        >
                                                            <Text style={{ ...mutedTextStyle, fontSize: 11, textTransform: "uppercase" }}>
                                                                Subtotal
                                                            </Text>
                                                            <Text strong style={{ color: "#0b4aa2", fontSize: 16 }}>
                                                                <NumberField
                                                                    value={item.price_cny * item.quantity}
                                                                    options={currencyOptions}
                                                                />
                                                            </Text>
                                                        </Space>
                                                    </Col>
                                                </Row>
                                            </div>
                                        ))}
                                    </div>

                                    <Divider style={{ margin: 0, borderColor: "#e7edf6" }} />

                                    <Space direction="vertical" size={14} style={{ width: "100%" }}>
                                        <div style={summaryRowStyle}>
                                            <Text style={mutedTextStyle}>Subtotal</Text>
                                            <Text strong>
                                                <NumberField value={itemsSubtotal} options={currencyOptions} />
                                            </Text>
                                        </div>
                                        <div style={summaryRowStyle}>
                                            <Text style={mutedTextStyle}>Shipping Fee</Text>
                                            <Text strong>
                                                <NumberField value={0} options={currencyOptions} />
                                            </Text>
                                        </div>
                                        <div style={summaryRowStyle}>
                                            <Text style={mutedTextStyle}>Taxes</Text>
                                            <Text strong>
                                                <NumberField value={0} options={currencyOptions} />
                                            </Text>
                                        </div>
                                        <Divider style={{ margin: "4px 0", borderColor: "#dbe3f0" }} />
                                        <div style={summaryRowStyle}>
                                            <Text
                                                style={{
                                                    color: "#0f172a",
                                                    fontWeight: 800,
                                                    fontSize: 15,
                                                    letterSpacing: 0.6,
                                                    textTransform: "uppercase",
                                                }}
                                            >
                                                Total Amount
                                            </Text>
                                            <Title level={2} style={{ margin: 0, color: "#0b4aa2" }}>
                                                <NumberField value={record?.total_amount} options={currencyOptions} />
                                            </Title>
                                        </div>
                                    </Space>
                                </Space>
                            </Card>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: navigateScreens.md ? "flex-end" : "stretch",
                                    marginTop: 16,
                                }}
                            >
                                <Button
                                    type="primary"
                                    icon={<CheckCircleOutlined />}
                                    style={primaryButtonStyle}
                                    block={!navigateScreens.md}
                                    loading={isUpdatingStatus}
                                    disabled={record?.status?.toLowerCase() !== "pending"}
                                    onClick={handleConfirmOrder}
                                >
                                    Xác nhận đơn hàng
                                </Button>
                            </div>
                        </Col>
                                   
                        <Col xs={24} xxl={8}>
                            <Space direction="vertical" size={24} style={{ width: "100%" }}>
                                <Card bordered={false} style={surfaceCardStyle} styles={{ body: infoCardBodyStyle }}>
                                    <Space direction="vertical" size={14} style={{ width: "100%" }}>
                                        <Space size={12}>
                                            <Avatar
                                                size={52}
                                                style={{
                                                    background: "linear-gradient(135deg, #0b4aa2 0%, #2563eb 100%)",
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {getInitials(record?.customer?.name)}
                                            </Avatar>
                                            <Space direction="vertical" size={0}>
                                                <Title level={4} style={{ margin: 0, color: "#0f172a" }}>
                                                    Customer Info
                                                </Title>
                                                <Text style={mutedTextStyle}>Primary contact details</Text>
                                            </Space>
                                        </Space>

                                        <Divider style={{ margin: 0, borderColor: "#e7edf6" }} />

                                        <InfoRow
                                            icon={<UserOutlined />}
                                            label="Full Name"
                                            value={record?.customer?.name}
                                        />
                                        <InfoRow
                                            icon={<MailOutlined />}
                                            label="Email Address"
                                            value={record?.customer?.email}
                                        />
                                        <InfoRow
                                            icon={<PhoneOutlined />}
                                            label="Phone Number"
                                            value={record?.customer?.phone}
                                        />
                                    </Space>
                                </Card>

                                <Card bordered={false} style={surfaceCardStyle} styles={{ body: infoCardBodyStyle }}>
                                    <Space direction="vertical" size={14} style={{ width: "100%" }}>
                                        <Title level={4} style={{ margin: 0, color: "#0f172a" }}>
                                            Shipping Details
                                        </Title>
                                        <Text style={mutedTextStyle}>Operational delivery information</Text>

                                        <Divider style={{ margin: 0, borderColor: "#e7edf6" }} />

                                        <InfoRow
                                            icon={<EnvironmentOutlined />}
                                            label="Delivery Address"
                                            value={record?.customer?.address}
                                        />
                                        <InfoRow
                                            icon={<TruckOutlined />}
                                            label="Shipping Method"
                                            value="Not specified"
                                        />
                                        <InfoRow
                                            icon={<CheckCircleOutlined />}
                                            label="Delivery Status"
                                            value={statusMeta.label}
                                        />
                                    </Space>
                                </Card>
                            </Space>
                        </Col>
                    </Row>
                </Space>
            </div>
            </Show>
        </>
    );
};
