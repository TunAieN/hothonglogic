import type { CSSProperties, ReactNode } from "react";
import type { BaseRecord, HttpError } from "@refinedev/core";
import { Create, useForm } from "@refinedev/antd";
import { ClientError } from "graphql-request";
import { App } from "antd";
import {
    Breadcrumb,
    Button,
    Card,
    Col,
    ConfigProvider,
    Flex,
    Form,
    Input,
    Row,
    Space,
    theme,
    Typography,
} from "antd";
import {
    AuditOutlined,
    ClockCircleOutlined,
    DashboardOutlined,
    SafetyCertificateOutlined,
    ThunderboltOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router";
import {
    isValidCustomerPhone,
    normalizeCustomerEmail,
    normalizeCustomerPhone,
    normalizeOptionalText,
} from "./customerFormValidation";


const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

type CustomerCreateFormValues = {
    code: string;
    name: string;
    email?: string | null;
    phone: string;
    address?: string | null;
    note?: string | null;
};

const getCreateCustomerErrorMessage = (error: unknown) => {
    if (error instanceof ClientError) {
        const validation = error.response.errors?.[0]?.extensions?.validation as
            | Record<string, string[]>
            | undefined;

        const firstValidationMessage = validation
            ? Object.values(validation).flat()[0]
            : undefined;

        return firstValidationMessage ?? error.response.errors?.[0]?.message ?? "Failed to create customer";
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "Failed to create customer";
};

const buildCreateCustomerPayload = (values: CustomerCreateFormValues) => ({
    code: values.code.trim(),
    name: values.name.trim(),
    phone: normalizeCustomerPhone(values.phone),
    email: normalizeCustomerEmail(values.email),
    address: normalizeOptionalText(values.address),
    note: normalizeOptionalText(values.note),
});

type InsightCardProps = {
    icon: ReactNode;
    label: string;
    value: string;
    tone: "blue" | "green" | "gold";
};

const pageStyle: CSSProperties = {
    maxWidth: 880,
    margin: "0 auto",
    padding: "4px 0 10px",
    width: "100%",
};

const formCardBodyStyle: CSSProperties = {
    padding: "30px 34px 24px",
};

const formActionsStyle: CSSProperties = {
    borderTop: "1px solid #eef1f5",
    marginBottom: 0,
    paddingTop: 20,
};

const footerStyle: CSSProperties = {
    letterSpacing: 1.6,
    paddingTop: 2,
    textAlign: "center",
    textTransform: "uppercase",
};

const toneStyles: Record<
    InsightCardProps["tone"],
    { background: string; border: string; color: string }
> = {
    blue: {
        background: "#eef6ff",
        border: "#cfe3ff",
        color: "#0b4f9c",
    },
    green: {
        background: "#edf8f1",
        border: "#caead6",
        color: "#0c7a43",
    },
    gold: {
        background: "#fff8df",
        border: "#f4df9a",
        color: "#946200",
    },
};

const InsightCard = ({ icon, label, value, tone }: InsightCardProps) => {
    const toneStyle = toneStyles[tone];

    return (
        <Card className="customer-create-insight-card" size="small">
            <Space align="start" size={12}>
                <Flex
                    align="center"
                    justify="center"
                    style={{
                        ...toneStyle,
                        border: `1px solid ${toneStyle.border}`,
                        borderRadius: 6,
                        flex: "0 0 34px",
                        height: 34,
                        width: 34,
                    }}
                >
                    {icon}
                </Flex>
                <Space orientation="vertical" size={2}>
                    <Text className="customer-create-insight-label">{label}</Text>
                    <Text className="customer-create-insight-value">{value}</Text>
                </Space>
            </Space>
        </Card>
    );
};

export const CustomerCreate = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const { token } = theme.useToken();
    const { form, formProps } = useForm<BaseRecord, HttpError, CustomerCreateFormValues>({
        action: "create",
        resource: "customers",
        redirect: false,
            onMutationSuccess: () => {
               message.success("Tạo khách hàng thành công");
                navigate("/customers");
            },
            onMutationError: (error) => {
                 message.error(`Tạo khách hàng thất bại: ${getCreateCustomerErrorMessage(error)}`);
            },
    });

    // const handleFinish = async (values: CustomerCreateFormValues) => {
    //     console.log("Mock customer create:", values);
    //     form.resetFields();
    // };

    return (
        <Create
            breadcrumb={false}
            footerButtons={() => null}
            headerButtons={() => null}
            title={false}
        >
            <ConfigProvider
                theme={{
                    token: {
                        colorPrimary: "#001f4d",
                        borderRadius: 6,
                    },
                    components: {
                        Button: {
                            controlHeight: 38,
                            paddingInline: 18,
                        },
                        Input: {
                            controlHeight: 40,
                        },
                        Select: {
                            controlHeight: 40,
                        },
                    },
                }}
            >
                <style>
                    {`
                        .customer-create-page {
                            --customer-title: #061a35;
                            --customer-muted: #657185;
                            --customer-field-bg: #f5f6f8;
                            --customer-field-border: #edf0f4;
                        }

                        .customer-create-page .ant-breadcrumb,
                        .customer-create-page .ant-breadcrumb a,
                        .customer-create-page .ant-breadcrumb li,
                        .customer-create-page .ant-breadcrumb-separator {
                            color: #7b8798;
                            font-size: 12px;
                        }

                        .customer-create-title.ant-typography {
                            color: var(--customer-title);
                            font-size: 28px;
                            font-weight: 700;
                            letter-spacing: -0.01em;
                            line-height: 1.15;
                        }

                        .customer-create-subtitle.ant-typography {
                            color: var(--customer-muted);
                            font-size: 14px;
                            line-height: 1.5;
                        }

                        .customer-create-form-card.ant-card {
                            border-color: #edf1f6;
                            border-radius: 8px;
                            box-shadow: 0 16px 38px rgba(11, 25, 44, 0.08);
                            overflow: hidden;
                        }

                        .customer-create-form-card::before {
                            background: linear-gradient(90deg, #001f4d, #0b5cad);
                            content: "";
                            display: block;
                            height: 3px;
                        }

                        .customer-create-form .ant-form-item {
                            margin-bottom: 18px;
                        }

                        .customer-create-form .ant-form-item-label {
                            padding-bottom: 6px;
                        }

                        .customer-create-form .ant-form-item-label > label {
                            color: #26364b;
                            font-size: 11px;
                            font-weight: 700;
                            height: auto;
                            letter-spacing: 0.04em;
                            text-transform: uppercase;
                        }

                        .customer-create-form .ant-input,
                        .customer-create-form .ant-input-affix-wrapper,
                        .customer-create-form .ant-select-selector {
                            background: var(--customer-field-bg) !important;
                            border-color: var(--customer-field-border) !important;
                            box-shadow: none !important;
                        }

                        .customer-create-form .ant-input,
                        .customer-create-form .ant-select-selector {
                            color: #1f2937;
                        }

                        .customer-create-form .ant-input:hover,
                        .customer-create-form .ant-input:focus,
                        .customer-create-form .ant-select-focused .ant-select-selector,
                        .customer-create-form .ant-select-selector:hover {
                            background: #ffffff !important;
                            border-color: #b8c9df !important;
                        }

                        .customer-create-form .ant-input::placeholder,
                        .customer-create-form .ant-select-selection-placeholder {
                            color: #8b95a5;
                        }

                        .customer-create-form textarea.ant-input {
                            resize: none;
                        }

                        .customer-create-save-button {
                            box-shadow: 0 8px 16px rgba(0, 31, 77, 0.18);
                            font-weight: 600;
                            min-width: 128px;
                        }

                        .customer-create-cancel-button {
                            color: #3b4657;
                            font-weight: 500;
                        }

                        .customer-create-insight-card.ant-card {
                            background: #ffffff;
                            border-color: #f0f2f6;
                            border-radius: 8px;
                            box-shadow: 0 10px 24px rgba(11, 25, 44, 0.05);
                        }

                        .customer-create-insight-card .ant-card-body {
                            padding: 16px;
                        }

                        .customer-create-insight-label {
                            color: #647083;
                            font-size: 12px;
                            line-height: 1.2;
                        }

                        .customer-create-insight-value {
                            color: #111827;
                            font-size: 13px;
                            font-weight: 700;
                            line-height: 1.3;
                        }
                    `}
                </style>
                <Space className="customer-create-page" orientation="vertical" size={28} style={pageStyle}>
                <Space orientation="vertical" size={8}>
                    <Breadcrumb
                        items={[
                            {
                                title: (
                                    <Space size={4}>
                                        <DashboardOutlined />
                                        Dashboard
                                    </Space>
                                ),
                            },
                            { title: "Customers" },
                            { title: "Add New" },
                        ]}
                    />
                    <Title className="customer-create-title" level={2} style={{ margin: 0 }}>
                        Add New Customer
                    </Title>
                    <Paragraph className="customer-create-subtitle" style={{ margin: 0 }}>
                        Create a new profile for your global supply chain partner.
                    </Paragraph>
                </Space>

                <Card
                    className="customer-create-form-card"
                    styles={{
                        body: formCardBodyStyle,
                    }}
                >
                    <Form<CustomerCreateFormValues>
                        {...formProps}
                        className="customer-create-form"
                        form={form}
                        layout="vertical"
                        onFinish={(values) => formProps.onFinish?.(buildCreateCustomerPayload(values))}
                        requiredMark={false}
                    >
                        <Row gutter={[24, 2]}>
                            <Col xs={24} md={12}>
                                <Form.Item
                                    label="Full Name"
                                    name="name"
                                    rules={[
                                        { required: true, message: "Please enter the customer name" },
                                        { whitespace: true, message: "Customer name cannot be empty" },
                                    ]}
                                >
                                    <Input placeholder="e.g. Jonathan Vickers" />
                                </Form.Item>
                            </Col>

                            <Col xs={24} md={12}>
                                <Form.Item
                                    label="Code Name"
                                    name="code"
                                    rules={[
                                        { required: true, message: "Please enter the code name" },
                                        { whitespace: true, message: "Code name cannot be empty" },
                                    ]}
                                >
                                    <Input placeholder="Apex Logistics Corp" />
                                </Form.Item>
                            </Col>

                            <Col xs={24} md={12}>
                                <Form.Item
                                    label="Email Address"
                                    name="email"
                                    rules={[
                                        { type: "email", message: "Please enter a valid email address" },
                                        {
                                            validator: async (_, value?: string) => {
                                                if (!value || normalizeCustomerEmail(value)) {
                                                    return;
                                                }

                                                throw new Error("Please enter a valid email address");
                                            },
                                        },
                                    ]}
                                >
                                    <Input placeholder="j.vickers@apex.com" />
                                </Form.Item>
                            </Col>

                            <Col xs={24} md={12}>
                                <Form.Item
                                    label="Phone Number"
                                    name="phone"
                                    rules={[
                                        { required: true, message: "Please enter a phone number" },
                                        {
                                            validator: async (_, value?: string) => {
                                                if (value && isValidCustomerPhone(value)) {
                                                    return;
                                                }

                                                throw new Error(
                                                    "Please enter a valid phone number with 8 to 15 digits",
                                                );
                                            },
                                        },
                                    ]}
                                >
                                    <Input placeholder="+1 (555) 000-0000" />
                                </Form.Item>
                            </Col>

                            <Col span={24}>
                                <Form.Item label="Address" name="address">
                                    <TextArea
                                        autoSize={{ minRows: 3, maxRows: 4 }}
                                        placeholder="Street, Building, City, Country"
                                    />
                                </Form.Item>
                            </Col>

                            <Col span={24}>
                                <Form.Item label="Notes Area" name="note">
                                    <TextArea
                                        autoSize={{ minRows: 4, maxRows: 6 }}
                                        placeholder="Additional requirements or shipment preferences..."
                                    />
                                </Form.Item>
                            </Col>

                            <Col span={24}>
                                <Form.Item style={formActionsStyle}>
                                    <Flex gap={12} justify="flex-end" wrap="wrap">
                                        <Button
                                            className="customer-create-cancel-button"
                                            onClick={() => navigate("/customers")}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            className="customer-create-save-button"
                                            htmlType="submit"
                                            type="primary"
                                        >
                                            Save Customer
                                        </Button>
                                    </Flex>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>

                <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}>
                        <InsightCard
                            icon={<SafetyCertificateOutlined />}
                            label="Auto-Verification"
                            value="Enabled for SME/Enterprise"
                            tone="blue"
                        />
                    </Col>
                    <Col xs={24} md={8}>
                        <InsightCard
                            icon={<ClockCircleOutlined />}
                            label="Onboarding Time"
                            value="< 24 Hours"
                            tone="green"
                        />
                    </Col>
                    <Col xs={24} md={8}>
                        <InsightCard
                            icon={<ThunderboltOutlined />}
                            label="Process Priority"
                            value="Tier 1 Accelerated"
                            tone="gold"
                        />
                    </Col>
                </Row>

                <Flex justify="center" style={footerStyle}>
                    <Space size={8}>
                        <AuditOutlined style={{ color: token.colorTextTertiary }} />
                        <Text type="secondary">
                            Kinetic precision framework - 2024 Apex Cobalt
                        </Text>
                    </Space>
                </Flex>
                </Space>
            </ConfigProvider>
        </Create>
    );
};
