import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DeleteButton, List, ShowButton, useTable } from "@refinedev/antd";
import { Button, Card, Col, DatePicker, Form, Input, Row, Select, Space, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import {
    CheckCircleOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    ReloadOutlined,
    StopOutlined,
    TeamOutlined,
    UserOutlined,
} from "@ant-design/icons";
import type { CrudFilter } from "@refinedev/core";
import type { ICustomer } from "../../interfaces";
import { CustomerFormModal } from "./components/CustomerFormModal";

const { Search } = Input;
const { Text, Title } = Typography;

const fullWidthStyle = { width: "100%" };
const compactFormItemStyle = { marginBottom: 8 };
const filterActionsStyle = { marginBottom: 0, marginTop: 4 };

const STATUS_COLOR: Record<ICustomer["status"], string> = {
    active: "green",
    inactive: "default",
    blocked: "red",
};

const STATUS_OPTIONS = [
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
    { label: "Blocked", value: "blocked" },
];

type DateFilterValue = {
    startOf: (unit: "day") => DateFilterValue;
    endOf: (unit: "day") => DateFilterValue;
    toISOString: () => string;
};

type CustomerFilterValues = {
    search?: string;
    status?: ICustomer["status"];
    vipGroup?: string;
    province?: string;
    phone?: string;
    createdFrom?: DateFilterValue;
    createdTo?: DateFilterValue;
};

const formatStatus = (status: ICustomer["status"]) =>
    status.charAt(0).toUpperCase() + status.slice(1);

const getOrderCount = (customer: ICustomer) =>
    customer.orders_count ?? customer.orders?.length ?? 0;

const getCustomerLocation = (customer: ICustomer) =>
    [customer.ward, customer.district, customer.province].filter(Boolean).join(", ");

const getCustomerActivityRate = (customers: readonly ICustomer[]) => {
    if (customers.length === 0) {
        return 0;
    }

    const activeCustomers = customers.filter((customer) => customer.status === "active").length;

    return Math.round((activeCustomers / customers.length) * 100);
};

type CustomerSummaryCardProps = {
    title: string;
    value: number;
    prefix: ReactNode;
    description: string;
    valueSuffix?: string;
};

const CustomerSummaryCard = ({
    title,
    value,
    prefix,
    description,
    valueSuffix,
}: CustomerSummaryCardProps) => (
    <Card size="small" style={{ height: "100%" }}>
        <Statistic title={title} value={value} prefix={prefix} suffix={valueSuffix} />
        <Text type="secondary">{description}</Text>
    </Card>
);

export const CustomerList = () => {
    const [filterForm] = Form.useForm<CustomerFilterValues>();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
    const { tableProps, tableQuery, setFilters, setCurrentPage } = useTable<ICustomer>({
        resource: "customers",
        syncWithLocation: true,
    });
    const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const customers = tableProps.dataSource ?? [];
    const totalCustomers =
        typeof tableProps.pagination === "object"
            ? tableProps.pagination.total ?? customers.length
            : customers.length;
    const activeCustomers = customers.filter((customer) => customer.status === "active").length;
    const blockedCustomers = customers.filter((customer) => customer.status === "blocked").length;
    const activityRate = getCustomerActivityRate(customers);
    const tableComponentProps = tableProps as TableProps<ICustomer>;

    const buildCustomerFilters = (values: CustomerFilterValues): CrudFilter[] =>
        [
            {
                field: "search",
                operator: "contains" as const,
                value: values.search?.trim() || undefined,
            },
            {
                field: "status",
                operator: "eq" as const,
                value: values.status || undefined,
            },
            {
                field: "vip_group",
                operator: "contains" as const,
                value: values.vipGroup?.trim() || undefined,
            },
            {
                field: "province",
                operator: "contains" as const,
                value: values.province?.trim() || undefined,
            },
            {
                field: "phone",
                operator: "contains" as const,
                value: values.phone?.trim() || undefined,
            },
            {
                field: "created_from",
                operator: "gte" as const,
                value: values.createdFrom?.startOf("day").toISOString(),
            },
            {
                field: "created_to",
                operator: "lte" as const,
                value: values.createdTo?.endOf("day").toISOString(),
            },
        ].filter((filter) => filter.value !== undefined && filter.value !== "");

    const applyCustomerFilters = (values: CustomerFilterValues) => {
        const nextFilters = buildCustomerFilters(values);

        setCurrentPage(1);
        setFilters(nextFilters, "replace");
    };

    const debouncedApplyCustomerFilters = useMemo(
        () => (values: CustomerFilterValues) => {
            if (filterDebounceRef.current) {
                clearTimeout(filterDebounceRef.current);
            }

            filterDebounceRef.current = setTimeout(() => {
                applyCustomerFilters(values);
            }, 500);
        },
        [setCurrentPage, setFilters],
    );

    useEffect(() => () => {
        if (filterDebounceRef.current) {
            clearTimeout(filterDebounceRef.current);
        }
    }, []);

    const handleFilterSubmit = (values: CustomerFilterValues) => {
        if (filterDebounceRef.current) {
            clearTimeout(filterDebounceRef.current);
            filterDebounceRef.current = null;
        }

        applyCustomerFilters(values);
    };

    const handleFilterReset = () => {
        filterForm.resetFields();
        if (filterDebounceRef.current) {
            clearTimeout(filterDebounceRef.current);
            filterDebounceRef.current = null;
        }
        setCurrentPage(1);
        setFilters([], "replace");
    };

    const columns: ColumnsType<ICustomer> = [
        {
            title: "ID",
            dataIndex: "id",
            key: "id",
            width: 96,
        },
        {
            title: "Customer",
            dataIndex: "name",
            key: "name",
            render: (_, record) => (
                <Space>
                    <UserOutlined />
                    <Space direction="vertical" size={0}>
                        <Text strong>{record.name}</Text>
                        <Text type="secondary">{record.email}</Text>
                    </Space>
                </Space>
            ),
        },
        {
            title: "Phone",
            dataIndex: "phone",
            key: "phone",
            render: (value?: ICustomer["phone"]) =>
                value ? <Text>{value}</Text> : <Text type="secondary">-</Text>,
        },
        {
            title: "VIP Group",
            dataIndex: "vip_group",
            key: "vip_group",
            render: (value?: ICustomer["vip_group"]) =>
                value ? <Tag color="gold">{value}</Tag> : <Text type="secondary">-</Text>,
        },
        {
            title: "Location",
            key: "location",
            ellipsis: true,
            render: (_, record) => {
                const location = getCustomerLocation(record);

                return location ? <Text>{location}</Text> : <Text type="secondary">-</Text>;
            },
        },
        {
            title: "Orders",
            key: "orders",
            align: "right",
            render: (_, record) => getOrderCount(record),
        },
        {
            title: "Status",
            dataIndex: "status",
            key: "status",
            render: (status: ICustomer["status"]) => (
                <Tag color={STATUS_COLOR[status]}>{formatStatus(status)}</Tag>
            ),
        },
        {
            title: "Created At",
            dataIndex: "created_at",
            key: "created_at",
            render: (value?: ICustomer["created_at"]) =>
                value ? <Text>{new Date(value).toLocaleDateString()}</Text> : <Text type="secondary">-</Text>,
        },
        {
            title: "Actions",
            key: "actions",
            align: "right",
            render: (_, record: ICustomer) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        onClick={() => setEditingCustomerId(record.id)}
                        size="small"
                    />
                    <ShowButton hideText size="small" recordItemId={record.id} />
                    <DeleteButton
                        hideText
                        size="small"
                        icon={<DeleteOutlined />}
                        recordItemId={record.id}
                        resource="customers"
                    />
                </Space>
            ),
        },
    ];

    return (
        <List breadcrumb={false} headerButtons={() => null} title={false}>
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
                <Row align="middle" justify="space-between" gutter={[16, 16]}>
                    <Col>
                        <Space direction="vertical" size={4}>
                            <Title level={2}>Customers</Title>
                            <Text type="secondary">
                                Manage your national logistics partner network and track individual account performance.
                            </Text>
                        </Space>
                    </Col>
                    <Col>
                        <Space>
                            <Button icon={<ReloadOutlined />} onClick={handleFilterReset}>
                                Reset Filters
                            </Button>
                            <Button
                                icon={<PlusOutlined />}
                                className="customer-list-add-button"
                                type="primary"
                                onClick={() => setIsCreateModalOpen(true)}
                            >
                                Add Customer
                            </Button>
                        </Space>
                    </Col>
                </Row>

                <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}>
                        <CustomerSummaryCard
                            title="Total Partners"
                            value={totalCustomers}
                            prefix={<TeamOutlined />}
                            description="All registered customers"
                        />
                    </Col>
                    <Col xs={24} md={8}>
                        <CustomerSummaryCard
                            title="Active Accounts"
                            value={activeCustomers}
                            prefix={<CheckCircleOutlined />}
                            description={`${activityRate}% of listed customers`}
                        />
                    </Col>
                    <Col xs={24} md={8}>
                        <CustomerSummaryCard
                            title="Blocked Customers"
                            value={blockedCustomers}
                            prefix={<StopOutlined />}
                            description="Requires account review"
                        />
                    </Col>
                </Row>

                <Card size="small">
                    <Form<CustomerFilterValues>
                        form={filterForm}
                        layout="vertical"
                        onFinish={handleFilterSubmit}
                        onValuesChange={(_, allValues) => {
                            debouncedApplyCustomerFilters(allValues);
                        }}
                    >
                        <Row gutter={[12, 8]}>
                            <Col xs={24} md={10}>
                                <Form.Item
                                    name="search"
                                    label="Search"
                                    style={compactFormItemStyle}
                                >
                                    <Search
                                        allowClear
                                        placeholder="Name, code, phone, email, address"
                                        onSearch={() => handleFilterSubmit(filterForm.getFieldsValue())}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={7}>
                                <Form.Item
                                    name="status"
                                    label="Status"
                                    style={compactFormItemStyle}
                                >
                                    <Select
                                        allowClear
                                        options={STATUS_OPTIONS}
                                        placeholder="All statuses"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={7}>
                                <Form.Item
                                    name="vipGroup"
                                    label="VIP Group"
                                    style={compactFormItemStyle}
                                >
                                    <Input allowClear placeholder="Enter VIP group" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={8}>
                                <Form.Item
                                    name="phone"
                                    label="Phone"
                                    style={compactFormItemStyle}
                                >
                                    <Input allowClear placeholder="Enter phone number" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={8}>
                                <Form.Item
                                    name="province"
                                    label="Province"
                                    style={compactFormItemStyle}
                                >
                                    <Input allowClear placeholder="Enter province" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={4}>
                                <Form.Item
                                    name="createdFrom"
                                    label="Created From"
                                    style={compactFormItemStyle}
                                >
                                    <DatePicker style={fullWidthStyle} placeholder="Start date" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} md={4}>
                                <Form.Item
                                    name="createdTo"
                                    label="Created To"
                                    style={compactFormItemStyle}
                                >
                                    <DatePicker style={fullWidthStyle} placeholder="End date" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item style={filterActionsStyle}>
                            <Space>
                                <Button
                                    type="primary"
                                    onClick={() => handleFilterSubmit(filterForm.getFieldsValue())}
                                >
                                    Search
                                </Button>
                                <Button onClick={handleFilterReset}>Reset</Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Card>

                <Card>
                    <Table<ICustomer> {...tableComponentProps} columns={columns} rowKey="id" />
                </Card>
            </Space>

            <CustomerFormModal
                mode="create"
                onClose={() => setIsCreateModalOpen(false)}
                onCompleted={async () => {
                    await tableQuery?.refetch?.();
                }}
                open={isCreateModalOpen}
            />

            <CustomerFormModal
                customerId={editingCustomerId ?? undefined}
                mode="edit"
                onClose={() => setEditingCustomerId(null)}
                onCompleted={async () => {
                    await tableQuery?.refetch?.();
                }}
                open={Boolean(editingCustomerId)}
            />
        </List>
    );
};
