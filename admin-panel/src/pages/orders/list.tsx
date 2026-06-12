import { useEffect, useMemo, useRef, useState } from "react";
import type { CrudFilter, HttpError } from "@refinedev/core";
import {
    DeleteButton,
    EditButton,
    List,
    NumberField,
    ShowButton,
    useTable,
} from "@refinedev/antd";
import { useUpdate } from "@refinedev/core";
import {
    App,
    Avatar,
    Button,
    Card,
    Col,
    DatePicker,
    Form,
    Input,
    Modal,
    Row,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography,
} from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import {
    CarOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    ReloadOutlined,
    ShoppingOutlined,
    UserOutlined,
} from "@ant-design/icons";
import type { ICustomer, IOrder, User } from "../../interfaces";
import { dataProvider } from "../../providers/dataProvider";
import { getTtlCache, setTtlCache } from "../../utils/ttlCache";
import type { OrderUpdateInput } from "../../types";

const { Search } = Input;
const { Text } = Typography;

const fullWidthStyle = { width: "100%" };
const filterCardBodyStyle = { padding: 16 };
const compactFormItemStyle = { marginBottom: 8 };
const filterActionsStyle = { marginBottom: 0, marginTop: 4 };
const CUSTOMER_OPTIONS_CACHE_PREFIX = "orders:customer-options";
const STAFF_OPTIONS_CACHE_KEY = "orders:staff-options";
const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;

type OrderStatus = IOrder["status"];

type DateFilterValue = {
    startOf: (unit: "day") => DateFilterValue;
    endOf: (unit: "day") => DateFilterValue;
    toISOString: () => string;
};

type OrderFilterValues = {
    search?: string;
    customerId?: string;
    staffId?: string;
    orderCode?: string;
    status?: OrderStatus;
    createdFrom?: DateFilterValue;
    createdTo?: DateFilterValue;
};

type SelectOption = {
    label: string;
    value: string;
};

type RejectOrderFormValues = {
    reason: string;
};

const STATUS_META: Record<string, { color: string; label: string }> = {
    draft: { color: "default", label: "Nháp" },
    pending: { color: "orange", label: "Chờ duyệt" },
    approved: { color: "green", label: "Đã duyệt" },
    confirmed: { color: "green", label: "Đã duyệt" },
    deposit: { color: "gold", label: "Đã đặt cọc" },
    receiving: { color: "cyan", label: "Đang nhận hàng" },
    cancelled: { color: "red", label: "Đã hủy" },
    rejected: { color: "volcano", label: "Đã từ chối" },
    shipped: { color: "cyan", label: "Đang vận chuyển" },
    delivered: { color: "blue", label: "Đã giao" },
    completed: { color: "green", label: "Hoàn thành" },
    complaint: { color: "magenta", label: "Khiếu nại" },
    awaiting_tracking: { color: "geekblue", label: "Chờ mã vận đơn" },
};

const getStatusMeta = (status?: string) =>
    STATUS_META[normalizeText(status)] ?? { color: "default", label: status || "-" };

const STATUS_OPTIONS: SelectOption[] = [
    { value: "draft", label: "Nháp" },
    { value: "pending", label: "Chờ duyệt" },
    { value: "approved", label: "Đã duyệt" },
    { value: "deposit", label: "Đã đặt cọc" },
    { value: "receiving", label: "Đang nhận hàng" },
    { value: "shipped", label: "Đang vận chuyển" },
    { value: "delivered", label: "Đã giao" },
    { value: "completed", label: "Hoàn thành" },
    { value: "complaint", label: "Khiếu nại" },
    { value: "cancelled", label: "Đã hủy" },
    { value: "awaiting_tracking", label: "Chờ mã vận đơn" },
];

STATUS_META.awaiting_deposit = { color: "gold", label: "Chờ đặt cọc" };
STATUS_META.deposited = { color: "green", label: "Đã đặt cọc" };
STATUS_META.purchasing = { color: "blue", label: "Đang đặt hàng" };
STATUS_META.awaiting_tracking = { color: "geekblue", label: "Chờ mã vận đơn" };

STATUS_OPTIONS.splice(2, 0,
    { value: "awaiting_deposit", label: "Chờ đặt cọc" },
    { value: "deposited", label: "Đã đặt cọc" },
    { value: "purchasing", label: "Đang đặt hàng" },
    { value: "awaiting_tracking", label: "Chờ mã vận đơn" },
);

