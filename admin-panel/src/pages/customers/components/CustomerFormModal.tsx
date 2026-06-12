import { useEffect, type CSSProperties } from "react";
import type { BaseRecord, HttpError } from "@refinedev/core";
import { useOne } from "@refinedev/core";
import { useForm } from "@refinedev/antd";
import { App, Button, Col, ConfigProvider, Flex, Form, Input, Modal, Row, Select, Space, Spin, Typography } from "antd";
import {
    EnvironmentOutlined,
    MailOutlined,
    PhoneOutlined,
    SafetyCertificateOutlined,
    SolutionOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { ClientError } from "graphql-request";
import type { ICustomer } from "../../../interfaces";
import {
    isValidCustomerPhone,
    normalizeCustomerEmail,
    normalizeCustomerPhone,
    normalizeOptionalText,
} from "../customerFormValidation";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

type CustomerModalMode = "create" | "edit";

type CustomerBaseFormValues = {
    code?: string;
    name: string;
    vip_group?: string | null;
    email?: string | null;
    phone: string;
    province?: string | null;
    district?: string | null;
    ward?: string | null;
    address?: string | null;
    note?: string | null;
    status?: ICustomer["status"];
};

type CustomerCreateFormValues = Omit<CustomerBaseFormValues, "status">;

type CustomerEditFormValues = Required<Pick<CustomerBaseFormValues, "code" | "status">> &
    Omit<CustomerBaseFormValues, "code" | "status">;

type CustomerFormModalProps = {
    customerId?: string;
    mode: CustomerModalMode;
    onClose: () => void;
    onCompleted?: () => void | Promise<void>;
    open: boolean;
};

const CUSTOMER_STATUS_OPTIONS = [
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
    { label: "Blocked", value: "blocked" },
] as const;

const modalWidth = 1240;

const fieldIconStyle: CSSProperties = {
    color: "#7d8798",
    fontSize: 16,
};

const modalBodyStyle: CSSProperties = {
    background: "linear-gradient(180deg, #ffffff 0%, #fbfcff 100%)",
    padding: 0,
};

const headerIconWrapStyle: CSSProperties = {
    alignItems: "center",
    background: "linear-gradient(180deg, #eef4ff 0%, #f8fbff 100%)",
    border: "1px solid #e2ebfb",
    borderRadius: "999px",
    color: "#2154cf",
    display: "flex",
    flex: "0 0 54px",
    height: 54,
    justifyContent: "center",
    width: 54,
};

const sectionStyle: CSSProperties = {
    padding: "0 32px 28px",
};

const footerStyle: CSSProperties = {
    borderTop: "1px solid #edf1f7",
    marginTop: 8,
    padding: "20px 32px 28px",
};

const textAreaStyle: CSSProperties = {
    minHeight: 112,
    resize: "none",
};

const getCreateCustomerErrorMessage = (error: unknown) => {
    if (error instanceof ClientError) {
        const validation = error.response.errors?.[0]?.extensions?.validation as
            | Record<string, string[]>
            | undefined;

        const firstValidationMessage = validation
            ? Object.values(validation).flat()[0]
            : undefined;

        if (firstValidationMessage?.includes("Phone number already exists")) {
            return "Số điện thoại đã tồn tại trong hệ thống";
        }

        if (firstValidationMessage?.includes("Email already exists")) {
            return "Email đã tồn tại trong hệ thống";
        }

        return firstValidationMessage ?? error.response.errors?.[0]?.message ?? "Failed to create customer";
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "Failed to create customer";
};

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

const buildCreateCustomerPayload = (values: CustomerCreateFormValues) => ({
    name: values.name.trim(),
    vip_group: normalizeOptionalText(values.vip_group),
    phone: normalizeCustomerPhone(values.phone),
    email: normalizeCustomerEmail(values.email),
    province: normalizeOptionalText(values.province),
    district: normalizeOptionalText(values.district),
    ward: normalizeOptionalText(values.ward),
    address: normalizeOptionalText(values.address),
    note: normalizeOptionalText(values.note),
});

const buildEditCustomerPayload = (values: CustomerEditFormValues) => ({
    code: values.code.trim(),
    name: values.name.trim(),
    vip_group: normalizeOptionalText(values.vip_group),
    phone: normalizeCustomerPhone(values.phone),
    email: normalizeCustomerEmail(values.email),
    province: normalizeOptionalText(values.province),
    district: normalizeOptionalText(values.district),
    ward: normalizeOptionalText(values.ward),
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
        vip_group: customer.vip_group ?? null,
        email: customer.email ?? null,
        phone: customer.phone ?? "",
        province: customer.province ?? null,
        district: customer.district ?? null,
        ward: customer.ward ?? null,
        address: customer.address ?? null,
        note: customer.note ?? null,
        status: customer.status ?? "active",
    };
};

const getModalCopy = (mode: CustomerModalMode) =>
    mode === "create"
        ? {
              submitLabel: "Tạo khách hàng",
              subtitle: "Tạo hồ sơ khách hàng mới với thông tin liên hệ và địa chỉ giao nhận.",
              successMessage: "Tạo khách hàng thành công",
              title: "Tạo khách hàng",
          }
        : {
              submitLabel: "Lưu thay đổi",
              subtitle: "Cập nhật thông tin và trạng thái hoạt động của khách hàng.",
              successMessage: "Cập nhật khách hàng thành công",
              title: "Chỉnh sửa khách hàng",
          };

const renderInputPrefix = (icon: React.ReactNode) => <span style={fieldIconStyle}>{icon}</span>;

export const CustomerFormModal = ({
    customerId,
    mode,
    onClose,
    onCompleted,
    open,
}: CustomerFormModalProps) => {
    const { message } = App.useApp();
    const copy = getModalCopy(mode);
    const isEdit = mode === "edit";
    const { form, formProps, saveButtonProps } = useForm<
        BaseRecord,
        HttpError,
        CustomerCreateFormValues | CustomerEditFormValues
    >({
        action: isEdit ? "edit" : "create",
        id: customerId,
        resource: "customers",
        redirect: false,
        onMutationSuccess: async () => {
            message.success(copy.successMessage);
            await onCompleted?.();
            onClose();
        },
        onMutationError: (error) => {
            const errorMessage = isEdit
                ? getCustomerErrorMessage(error)
                : getCreateCustomerErrorMessage(error);

            message.error(errorMessage);
        },
    });

    const { query } = useOne<ICustomer>({
        resource: "customers",
        id: customerId,
        queryOptions: {
            enabled: open && isEdit && Boolean(customerId),
        },
    });

    const customer = query.data?.data;
    const isLoadingCustomer = isEdit && query.isLoading;

    useEffect(() => {
        if (!open) {
            form.resetFields();
            return;
        }

        if (!isEdit) {
            form.resetFields();
            return;
        }

        const initialValues = buildInitialValues(customer);

        if (initialValues) {
            form.setFieldsValue(initialValues);
        }
    }, [customer, form, isEdit, open]);

    return (
        <ConfigProvider
            theme={{
                token: {
                    borderRadius: 16,
                    colorPrimary: "#2563eb",
                },
                components: {
                    Button: {
                        controlHeight: 48,
                        fontWeight: 600,
                        paddingInline: 24,
                    },
                    Input: {
                        controlHeight: 48,
                    },
                    Modal: {
                        borderRadiusLG: 28,
                    },
                    Select: {
                        controlHeight: 48,
                    },
                },
            }}
        >
            <style>
                {`
                    .customer-form-modal .ant-modal-content {
                        background: #ffffff;
                        border: 1px solid #edf1f7;
                        border-radius: 28px;
                        box-shadow: 0 26px 80px rgba(15, 36, 84, 0.14);
                        overflow: hidden;
                        padding: 0;
                    }

                    .customer-form-modal .ant-modal-close {
                        top: 22px;
                        inset-inline-end: 22px;
                    }

                    .customer-form-modal .ant-modal-close-x {
                        color: #6b7280;
                        font-size: 20px;
                    }

                    .customer-form-layout .ant-form-item {
                        margin-bottom: 18px;
                    }

                    .customer-form-layout .ant-form-item-label {
                        padding-bottom: 8px;
                    }

                    .customer-form-layout .ant-form-item-label > label {
                        color: #334155;
                        font-size: 14px;
                        font-weight: 700;
                        height: auto;
                    }

                    .customer-form-layout .ant-input,
                    .customer-form-layout .ant-input-affix-wrapper,
                    .customer-form-layout .ant-select-selector {
                        border-color: #d9e2f2 !important;
                        border-radius: 14px !important;
                        box-shadow: none !important;
                    }

                    .customer-form-layout .ant-input,
                    .customer-form-layout .ant-input-affix-wrapper {
                        padding-block: 10px;
                    }

                    .customer-form-layout .ant-input-affix-wrapper .ant-input {
                        padding-block: 0;
                    }

                    .customer-form-layout .ant-input:hover,
                    .customer-form-layout .ant-input:focus,
                    .customer-form-layout .ant-input-affix-wrapper:hover,
                    .customer-form-layout .ant-input-affix-wrapper-focused,
                    .customer-form-layout .ant-select-focused .ant-select-selector,
                    .customer-form-layout .ant-select-selector:hover {
                        border-color: #93c5fd !important;
                    }

                    .customer-form-layout .ant-select-selector {
                        padding-block: 8px !important;
                    }

                    .customer-form-layout textarea.ant-input {
                        border-radius: 14px !important;
                    }
                `}
            </style>
            <Modal
                className="customer-form-modal"
                closeIcon
                destroyOnHidden
                footer={null}
                onCancel={onClose}
                open={open}
                styles={{
                    body: modalBodyStyle,
                    mask: {
                        backdropFilter: "blur(4px)",
                        background: "rgba(15, 23, 42, 0.38)",
                    },
                }}
                width={modalWidth}
            >
                <div style={{ padding: "28px 32px 22px" }}>
                    <Space align="start" size={16}>
                        <div style={headerIconWrapStyle}>
                            <UserOutlined style={{ fontSize: 24 }} />
                        </div>
                        <Space direction="vertical" size={2}>
                            <Title level={2} style={{ color: "#123a86", fontSize: 24, margin: 0 }}>
                                {copy.title}
                            </Title>
                            <Paragraph style={{ color: "#5b6b85", fontSize: 14, margin: 0 }}>
                                {copy.subtitle}
                            </Paragraph>
                        </Space>
                    </Space>
                </div>

                <div style={sectionStyle}>
                    <Spin spinning={Boolean(isLoadingCustomer)}>
                        <Form<CustomerCreateFormValues | CustomerEditFormValues>
                            {...formProps}
                            className="customer-form-layout"
                            form={form}
                            layout="vertical"
                            onFinish={(values) =>
                                formProps.onFinish?.(
                                    isEdit
                                        ? buildEditCustomerPayload(values as CustomerEditFormValues)
                                        : buildCreateCustomerPayload(values as CustomerCreateFormValues),
                                )
                            }
                            requiredMark={false}
                        >
                            <Row gutter={[24, 0]}>
                                <Col xs={24} md={12}>
                                    <Form.Item
                                        label="Họ và tên"
                                        name="name"
                                        rules={[
                                            { required: true, message: "Vui lòng nhập tên khách hàng" },
                                            { whitespace: true, message: "Tên khách hàng không được để trống" },
                                        ]}
                                    >
                                        <Input
                                            placeholder="Nhập họ và tên"
                                            prefix={renderInputPrefix(<UserOutlined />)}
                                        />
                                    </Form.Item>
                                </Col>

                                {isEdit ? (
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Mã khách hàng"
                                            name="code"
                                            rules={[
                                                { required: true, message: "Vui lòng nhập mã khách hàng" },
                                                { whitespace: true, message: "Mã khách hàng không được để trống" },
                                            ]}
                                        >
                                            <Input
                                                placeholder="Nhập mã khách hàng"
                                                prefix={renderInputPrefix(<SafetyCertificateOutlined />)}
                                            />
                                        </Form.Item>
                                    </Col>
                                ) : null}

                                <Col xs={24} md={12}>
                                    <Form.Item
                                        label="Email"
                                        name="email"
                                        rules={[
                                            { type: "email", message: "Vui lòng nhập đúng định dạng email" },
                                            {
                                                validator: async (_, value?: string) => {
                                                    if (!value || normalizeCustomerEmail(value)) {
                                                        return;
                                                    }

                                                    throw new Error("Vui lòng nhập đúng định dạng email");
                                                },
                                            },
                                        ]}
                                    >
                                        <Input
                                            placeholder="Nhập email"
                                            prefix={renderInputPrefix(<MailOutlined />)}
                                        />
                                    </Form.Item>
                                </Col>

                                <Col xs={24} md={12}>
                                    <Form.Item
                                        label="Số điện thoại"
                                        name="phone"
                                        rules={[
                                            { required: true, message: "Vui lòng nhập số điện thoại" },
                                            {
                                                validator: async (_, value?: string) => {
                                                    if (value && isValidCustomerPhone(value)) {
                                                        return;
                                                    }

                                                    throw new Error("Số điện thoại phải có từ 8 đến 15 chữ số");
                                                },
                                            },
                                        ]}
                                    >
                                        <Input
                                            placeholder="Nhập số điện thoại"
                                            prefix={renderInputPrefix(<PhoneOutlined />)}
                                        />
                                    </Form.Item>
                                </Col>

                                {isEdit ? (
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label="Trạng thái tài khoản"
                                            name="status"
                                            rules={[{ required: true, message: "Vui lòng chọn trạng thái" }]}
                                        >
                                            <Select options={CUSTOMER_STATUS_OPTIONS as never} />
                                        </Form.Item>
                                    </Col>
                                ) : null}

                                <Col xs={24} md={12}>
                                    <Form.Item label="Nhóm VIP" name="vip_group">
                                        <Input
                                            placeholder="Nhập nhóm VIP"
                                            prefix={renderInputPrefix(<SafetyCertificateOutlined />)}
                                        />
                                    </Form.Item>
                                </Col>

                                <Col xs={24} md={12}>
                                    <Form.Item label="Tỉnh / Thành phố" name="province">
                                        <Input
                                            placeholder="Nhập tỉnh / thành phố"
                                            prefix={renderInputPrefix(<EnvironmentOutlined />)}
                                        />
                                    </Form.Item>
                                </Col>

                                <Col xs={24} md={12}>
                                    <Form.Item label="Quận / Huyện" name="district">
                                        <Input
                                            placeholder="Nhập quận / huyện"
                                            prefix={renderInputPrefix(<EnvironmentOutlined />)}
                                        />
                                    </Form.Item>
                                </Col>

                                <Col xs={24}>
                                    <Form.Item label="Phường / Xã" name="ward">
                                        <Input
                                            placeholder="Nhập phường / xã"
                                            prefix={renderInputPrefix(<EnvironmentOutlined />)}
                                        />
                                    </Form.Item>
                                </Col>

                                <Col xs={24}>
                                    <Form.Item label="Địa chỉ chi tiết" name="address">
                                        <Input
                                            placeholder="Nhập địa chỉ chi tiết"
                                            prefix={renderInputPrefix(<EnvironmentOutlined />)}
                                        />
                                    </Form.Item>
                                </Col>

                                <Col xs={24}>
                                    <Form.Item label="Ghi chú" name="note">
                                        <TextArea
                                            placeholder="Nhập ghi chú nội bộ hoặc lưu ý giao nhận"
                                            style={textAreaStyle}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Form>
                    </Spin>
                </div>

                <div style={footerStyle}>
                    <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                        <Space size={10}>
                            <SolutionOutlined style={{ color: "#7d8798" }} />
                            <Text type="secondary">Giữ nguyên logic xử lý và payload hiện tại.</Text>
                        </Space>
                        <Space size={14}>
                            <Button onClick={onClose}>Hủy</Button>
                            <Button
                                {...saveButtonProps}
                                htmlType="submit"
                                onClick={() => form.submit()}
                                type="primary"
                            >
                                {copy.submitLabel}
                            </Button>
                        </Space>
                    </Flex>
                </div>
            </Modal>
        </ConfigProvider>
    );
};
