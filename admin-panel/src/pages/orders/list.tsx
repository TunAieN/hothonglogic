import { useMemo, useState } from "react";
import { EditButton, List, NumberField, ShowButton, useTable } from "@refinedev/antd";
import {
    Avatar,
    Button,
    Card,
    Col,
    DatePicker,
    Form,
    Input,
    Row,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type {
    FilterValue,
    SorterResult,
    TableCurrentDataSource,
    TablePaginationConfig,
} from "antd/es/table/interface";
import {
    CarOutlined,
    CheckCircleOutlined,
    ReloadOutlined,
    ShoppingOutlined,
    UserOutlined,
} from "@ant-design/icons";
import type { IOrder, User } from "../../interfaces";

const { Search } = Input;
const { Text } = Typography;

const fullWidthStyle = { width: "100%" };
const filterCardBodyStyle = { padding: 16 };
const compactFormItemStyle = { marginBottom: 8 };
const filterActionsStyle = { marginBottom: 0, marginTop: 4 };

type OrderStatus = IOrder["status"];

type DateFilterValue = {
    startOf: (unit: "day") => DateFilterValue;
    endOf: (unit: "day") => DateFilterValue;
    valueOf: () => number;
};

type OrderFilterValues = {
    search?: string;
    customerId?: string;
    userId?: string;
    orderCode?: string;
    status?: OrderStatus;
    createdFrom?: DateFilterValue;
    createdTo?: DateFilterValue;
};

type SelectOption = {
    label: string;
    value: string;
};

const STATUS_COLOR: Record<OrderStatus, string> = {
    pending: "orange",
    shipped: "cyan",
    delivered: "green",
    cancelled: "red",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
    pending: "Pending",
    shipped: "Shipped",
    delivered: "Delivered",
    cancelled: "Cancelled",
};

const STATUS_OPTIONS: SelectOption[] = Object.entries(STATUS_LABEL).map(
    ([value, label]) => ({
        value,
        label,
    }),
);

const normalizeText = (value?: string | number | null) =>
    String(value ?? "")
        .trim()
        .toLowerCase();

const getOrderCustomerId = (order: IOrder) =>
    order.customer_id ?? order.customer?.id ?? "";

const getOrderStaff = (order: IOrder): User | undefined => order.creator.id ? order.creator : undefined;


const formatDate = (value?: string) =>
    value ? new Date(value).toLocaleDateString() : "-";

const getOrderCreatedTime = (value?: string) => {
    if (!value) {
        return undefined;
    }

    const time = new Date(value).getTime();

    return Number.isNaN(time) ? undefined : time;
};

const buildRelationOptions = (
    orders: readonly IOrder[],
    getRelation: (order: IOrder) => User | undefined,
) => {
    const optionMap = new Map<string, string>();

    orders.forEach((order) => {
        const relation = getRelation(order);

        if (relation?.id && relation.name) {
            optionMap.set(relation.id, relation.name);
        }
    });

    return Array.from(optionMap, ([value, label]) => ({ value, label }));
};

const orderMatchesFilters = (order: IOrder, filters: OrderFilterValues) => {
    const search = normalizeText(filters.search);
    const orderCode = normalizeText(filters.orderCode);
    const customer = order.customer;
    const staff = getOrderStaff(order);
    const createdTime = getOrderCreatedTime(order.created_at);
    const createdFrom = filters.createdFrom?.startOf("day").valueOf();
    const createdTo = filters.createdTo?.endOf("day").valueOf();

    const searchableText = [
        order.id,
        order.order_code,
        order.status,
        customer?.name,
        customer?.email,
        staff?.name,
        staff?.id,   
    ]
        .map(normalizeText)
        .join(" ");

    if (search && !searchableText.includes(search)) {
        return false;
    }

    if (orderCode && !normalizeText(order.order_code).includes(orderCode)) {
        return false;
    }

    if (filters.customerId && getOrderCustomerId(order) !== filters.customerId) {
        return false;
    }

    if (filters.userId && (order.creator.id ?? staff?.id ?? "") !== filters.userId) {
        return false;
    }

    if (filters.status && order.status !== filters.status) {
        return false;
    }

    if (createdFrom && (!createdTime || createdTime < createdFrom)) {
        return false;
    }

    if (createdTo && (!createdTime || createdTime > createdTo)) {
        return false;
    }

    return true;
};

export const OrderList = () => {
    const [filterForm] = Form.useForm<OrderFilterValues>();
    const [filters, setFilters] = useState<OrderFilterValues>({});
    const { tableProps } = useTable<IOrder>({
        resource: "orders",
        syncWithLocation: true,
    });
    console.log("tableProps", tableProps);
    const orders = useMemo(
        () => tableProps.dataSource ?? [],
        [tableProps.dataSource],
    );
    const filteredOrders = useMemo(
        () => orders.filter((order) => orderMatchesFilters(order, filters)),
        [orders, filters],
    );
    const totalOrders =
        typeof tableProps.pagination === "object"
            ? tableProps.pagination.total ?? orders.length
            : orders.length;
    const pendingOrders = orders.filter((order) => order.status === "pending").length;
    const deliveredOrders = orders.filter(
        (order) => order.status === "delivered",
    ).length;
    const customerOptions = buildRelationOptions(orders, (order) => order.customer);
    const staffOptions = buildRelationOptions(orders, getOrderStaff);
    const pagination: false | TablePaginationConfig | undefined =
        tableProps.pagination === false
            ? false
            : {
                  current: tableProps.pagination?.current,
                  pageSize: tableProps.pagination?.pageSize,
                  total: filteredOrders.length,
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
        tableFilters: Record<string, FilterValue | null>,
        sorter: SorterResult<IOrder> | SorterResult<IOrder>[],
        extra: TableCurrentDataSource<IOrder>,
    ) => {
        tableProps.onChange?.(
            pagination as never,
            tableFilters as never,
            sorter as never,
            extra as never,
        );
    };

    const handleFilterSubmit = (values: OrderFilterValues) => {
        setFilters({
            search: values.search?.trim() || undefined,
            customerId: values.customerId || undefined,
            userId: values.userId || undefined,
            orderCode: values.orderCode?.trim() || undefined,
            status: values.status,
            createdFrom: values.createdFrom,
            createdTo: values.createdTo,
        });
    };

    const handleFilterReset = () => {
        filterForm.resetFields();
        setFilters({});
    };

    const columns: ColumnsType<IOrder> = [
        {
            title: "Order Code",
            dataIndex: "order_code",
            key: "order_code",
            width: 160,
            render: (value?: IOrder["order_code"]) =>
                value ? <Text strong>{value}</Text> : <Text type="secondary">-</Text>,
        },
        {
            title: "Customer",
            dataIndex: ["customer", "name"],
            key: "customer",
            render: (_, record) => (
                <Space>
                    <Avatar
                        src={record.customer?.avatar}
                        icon={<UserOutlined />}
                        alt={record.customer?.name}
                    />
                    <Space orientation="vertical" size={0}>
                        <Text strong>{record.customer?.name ?? "-"}</Text>
                        <Text type="secondary">{record.customer?.email ?? "-"}</Text>
                    </Space>
                </Space>
            ),
        },
        {
            title: "Staff",
            key: "staff",
            render: (_, record) => {
                const staff = getOrderStaff(record);

                return staff?.name ? <Text>{staff.name}</Text> : <Text type="secondary">-</Text>;
            },
        },
    
        {
            title: "Total",
            dataIndex: "total_amount",
            key: "total_amount",
            align: "right",
            render: (value?: IOrder["total_amount"]) =>
                typeof value === "number" ? (
                    <NumberField
                        value={value}
                        options={{ style: "currency", currency: "USD" }}
                    />
                ) : (
                    <Text type="secondary">-</Text>
                ),
        },
        {
            title: "Status",
            dataIndex: "status",
            key: "status",
            render: (status?: OrderStatus) =>
                status ? (
                    <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>
                ) : (
                    <Text type="secondary">-</Text>
                ),
        },
        {
            title: "Created At",
            dataIndex: "created_at",
            key: "created_at",
            render: (value?: IOrder["created_at"]) => <Text>{formatDate(value)}</Text>,
        },
        {
            title: "Actions",
            key: "actions",
            align: "right",
            render: (_, record) => (
                <Space>
                    <EditButton hideText size="small" recordItemId={record.id} />
                    <ShowButton hideText size="small" recordItemId={record.id} />
                </Space>
            ),
        },
    ];

    return (
        <List
            title="Orders"
            headerButtons={() => (
                <Button icon={<ReloadOutlined />} onClick={() => handleFilterReset()}>
                    Reset Filters
                </Button>
            )}
        >
            <Space orientation="vertical" size="large" style={{ width: "100%" }}>
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}>
                        <Card>
                            <Statistic
                                title="Total Orders"
                                value={totalOrders}
                                prefix={<ShoppingOutlined />}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} md={8}>
                        <Card>
                            <Statistic
                                title="Pending Orders"
                                value={pendingOrders}
                                prefix={<CarOutlined />}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} md={8}>
                        <Card>
                            <Statistic
                                title="Delivered Orders"
                                value={deliveredOrders}
                                prefix={<CheckCircleOutlined />}
                            />
                        </Card>
                    </Col>
                </Row>

                <Card size="small" styles={{ body: filterCardBodyStyle }}>
                    <Form<OrderFilterValues>
                        form={filterForm}
                        layout="vertical"
                        onFinish={handleFilterSubmit}
                        size="middle"
                    >
                        <Row gutter={[12, 8]}>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="customerId"
                                    label="Khách hàng"
                                    style={compactFormItemStyle}
                                >
                                    <Select
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        options={customerOptions}
                                        placeholder="Chọn khách hàng"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="staffId"
                                    label="Nhân viên CSKH"
                                    style={compactFormItemStyle}
                                >
                                    <Select
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        options={staffOptions}
                                        placeholder="Chọn nhân viên CSKH"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="shippingCompanyId"
                                    label="Công ty chuyển phát"
                                    style={compactFormItemStyle}
                                >
                                    <Select
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        // options={shippingCompanyOptions}
                                        placeholder="Chọn công ty chuyển phát"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <Form.Item
                                    name="search"
                                    label="Tìm chung"
                                    style={compactFormItemStyle}
                                >
                                    <Search
                                        allowClear
                                        placeholder="Tất cả"
                                        onSearch={() => filterForm.submit()}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <Form.Item
                                    name="orderCode"
                                    label="Mã vận đơn"
                                    style={compactFormItemStyle}
                                >
                                    <Input allowClear placeholder="Nhập mã vận đơn" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={4}>
                                <Form.Item
                                    name="status"
                                    label="Trạng thái"
                                    style={compactFormItemStyle}
                                >
                                    <Select
                                        allowClear
                                        options={STATUS_OPTIONS}
                                        placeholder="Tất cả"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={4}>
                                <Form.Item
                                    name="createdFrom"
                                    label="Tạo từ ngày"
                                    style={compactFormItemStyle}
                                >
                                    <DatePicker
                                        style={fullWidthStyle}
                                        placeholder="Từ ngày"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={4}>
                                <Form.Item
                                    name="createdTo"
                                    label="Đến ngày"
                                    style={compactFormItemStyle}
                                >
                                    <DatePicker
                                        style={fullWidthStyle}
                                        placeholder="Đến ngày"
                                    />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Form.Item style={filterActionsStyle}>
                            <Space>
                                <Button type="primary" htmlType="submit">
                                    Tìm kiếm
                                </Button>
                                <Button onClick={handleFilterReset}>Reset</Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Card>

                <Card>
                    <Table<IOrder>
                        columns={columns}
                        dataSource={filteredOrders}
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