STATUS_META["waiting_cn_warehouse"] = { color: "purple", label: "Chờ kho TQ nhận hàng" };
STATUS_OPTIONS.push({ value: "waiting_cn_warehouse", label: "Chờ kho TQ nhận hàng" });

const normalizeText = (value?: string | number | null) =>
    String(value ?? "")
        .trim()
        .toLowerCase();

const getOrderStaff = (order: IOrder): User | undefined =>
    order.creator?.id ? order.creator : undefined;

const formatDate = (value?: string) =>
    value ? new Date(value).toLocaleDateString() : "-";

const isOrderEditable = (status?: string) => normalizeText(status) === "pending";

const canManageTrackingFromList = (status?: string) =>
    ["awaiting_tracking", "waiting_cn_warehouse"].includes(normalizeText(status));

const buildSelectOptions = (
    records: ReadonlyArray<{ id?: string; name?: string | null; phone?: string | null }>,
) => {
    const optionMap = new Map<string, string>();

    records.forEach((record) => {
        if (!record.id || !record.name) {
            return;
        }

        const suffix = record.phone ? ` - ${record.phone}` : "";
        optionMap.set(record.id, `${record.name}${suffix}`);
    });

    return Array.from(optionMap, ([value, label]) => ({ value, label }));
};

export const OrderList = () => {
    const { message } = App.useApp();
    const [filterForm] = Form.useForm<OrderFilterValues>();
    const [rejectForm] = Form.useForm<RejectOrderFormValues>();
    const [customerSearch, setCustomerSearch] = useState("");
    const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");
    const [customerRecords, setCustomerRecords] = useState<ICustomer[]>([]);
    const [staffRecords, setStaffRecords] = useState<User[]>([]);
    const [isCustomersLoading, setIsCustomersLoading] = useState(false);
    const [isStaffLoading, setIsStaffLoading] = useState(false);
    const [rejectingOrder, setRejectingOrder] = useState<IOrder | null>(null);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [isRejecting, setIsRejecting] = useState(false);
    const { tableProps, tableQuery, setFilters, setCurrentPage } = useTable<IOrder>({
        resource: "orders",
        syncWithLocation: true,
    });
    const { mutateAsync: updateOrder } = useUpdate<IOrder, HttpError, OrderUpdateInput>();
    const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const orders = useMemo(() => tableProps.dataSource ?? [], [tableProps.dataSource]);
    const totalOrders =
        typeof tableProps.pagination === "object"
            ? tableProps.pagination.total ?? orders.length
            : orders.length;
    const pendingOrders = orders.filter((order) => order.status === "pending").length;
    const approvedOrders = orders.filter((order) => order.status === "purchasing").length;
    const customerOptions = useMemo(
        () => buildSelectOptions(customerRecords),
        [customerRecords],
    );
    const staffOptions = useMemo(
        () => buildSelectOptions(staffRecords),
        [staffRecords],
    );
    const { pagination: rawPagination, ...restTableComponentProps } =
        tableProps as TableProps<IOrder> & {
            pagination?: TableProps<IOrder>["pagination"] & {
                position?: unknown;
                placement?: unknown;
            };
        };
    const normalizedTablePagination =
        rawPagination && typeof rawPagination === "object"
            ? (() => {
                  const { position, ...pagination } = rawPagination;

                  return pagination;
              })()
            : rawPagination;

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedCustomerSearch(customerSearch.trim());
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [customerSearch]);

    useEffect(() => {
        let cancelled = false;
        const cacheKey = `${CUSTOMER_OPTIONS_CACHE_PREFIX}:${debouncedCustomerSearch || "default"}`;
        const cachedRecords = getTtlCache<ICustomer[]>(cacheKey);

        if (cachedRecords) {
            setCustomerRecords(cachedRecords);
            return () => {
                cancelled = true;
            };
        }

        setIsCustomersLoading(true);

        dataProvider
            .getList<ICustomer>({
                resource: "customers",
                pagination: {
                    currentPage: 1,
                    pageSize: 20,
                },
                filters: debouncedCustomerSearch
                    ? [
                          {
                              field: "search",
                              operator: "contains",
                              value: debouncedCustomerSearch,
                          },
                      ]
                    : [],
                meta: {
                    fields: ["id", "code", "name", "phone"],
                },
            })
            .then((response) => {
                if (cancelled) {
                    return;
                }

                setCustomerRecords(response.data);
                setTtlCache(cacheKey, response.data, LOOKUP_CACHE_TTL_MS);
            })
            .catch(() => {
                if (!cancelled) {
                    setCustomerRecords([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsCustomersLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [debouncedCustomerSearch]);

    useEffect(() => {
        let cancelled = false;
        const cachedRecords = getTtlCache<User[]>(STAFF_OPTIONS_CACHE_KEY);

        if (cachedRecords) {
            setStaffRecords(cachedRecords);
            return () => {
                cancelled = true;
            };
        }

        setIsStaffLoading(true);

        dataProvider
            .getList<User>({
                resource: "users",
                pagination: {
                    currentPage: 1,
                    pageSize: 1000,
                },
            })
            .then((response) => {
                if (cancelled) {
                    return;
                }

                setStaffRecords(response.data);
                setTtlCache(STAFF_OPTIONS_CACHE_KEY, response.data, LOOKUP_CACHE_TTL_MS);
            })
            .catch(() => {
                if (!cancelled) {
                    setStaffRecords([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsStaffLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const buildOrderFilters = (values: OrderFilterValues): CrudFilter[] =>
        [
            {
                field: "search",
                operator: "contains" as const,
                value: values.search?.trim() || undefined,
            },
            {
                field: "customer_id",
                operator: "eq" as const,
                value: values.customerId || undefined,
            },
            {
                field: "created_by",
                operator: "eq" as const,
                value: values.staffId || undefined,
            },
            {
                field: "order_code",
                operator: "contains" as const,
                value: values.orderCode?.trim() || undefined,
            },
            {
                field: "status",
                operator: "eq" as const,
                value: values.status || undefined,
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

    const applyOrderFilters = (values: OrderFilterValues) => {
        const nextFilters = buildOrderFilters(values);

        setCurrentPage(1);
        setFilters(nextFilters, "replace");
    };

    const debouncedApplyOrderFilters = useMemo(
        () => (values: OrderFilterValues) => {
            if (filterDebounceRef.current) {
                clearTimeout(filterDebounceRef.current);
            }

            filterDebounceRef.current = setTimeout(() => {
                applyOrderFilters(values);
            }, 500);
        },
        [setCurrentPage, setFilters],
    );

    useEffect(() => () => {
        if (filterDebounceRef.current) {
            clearTimeout(filterDebounceRef.current);
        }
    }, []);

    const handleFilterSubmit = (values: OrderFilterValues) => {
        if (filterDebounceRef.current) {
            clearTimeout(filterDebounceRef.current);
            filterDebounceRef.current = null;
        }

        applyOrderFilters(values);
    };

    const handleFilterReset = () => {
        filterForm.resetFields();
        setCustomerSearch("");
        setDebouncedCustomerSearch("");
        if (filterDebounceRef.current) {
            clearTimeout(filterDebounceRef.current);
            filterDebounceRef.current = null;
        }
        setCurrentPage(1);
        setFilters([], "replace");
    };

    const openRejectModal = (order: IOrder) => {
        if (!isOrderEditable(order.status)) {
            return;
        }

        setRejectingOrder(order);
        rejectForm.setFieldsValue({ reason: "" });
        setIsRejectModalOpen(true);
    };

    const closeRejectModal = () => {
        setIsRejectModalOpen(false);
        setRejectingOrder(null);
        rejectForm.resetFields();
    };

    const handleRejectOrder = async () => {
        if (!rejectingOrder?.id || !isOrderEditable(rejectingOrder.status)) {
            return;
        }

        try {
            setIsRejecting(true);
            const values = await rejectForm.validateFields();
            const reason = values.reason.trim();
            const nextNote = [rejectingOrder.note?.trim(), `[Từ chối đơn] ${reason}`]
                .filter(Boolean)
                .join("\n");

            await updateOrder({
                resource: "orders",
                id: rejectingOrder.id,
                values: {
                    status: "cancelled",
                    note: nextNote,
                },
            });

            await tableQuery?.refetch?.();
            closeRejectModal();
            message.success("Đã từ chối đơn hàng");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "Không thể từ chối đơn hàng.");
        } finally {
            setIsRejecting(false);
        }
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
            render: (status?: OrderStatus | string) =>
                status ? (
                    <Tag color={getStatusMeta(status).color}>{getStatusMeta(status).label}</Tag>
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
                    <Tooltip title="Xem chi tiết">
                        <ShowButton hideText size="small" recordItemId={record.id} />
                    </Tooltip>
                    {isOrderEditable(record.status) ? (
                        <Tooltip title="Chỉnh sửa đơn hàng">
                            <EditButton hideText size="small" recordItemId={record.id} />
                        </Tooltip>
                    ) : canManageTrackingFromList(record.status) ? (
                        <Tooltip title="Tracking">
                            <EditButton hideText size="small" recordItemId={record.id} />
                        </Tooltip>
                    ) : null}
                    {isOrderEditable(record.status) ? (
                        <Tooltip title="Từ chối đơn hàng">
                            <Button
                                danger
                                size="small"
                                icon={<CloseCircleOutlined />}
                                onClick={() => openRejectModal(record)}
                            />
                        </Tooltip>
                    ) : null}
                    {isOrderEditable(record.status) ? (
                        <Tooltip title="Xóa đơn hàng">
                            <DeleteButton
                                hideText
                                size="small"
                                icon={<DeleteOutlined />}
                                recordItemId={record.id}
                                resource="orders"
                            />
                        </Tooltip>
                    ) : null}
                </Space>
            ),
        },
    ];

    return (
        <List
            title="Orders"
            headerButtons={() => (
                <Button icon={<ReloadOutlined />} onClick={handleFilterReset}>
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
                                title="Purchasing Orders"
                                value={approvedOrders}
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
                        onValuesChange={(_, allValues) => {
                            debouncedApplyOrderFilters(allValues);
                        }}
                        size="middle"
                    >
                        <Row gutter={[12, 8]}>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="customerId"
                                    label="Customer"
                                    style={compactFormItemStyle}
                                >
                                    <Select
                                        allowClear
                                        showSearch
                                        filterOption={false}
                                        onSearch={setCustomerSearch}
                                        onClear={() => setCustomerSearch("")}
                                        options={customerOptions}
                                        placeholder="Select customer"
                                        loading={isCustomersLoading}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item
                                    name="staffId"
                                    label="Staff"
                                    style={compactFormItemStyle}
                                >
                                    <Select
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        options={staffOptions}
                                        placeholder="Select staff"
                                        loading={isStaffLoading}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={8}>
                                <Form.Item
                                    name="search"
                                    label="Search"
                                    style={compactFormItemStyle}
                                >
                                    <Search
                                        allowClear
                                        placeholder="Search all fields"
                                        onSearch={() => handleFilterSubmit(filterForm.getFieldsValue())}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <Form.Item
                                    name="orderCode"
                                    label="Order Code"
                                    style={compactFormItemStyle}
                                >
                                    <Input allowClear placeholder="Enter order code" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
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
                            <Col xs={24} sm={12} lg={6}>
                                <Form.Item
                                    name="createdFrom"
                                    label="Created From"
                                    style={compactFormItemStyle}
                                >
                                    <DatePicker
                                        style={fullWidthStyle}
                                        placeholder="Start date"
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <Form.Item
                                    name="createdTo"
                                    label="Created To"
                                    style={compactFormItemStyle}
                                >
                                    <DatePicker
                                        style={fullWidthStyle}
                                        placeholder="End date"
                                    />
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
                    <Table<IOrder>
                        {...restTableComponentProps}
                        columns={columns}
                        pagination={normalizedTablePagination}
                        rowKey="id"
                    />
                </Card>
            </Space>

            <Modal
                title="Từ chối đơn hàng"
                open={isRejectModalOpen}
                onCancel={closeRejectModal}
                onOk={handleRejectOrder}
                okText="Xác nhận từ chối"
                cancelText="Hủy"
                okButtonProps={{ danger: true, loading: isRejecting }}
                destroyOnHidden
                forceRender
            >
                <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
                    <Text>Bạn có chắc chắn muốn từ chối đơn hàng này không?</Text>
                    <Form<RejectOrderFormValues> form={rejectForm} layout="vertical">
                        <Form.Item
                            name="reason"
                            label="Lý do từ chối"
                            rules={[
                                { required: true, message: "Vui lòng nhập lý do từ chối." },
                                { whitespace: true, message: "Vui lòng nhập lý do từ chối." },
                            ]}
                        >
                            <Input.TextArea
                                rows={4}
                                placeholder="Nhập lý do từ chối đơn hàng"
                                maxLength={500}
                                showCount
                            />
                        </Form.Item>
                    </Form>
                </Space>
            </Modal>
        </List>
    );
};
