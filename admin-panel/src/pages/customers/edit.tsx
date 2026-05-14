import { useEffect, type CSSProperties, type ReactNode } from "react";
import type { BaseRecord, HttpError } from "@refinedev/core";
import { useOne } from "@refinedev/core";
import { Edit, useForm } from "@refinedev/antd";
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
    Select,
    Space,
    Spin,
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
import { useNavigate, useParams } from "react-router";
import type { ICustomer } from "../../interfaces";
import {
    isValidCustomerPhone,
    normalizeCustomerEmail,
    normalizeCustomerPhone,
    normalizeOptionalText,
} from "./customerFormValidation";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

type CustomerEditFormValues = {
    code: string;
    name: string;
    email?: string | null;
    phone: string;
    address?: string | null;
    note?: string | null;
    status: ICustomer["status"];
};

const CUSTOMER_STATUS_OPTIONS = [
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
    { label: "Blocked", value: "blocked" },
] as const;

const getCustomerErrorMessage = (error: unknown) => {
    if (error instanceof ClientError) {
        const validation = error.response.errors?.[0]?.extensions?.validation as
            | Record<string, string[]>
            | undefined;

        const firstValidationMessage = validation
            ? Object.values(validation).flat()[0]
            : undefined;

        return firstValidationMessage ?? error.response.errors?.[0]?.message ?? "Failed to update customer";
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "Failed to update customer";
};

const buildCustomerPayload = (values: CustomerEditFormValues) => ({
    code: values.code.trim(),
    name: values.name.trim(),
    phone: normalizeCustomerPhone(values.phone),
    email: normalizeCustomerEmail(values.email),
    address: normalizeOptionalText(values.address),
    note: normalizeOptionalText(values.note),
    status: values.status,
});

const buildInitialValues = (customer?: ICustomer): CustomerEditFormValues | null => {
    if (!customer) {
        return null;
    }

    return {
        code: customer.code ?? "",
        name: customer.name ?? "",
        email: customer.email ?? null,
        phone: customer.phone ?? "",
        address: customer.address ?? null,
        note: customer.note ?? null,
        status: customer.status ?? "active",
    };
};

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
        <Card className="customer-edit-insight-card" size="small">
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
                    <Text className="customer-edit-insight-label">{label}</Text>
                    <Text className="customer-edit-insight-value">{value}</Text>
                </Space>
            </Space>
        </Card>
    );
};

