import type { ReactNode } from "react";
import { EditButton, List, ShowButton, useTable } from "@refinedev/antd";
import { useNavigate } from "react-router";

import {
    Avatar,
    Button,
    Card,
    Col,
    Row,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
    CheckCircleOutlined,
    FilterOutlined,
    PlusOutlined,
    StopOutlined,
    TeamOutlined,
    UserOutlined,
} from "@ant-design/icons";
import type {
    FilterValue,
    SorterResult,
    TableCurrentDataSource,
    TablePaginationConfig,
} from "antd/es/table/interface";
import type { ICustomer } from "../../interfaces";

const { Text, Title } = Typography;

const STATUS_COLOR: Record<ICustomer["status"], string> = {
    active: "green",
    inactive: "default",
    blocked: "red",
};

const formatStatus = (status: ICustomer["status"]) =>
    status.charAt(0).toUpperCase() + status.slice(1);

const getOrderCount = (customer: ICustomer) =>
     customer.orders_count ?? customer.orders?.length ?? 0;

const getCustomerActivityRate = (customers: readonly ICustomer[]) => {
    if (customers.length === 0) {
        return 0;
    }

    const activeCustomers = customers.filter(
        (customer) => customer.status === "active",
    ).length;

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
        <Statistic
            title={title}
            value={value}
            prefix={prefix}
            suffix={valueSuffix}
        />
        <Text type="secondary">{description}</Text>
    </Card>
);

export const CustomerList = () => {
    const navigate = useNavigate();
    const { tableProps } = useTable<ICustomer>({
        resource: "customers",
        syncWithLocation: true,
    });

    const customers = tableProps.dataSource ?? [];
    const totalCustomers =
        typeof tableProps.pagination === "object"
            ? tableProps.pagination.total ?? customers.length
            : customers.length;
    const activeCustomers = customers.filter(
        (customer) => customer.status === "active",
    ).length;
    const blockedCustomers = customers.filter(
        (customer) => customer.status === "blocked",
    ).length;
    const activityRate = getCustomerActivityRate(customers);
    const pagination: false | TablePaginationConfig | undefined =
        tableProps.pagination === false
            ? false
            : {
                  current: tableProps.pagination?.current,
                  pageSize: tableProps.pagination?.pageSize,
                  total: tableProps.pagination?.total,
                  showSizeChanger:
                      typeof tableProps.pagination?.showSizeChanger === "boolean"
                          ? tableProps.pagination.showSizeChanger
                          : undefined,
                  size:
                      tableProps.pagination?.size === "default"
                          ? undefined
                          : tableProps.pagination?.size,
              };

    const handleTableChange = (
        pagination: TablePaginationConfig,
        filters: Record<string, FilterValue | null>,
        sorter: SorterResult<ICustomer> | SorterResult<ICustomer>[],
        extra: TableCurrentDataSource<ICustomer>,
    ) => {
        tableProps.onChange?.(
            pagination as never,
            filters as never,
            sorter as never,
            extra as never,
        );
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
                    <Avatar
                        src={record.avatar}
                        icon={<UserOutlined />}
                        alt={record.name}
                    />
                    <Space orientation="vertical" size={0}>
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
            title: "Address",
            dataIndex: "address",
            key: "address",
            ellipsis: true,
            render: (value?: ICustomer["address"]) =>
                value ? <Text>{value}</Text> : <Text type="secondary">-</Text>,
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
                value ? (
                    <Text>{new Date(value).toLocaleDateString()}</Text>
                ) : (
                    <Text type="secondary">-</Text>
                ),
        },
        {
            title: "Actions",
            key: "actions",
            align: "right",
            render: (_, record: ICustomer) => (
                <Space>
                    <EditButton hideText size="small" recordItemId={record.id} />
                    <ShowButton hideText size="small" recordItemId={record.id} />
                </Space>
            ),
        },
    ];

    return (
        <List breadcrumb={false} headerButtons={() => null} title={false}>
            <Space orientation="vertical" size="large" style={{ width: "100%" }}>
                <Row align="middle" justify="space-between" gutter={[16, 16]}>
                    <Col>
                        <Space orientation="vertical" size={4}>
                            <Title level={2}>Customers</Title>
                            <Text type="secondary">
                                Manage your national logistics partner network and track individual account performance.
                            </Text>
                        </Space>
                    </Col>
                    <Col>
                        <Space>
                            <Button icon={<FilterOutlined />}>Filter</Button>
                            <Button
                                icon={<PlusOutlined />}
                                className="customer-list-add-button"
                                type="primary"
                                onClick={() => {
                                    // Handle add customer action
                                    console.log("Add Customer clicked");
                                    navigate("/customers/create");

                                }}
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

                <Card>
                    <Table<ICustomer>
                        columns={columns}
                        dataSource={customers}
                        loading={tableProps.loading}
                        onChange={handleTableChange}
                        rowKey="id"
                        pagination={pagination}
                    />
                </Card>
            </Space>
        </List>
    );
};