export const CustomerEdit = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { message } = App.useApp();
    const { token } = theme.useToken();
    const { form, formProps } = useForm<
        BaseRecord,
        HttpError,
        CustomerEditFormValues
    >({
        action: "edit",
        resource: "customers",
        redirect: false,
        onMutationSuccess: () => {
            message.success("Customer updated successfully");
            navigate("/customers");
        },
        onMutationError: (error) => {
            message.error(`Update failed: ${getCustomerErrorMessage(error)}`);
        },
    });

    const { query } = useOne<ICustomer>({
        resource: "customers",
        id,
        queryOptions: {
            enabled: Boolean(id),
        },
    });

    const customer = query.data?.data;
    const isLoading = query.isLoading;

    useEffect(() => {
        const initialValues = buildInitialValues(customer);

        if (initialValues) {
            form.setFieldsValue(initialValues);
        }
    }, [customer, form]);

    return (
        <Edit
            breadcrumb={false}
            footerButtons={() => null}
            headerButtons={() => null}
            isLoading={isLoading}
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
                        .customer-edit-page {
                            --customer-title: #061a35;
                            --customer-muted: #657185;
                            --customer-field-bg: #f5f6f8;
                            --customer-field-border: #edf0f4;
                        }

                        .customer-edit-page .ant-breadcrumb,
                        .customer-edit-page .ant-breadcrumb a,
                        .customer-edit-page .ant-breadcrumb li,
                        .customer-edit-page .ant-breadcrumb-separator {
                            color: #7b8798;
                            font-size: 12px;
                        }

                        .customer-edit-title.ant-typography {
                            color: var(--customer-title);
                            font-size: 28px;
                            font-weight: 700;
                            letter-spacing: -0.01em;
                            line-height: 1.15;
                        }

                        .customer-edit-subtitle.ant-typography {
                            color: var(--customer-muted);
                            font-size: 14px;
                            line-height: 1.5;
                        }

                        .customer-edit-form-card.ant-card {
                            border-color: #edf1f6;
                            border-radius: 8px;
                            box-shadow: 0 16px 38px rgba(11, 25, 44, 0.08);
                            overflow: hidden;
                        }

                        .customer-edit-form-card::before {
                            background: linear-gradient(90deg, #001f4d, #0b5cad);
                            content: "";
                            display: block;
                            height: 3px;
                        }

                        .customer-edit-form .ant-form-item {
                            margin-bottom: 18px;
                        }

                        .customer-edit-form .ant-form-item-label {
                            padding-bottom: 6px;
                        }

                        .customer-edit-form .ant-form-item-label > label {
                            color: #26364b;
                            font-size: 11px;
                            font-weight: 700;
                            height: auto;
                            letter-spacing: 0.04em;
                            text-transform: uppercase;
                        }

                        .customer-edit-form .ant-input,
                        .customer-edit-form .ant-input-affix-wrapper,
                        .customer-edit-form .ant-select-selector {
                            background: var(--customer-field-bg) !important;
                            border-color: var(--customer-field-border) !important;
                            box-shadow: none !important;
                        }

                        .customer-edit-form .ant-input,
                        .customer-edit-form .ant-select-selector {
                            color: #1f2937;
                        }

                        .customer-edit-form .ant-input:hover,
                        .customer-edit-form .ant-input:focus,
                        .customer-edit-form .ant-select-focused .ant-select-selector,
                        .customer-edit-form .ant-select-selector:hover {
                            background: #ffffff !important;
                            border-color: #b8c9df !important;
                        }

                        .customer-edit-form .ant-input::placeholder,
                        .customer-edit-form .ant-select-selection-placeholder {
                            color: #8b95a5;
                        }

                        .customer-edit-form textarea.ant-input {
                            resize: none;
                        }

                        .customer-edit-save-button {
                            box-shadow: 0 8px 16px rgba(0, 31, 77, 0.18);
                            font-weight: 600;
                            min-width: 128px;
                        }

                        .customer-edit-cancel-button {
                            color: #3b4657;
                            font-weight: 500;
                        }

                        .customer-edit-insight-card.ant-card {
                            background: #ffffff;
                            border-color: #f0f2f6;
                            border-radius: 8px;
                            box-shadow: 0 10px 24px rgba(11, 25, 44, 0.05);
                        }

                        .customer-edit-insight-card .ant-card-body {
                            padding: 16px;
                        }

                        .customer-edit-insight-label {
                            color: #647083;
                            font-size: 12px;
                            line-height: 1.2;
                        }

                        .customer-edit-insight-value {
                            color: #111827;
                            font-size: 13px;
                            font-weight: 700;
                            line-height: 1.3;
                        }
                    `}
                </style>
                <Space className="customer-edit-page" orientation="vertical" size={28} style={pageStyle}>
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
                                { title: customer?.name ?? "Edit" },
                            ]}
                        />
                        <Title className="customer-edit-title" level={2} style={{ margin: 0 }}>
                            Edit Customer
                        </Title>
                        <Paragraph className="customer-edit-subtitle" style={{ margin: 0 }}>
                            Update profile and operating status for this logistics partner.
                        </Paragraph>
                    </Space>

                    <Card
                        className="customer-edit-form-card"
                        styles={{
                            body: formCardBodyStyle,
                        }}
                    >
                        <Spin spinning={Boolean(isLoading)}>
                            <Form<CustomerEditFormValues>
                                {...formProps}
                                className="customer-edit-form"
                                form={form}
                                layout="vertical"
                                onFinish={(values) =>
                                    formProps.onFinish?.(buildCustomerPayload(values))
                                }
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

                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Account Status"
                                            name="status"
                                            rules={[{ required: true, message: "Please select a status" }]}
                                        >
                                            <Select options={CUSTOMER_STATUS_OPTIONS as never} />
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
                                                    className="customer-edit-cancel-button"
                                                    onClick={() => navigate("/customers")}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    className="customer-edit-save-button"
                                                    htmlType="submit"
                                                    type="primary"
                                                >
                                                    Save Changes
                                                </Button>
                                            </Flex>
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </Form>
                        </Spin>
                    </Card>

                    <Row gutter={[16, 16]}>
                        <Col xs={24} md={8}>
                            <InsightCard
                                icon={<SafetyCertificateOutlined />}
                                label="Verification"
                                value="Status changes tracked"
                                tone="blue"
                            />
                        </Col>
                        <Col xs={24} md={8}>
                            <InsightCard
                                icon={<ClockCircleOutlined />}
                                label="Last Sync"
                                value="Applies immediately"
                                tone="green"
                            />
                        </Col>
                        <Col xs={24} md={8}>
                            <InsightCard
                                icon={<ThunderboltOutlined />}
                                label="Account Impact"
                                value="Orders remain intact"
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
        </Edit>
    );
};
