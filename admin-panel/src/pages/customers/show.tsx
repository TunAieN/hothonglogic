import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { formatCny, formatVnd, resolveLegacyCnyTotal, toNumber } from "../../shared/utils/currency";
import { Show } from "@refinedev/antd";
import { useShow } from "@refinedev/core";
import {
    Avatar,
    Breadcrumb,
    Button,
    Card,
    Dropdown,
    Empty,
    Space,
    Table,
    Tabs,
    Tag,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
    CalendarOutlined,
    ClockCircleOutlined,
    DollarOutlined,
    EditOutlined,
    EnvironmentOutlined,
    FileTextOutlined,
    HomeOutlined,
    IdcardOutlined,
    MailOutlined,
    MoreOutlined,
    PhoneOutlined,
    RiseOutlined,
    ShoppingOutlined,
    StarFilled,
    TeamOutlined,
    UserOutlined,
    WalletOutlined,
} from "@ant-design/icons";
import type { Customer as ICustomer, CustomerStatus, OrderSummary } from "../../shared/types";
import { CustomerFormModal } from "./components/CustomerFormModal";
import "./customer-show.css";

const { Text, Title } = Typography;

const EMPTY_VALUE = "—";
const UNASSIGNED_LABEL = "Chưa phân công";

interface PurchaseHistoryItem {
    id: string;
    orderCode: string;
    orderDate: string;
    totalAmount: number;
    totalCny: number;
    isExchangeRateLocked: boolean;
    paidAmount: number;
    debtAmount: number;
    depositAmount: number;
    depositStatus?: string | null;
    status: string;
}

interface CustomerSummary {
    totalOrders: number;
    totalSpent: number;
    totalPaid: number;
    totalDebt: number;
    averageOrderValue: number;
    successfulOrders: number;
    complaintOrders: number;
    lastPurchaseDate?: string;
}

interface MetricCardProps {
    label: string;
    value: string;
    helper: string;
    icon: ReactNode;
    tone: "blue" | "green" | "purple";
}

interface InfoRowProps {
    icon?: ReactNode;
    label: string;
    value: ReactNode;
}

interface SimpleRowProps {
    label: string;
    value: ReactNode;
    accent?: "success" | "danger" | "primary";
}

const safeText = (value?: string | number | null, fallback = EMPTY_VALUE) => {
    if (value === null || value === undefined) {
        return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
};

const formatDate = (value?: string | null) => {
    if (!value) {
        return EMPTY_VALUE;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return EMPTY_VALUE;
    }

    return new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
};

const formatDateTime = (value?: string | null) => {
    if (!value) {
        return EMPTY_VALUE;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return EMPTY_VALUE;
    }

    return new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
};

const formatCustomerLocation = (customer: Pick<ICustomer, "province" | "district" | "ward">) =>
    [customer.ward, customer.district, customer.province].filter(Boolean).join(", ");

const normalizeAddressPart = (value?: string | null) =>
    value
        ?.trim()
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .replace(/\s+/g, " ")
        .replace(/[.,;/\\-]+/g, " ")
        .replace(/,+/g, ",")
        .replace(/^,|,$/g, "")
        .trim() ?? "";

const formatFullAddress = (customer: Pick<ICustomer, "address" | "ward" | "district" | "province">) => {
    const address = customer.address?.trim();
    const addressNormalized = normalizeAddressPart(address);

    const locationParts = [customer.ward, customer.district, customer.province]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .filter((part) => {
            const normalizedPart = normalizeAddressPart(part);

            return normalizedPart !== "" && !addressNormalized.includes(normalizedPart);
        });

    return [address, ...locationParts].filter(Boolean).join(", ");
};

const getOrderVndTotal = (order: OrderSummary) => {
    if (order.exchange_rate_locked_at) {
        return toNumber(order.product_total_vnd);
    }

    return 0;
};

const getOrderPaidAmount = (order: OrderSummary) => toNumber(order.deposit_paid_amount_vnd);

const getOrderDebtAmount = (order: OrderSummary) => {
    if (order.deposit_remaining_amount_vnd !== null && order.deposit_remaining_amount_vnd !== undefined) {
        return Math.max(toNumber(order.deposit_remaining_amount_vnd), 0);
    }

    return Math.max(toNumber(order.deposit_amount_vnd) - toNumber(order.deposit_paid_amount_vnd), 0);
};

const mapOrders = (orders?: OrderSummary[]): PurchaseHistoryItem[] => {
    if (!Array.isArray(orders)) {
        return [];
    }

    return orders.map((order) => ({
        id: order.id,
        orderCode: order.order_code || `ORD-${order.id}`,
        orderDate: order.created_at,
        totalAmount: getOrderVndTotal(order),
        totalCny: resolveLegacyCnyTotal(order),
        isExchangeRateLocked: Boolean(order.exchange_rate_locked_at),
        paidAmount: getOrderPaidAmount(order),
        debtAmount: getOrderDebtAmount(order),
        depositAmount: toNumber(order.deposit_amount_vnd),
        depositStatus: order.deposit_status,
        status: order.status,
    }));
};

const buildSummary = (customer?: ICustomer): CustomerSummary => {
    const orders = Array.isArray(customer?.orders) ? customer.orders : [];
    const purchaseItems = mapOrders(orders);
    const totalOrders = customer?.orders_count ?? purchaseItems.length;
    const totalSpent = purchaseItems.reduce((total, order) => total + order.totalAmount, 0);
    const totalPaid = purchaseItems.reduce((total, order) => total + order.paidAmount, 0);
    const totalDebt = purchaseItems.reduce((total, order) => total + order.debtAmount, 0);
    const successfulOrders = purchaseItems.filter((order) => ["delivered", "completed"].includes(order.status)).length;
    const complaintOrders = purchaseItems.filter((order) => order.status === "complaint").length;
    const lastPurchaseDate = purchaseItems
        .map((order) => order.orderDate)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

    return {
        totalOrders,
        totalSpent,
        totalPaid,
        totalDebt,
        averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
        successfulOrders,
        complaintOrders,
        lastPurchaseDate,
    };
};

const customerStatusMeta: Record<CustomerStatus, { color: string; label: string }> = {
    active: { color: "success", label: "Hoạt động" },
    inactive: { color: "default", label: "Ngừng hoạt động" },
    blocked: { color: "error", label: "Tạm khóa" },
};

const orderStatusMeta: Record<string, { color: string; label: string }> = {
    draft: { color: "default", label: "Nháp" },
    pending: { color: "gold", label: "Chờ xử lý" },
    awaiting_deposit: { color: "orange", label: "Chờ đặt cọc" },
    deposited: { color: "cyan", label: "Đã đặt cọc" },
    purchasing: { color: "blue", label: "Đang mua hàng" },
    awaiting_tracking: { color: "geekblue", label: "Chờ mã vận đơn" },
    waiting_cn_warehouse: { color: "purple", label: "Chờ kho Trung Quốc" },
    receiving: { color: "processing", label: "Đang nhận hàng" },
    shipped: { color: "blue", label: "Đang vận chuyển" },
    delivered: { color: "success", label: "Đã giao hàng" },
    completed: { color: "success", label: "Hoàn thành" },
    complaint: { color: "volcano", label: "Khiếu nại" },
    cancelled: { color: "error", label: "Đã hủy" },
};

const getStatusTag = (status?: string | null) => {
    const meta = status ? orderStatusMeta[status] : undefined;

    return <Tag color={meta?.color ?? "default"}>{meta?.label ?? safeText(status, "Khác")}</Tag>;
};

const MetricCard = ({ label, value, helper, icon, tone }: MetricCardProps) => (
    <Card className={`customer-metric-card customer-metric-card--${tone}`}>
        <div className="customer-metric-card__content">
            <span className="customer-metric-card__icon">{icon}</span>
            <div>
                <Text className="customer-muted">{label}</Text>
                <div className="customer-metric-card__value">{value}</div>
                <Text className="customer-muted customer-small-text">{helper}</Text>
            </div>
        </div>
    </Card>
);

const InfoRow = ({ icon, label, value }: InfoRowProps) => (
    <div className="customer-info-row">
        {icon ? <span className="customer-info-row__icon">{icon}</span> : null}
        <div className="customer-info-row__body">
            <Text className="customer-muted customer-small-text">{label}</Text>
            <div className="customer-info-row__value">{value}</div>
        </div>
    </div>
);

const SimpleRow = ({ label, value, accent }: SimpleRowProps) => (
    <div className="customer-simple-row">
        <Text className="customer-muted">{label}</Text>
        <span className={accent ? `customer-simple-row__value customer-simple-row__value--${accent}` : "customer-simple-row__value"}>
            {value}
        </span>
    </div>
);

const EmptyData = ({ description }: { description: string }) => (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
);

const CustomerProfileCard = ({ customer }: { customer: ICustomer }) => {
    const statusMeta = customerStatusMeta[customer.status] ?? { color: "default", label: safeText(customer.status) };
    const fullAddress = formatFullAddress(customer);
    const location = formatCustomerLocation(customer);

    return (
        <Card className="customer-profile-card" styles={{ body: { padding: 0 } }}>
            <div className="customer-profile-card__hero">
                <Avatar
                    alt={customer.name}
                    className="customer-profile-card__avatar"
                    icon={<UserOutlined />}
                    size={92}
                    src={customer.avatar}
                />
                <Title level={4} className="customer-profile-card__name">
                    {safeText(customer.name)}
                </Title>
                <Space size={6} wrap className="customer-profile-card__badges">
                    {customer.vip_group ? <Tag color="blue">{customer.vip_group}</Tag> : <Tag>{EMPTY_VALUE}</Tag>}
                    <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                </Space>
            </div>

            <div className="customer-profile-card__details">
                <InfoRow
                    icon={<MailOutlined />}
                    label="Email"
                    value={customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : EMPTY_VALUE}
                />
                <InfoRow
                    icon={<PhoneOutlined />}
                    label="Số điện thoại"
                    value={customer.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : EMPTY_VALUE}
                />
                <InfoRow icon={<HomeOutlined />} label="Địa chỉ" value={safeText(fullAddress)} />
                <InfoRow icon={<EnvironmentOutlined />} label="Tỉnh/thành, quận/huyện, phường/xã" value={safeText(location)} />
                <InfoRow icon={<CalendarOutlined />} label="Tham gia" value={formatDate(customer.created_at)} />
                <InfoRow icon={<StarFilled />} label="Nguồn khách hàng" value={EMPTY_VALUE} />
                <InfoRow icon={<TeamOutlined />} label="Nhân viên phụ trách" value={UNASSIGNED_LABEL} />
            </div>
        </Card>
    );
};

const CustomerValueCard = ({ summary }: { summary: CustomerSummary }) => (
    <Card className="customer-value-card">
        <div className="customer-card-title customer-card-title--blue">
            <WalletOutlined />
            <span>Giá trị trọn đời (LTV)</span>
        </div>
        <div className="customer-value-card__amount">{formatVnd(summary.totalSpent)}</div>
        <Text className="customer-muted">Tổng chi tiêu tích lũy</Text>
        <div className="customer-divider" />
        <SimpleRow
            label="Công nợ hiện tại"
            value={formatVnd(summary.totalDebt)}
            accent={summary.totalDebt > 0 ? "danger" : "success"}
        />
        <Text className="customer-muted customer-small-text">
            {summary.totalDebt > 0 ? "Còn công nợ cần theo dõi" : "Không có công nợ"}
        </Text>
    </Card>
);

const OrderHistoryCard = ({ orders }: { orders: PurchaseHistoryItem[] }) => {
    const navigate = useNavigate();
    const debtRows = orders.filter((order) => order.debtAmount > 0 || order.depositAmount > 0 || order.paidAmount > 0);
    const complaintRows = orders.filter((order) => order.status === "complaint");

    const columns: ColumnsType<PurchaseHistoryItem> = [
        {
            title: "Mã đơn hàng",
            dataIndex: "orderCode",
            key: "orderCode",
            width: 180,
            render: (value: string, order) => <Link to={`/orders/show/${order.id}`}>{value}</Link>,
        },
        {
            title: "Ngày đặt",
            dataIndex: "orderDate",
            key: "orderDate",
            width: 140,
            render: (value: string) => <Text>{formatDateTime(value)}</Text>,
        },
        {
            title: "Trạng thái",
            dataIndex: "status",
            key: "status",
            width: 150,
            render: (value: string) => getStatusTag(value),
        },
        {
            title: "Tổng tiền",
            dataIndex: "totalAmount",
            key: "totalAmount",
            align: "right",
            width: 170,
            render: (_value: number, order) => order.isExchangeRateLocked ? (
                <Space direction="vertical" size={0} align="end">
                    <Text strong>{formatVnd(order.totalAmount)}</Text>
                    <Text type="secondary">{formatCny(order.totalCny)}</Text>
                </Space>
            ) : (
                <Space direction="vertical" size={0} align="end">
                    <Text>{formatCny(order.totalCny)}</Text>
                    <Text type="secondary">Chưa chốt tỷ giá</Text>
                </Space>
            ),
        },
        {
            title: "Đã thanh toán",
            dataIndex: "paidAmount",
            key: "paidAmount",
            align: "right",
            width: 150,
            render: (value: number) => <Text type={value > 0 ? "success" : "secondary"}>{formatVnd(value)}</Text>,
        },
        {
            title: "Công nợ",
            dataIndex: "debtAmount",
            key: "debtAmount",
            align: "right",
            width: 140,
            render: (value: number) => <Text type={value > 0 ? "danger" : "secondary"}>{formatVnd(value)}</Text>,
        },
        {
            title: "Thao tác",
            key: "actions",
            align: "center",
            width: 92,
            render: (_, order) => (
                <Dropdown
                    trigger={["click"]}
                    menu={{
                        items: [{ key: "view", label: "Xem chi tiết" }],
                        onClick: () => navigate(`/orders/show/${order.id}`),
                    }}
                >
                    <Button aria-label="Thao tác đơn hàng" icon={<MoreOutlined />} size="small" type="text" />
                </Dropdown>
            ),
        },
    ];

    const debtColumns: ColumnsType<PurchaseHistoryItem> = [
        { title: "Mã đơn", dataIndex: "orderCode", key: "orderCode", render: (value: string, order) => <Link to={`/orders/show/${order.id}`}>{value}</Link> },
        { title: "Ngày phát sinh", dataIndex: "orderDate", key: "orderDate", render: (value: string) => formatDate(value) },
        { title: "Giá trị", dataIndex: "depositAmount", key: "depositAmount", align: "right", render: (value: number) => formatVnd(value) },
        { title: "Đã thanh toán", dataIndex: "paidAmount", key: "paidAmount", align: "right", render: (value: number) => formatVnd(value) },
        { title: "Còn nợ", dataIndex: "debtAmount", key: "debtAmount", align: "right", render: (value: number) => <Text type={value > 0 ? "danger" : "secondary"}>{formatVnd(value)}</Text> },
        { title: "Trạng thái", dataIndex: "depositStatus", key: "depositStatus", render: (value?: string | null) => <Tag>{safeText(value, "Chưa có")}</Tag> },
    ];

    return (
        <Card className="customer-history-card">
            <Tabs
                className="customer-tabs"
                items={[
                    {
                        key: "orders",
                        label: "Lịch sử mua hàng",
                        children: (
                            <>
                                <Table<PurchaseHistoryItem>
                                    columns={columns}
                                    dataSource={orders}
                                    pagination={false}
                                    rowKey="id"
                                    locale={{ emptyText: <EmptyData description="Khách hàng chưa có đơn hàng" /> }}
                                    scroll={{ x: 980 }}
                                />
                                <div className="customer-table-footer">
                                    <Button type="link" onClick={() => navigate("/orders")}>Xem tất cả đơn hàng</Button>
                                </div>
                            </>
                        ),
                    },
                    {
                        key: "payments",
                        label: "Giao dịch & Thanh toán",
                        children: <EmptyData description="Backend chưa cung cấp dữ liệu giao dịch thanh toán cho khách hàng này" />,
                    },
                    {
                        key: "debt",
                        label: "Công nợ",
                        children: debtRows.length ? (
                            <Table<PurchaseHistoryItem>
                                columns={debtColumns}
                                dataSource={debtRows}
                                pagination={false}
                                rowKey="id"
                                scroll={{ x: 780 }}
                            />
                        ) : <EmptyData description="Không có công nợ từ dữ liệu hiện có" />,
                    },
                    {
                        key: "complaints",
                        label: "Khiếu nại",
                        children: complaintRows.length ? (
                            <Table<PurchaseHistoryItem>
                                columns={columns.slice(0, 4)}
                                dataSource={complaintRows}
                                pagination={false}
                                rowKey="id"
                                scroll={{ x: 680 }}
                            />
                        ) : <EmptyData description="Chưa có khiếu nại" />,
                    },
                ]}
            />
        </Card>
    );
};

const DeliveryCoverageCard = ({ customer, summary }: { customer: ICustomer; summary: CustomerSummary }) => (
    <Card className="customer-section-card" title={<span className="customer-card-title"><EnvironmentOutlined />Phạm vi giao hàng</span>}>
        <div className="customer-coverage-box">
            <SimpleRow label="Địa chỉ chính" value={safeText(formatFullAddress(customer))} />
            <SimpleRow label="Khu vực giao thường xuyên" value={safeText(formatCustomerLocation(customer))} />
            <SimpleRow label="Số lần giao thành công" value={summary.successfulOrders} accent="success" />
            <SimpleRow label="Lần giao gần nhất" value={formatDate(summary.lastPurchaseDate)} />
        </div>
    </Card>
);

const ActivityCard = ({ orders }: { orders: PurchaseHistoryItem[] }) => {
    const recentOrders = [...orders]
        .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
        .slice(0, 5);

    return (
        <Card className="customer-section-card" title={<span className="customer-card-title"><ClockCircleOutlined />Hoạt động gần đây</span>}>
            {recentOrders.length ? (
                <div className="customer-timeline">
                    {recentOrders.map((order) => (
                        <div className="customer-timeline__item" key={order.id}>
                            <span className="customer-timeline__dot"><ShoppingOutlined /></span>
                            <div>
                                <Link to={`/orders/show/${order.id}`}>Đơn hàng {order.orderCode}</Link>
                                <div className="customer-muted customer-small-text">{formatDateTime(order.orderDate)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : <EmptyData description="Chưa có hoạt động từ dữ liệu hiện có" />}
        </Card>
    );
};

const AdditionalInfoCard = () => (
    <Card className="customer-section-card" title={<span className="customer-card-title"><FileTextOutlined />Thông tin bổ sung</span>}>
        <Tabs
            className="customer-tabs customer-tabs--compact"
            items={[
                {
                    key: "personal",
                    label: "Thông tin cá nhân",
                    children: (
                        <div className="customer-additional-grid">
                            <SimpleRow label="Ngày sinh" value={EMPTY_VALUE} />
                            <SimpleRow label="Giới tính" value={EMPTY_VALUE} />
                            <SimpleRow label="CMND/CCCD" value={EMPTY_VALUE} />
                            <SimpleRow label="Mã số thuế" value={EMPTY_VALUE} />
                        </div>
                    ),
                },
                { key: "addresses", label: "Địa chỉ khác", children: <EmptyData description="Chưa có dữ liệu địa chỉ khác" /> },
                { key: "banks", label: "Tài khoản ngân hàng", children: <EmptyData description="Chưa có dữ liệu tài khoản ngân hàng" /> },
                { key: "files", label: "Tài liệu đính kèm", children: <EmptyData description="Chưa có tài liệu đính kèm" /> },
            ]}
        />
    </Card>
);

const CustomerInfoCard = ({ customer, summary }: { customer: ICustomer; summary: CustomerSummary }) => {
    const statusMeta = customerStatusMeta[customer.status] ?? { color: "default", label: safeText(customer.status) };

    return (
        <Card className="customer-side-card" title={<span className="customer-card-title"><IdcardOutlined />Thông tin khách hàng</span>}>
            <SimpleRow label="Loại khách hàng" value={customer.vip_group ? <Tag color="purple">{customer.vip_group}</Tag> : EMPTY_VALUE} />
            <SimpleRow label="Xếp hạng" value={EMPTY_VALUE} />
            <SimpleRow label="Hạn mức công nợ" value={EMPTY_VALUE} />
            <SimpleRow label="Hạn mức còn lại" value={EMPTY_VALUE} />
            <SimpleRow label="Số dư tài khoản" value={EMPTY_VALUE} />
            <SimpleRow label="Điểm tích lũy" value={EMPTY_VALUE} />
            <SimpleRow label="Trạng thái" value={<Tag color={statusMeta.color}>{statusMeta.label}</Tag>} />
            <div className="customer-divider" />
            <SimpleRow label="Công nợ hiện tại" value={formatVnd(summary.totalDebt)} accent={summary.totalDebt > 0 ? "danger" : "success"} />
        </Card>
    );
};

const InternalNoteCard = ({ note }: { note?: string | null }) => (
    <Card className="customer-side-card" title={<span className="customer-card-title customer-card-title--orange"><StarFilled />Ghi chú nội bộ</span>}>
        <div className="customer-note-box">{safeText(note, "Chưa có ghi chú")}</div>
    </Card>
);

const PreferencesCard = () => (
    <Card className="customer-side-card" title={<span className="customer-card-title customer-card-title--purple"><ShoppingOutlined />Sở thích mua hàng</span>}>
        <EmptyData description="Backend chưa cung cấp dữ liệu sở thích mua hàng" />
    </Card>
);

const QuickStatsCard = ({ summary }: { summary: CustomerSummary }) => (
    <Card className="customer-side-card" title={<span className="customer-card-title customer-card-title--purple"><RiseOutlined />Thống kê nhanh</span>}>
        <SimpleRow label="Số đơn hàng" value={summary.totalOrders} />
        <SimpleRow label="Tổng chi tiêu" value={formatVnd(summary.totalSpent)} />
        <SimpleRow label="Đơn hàng trung bình" value={formatVnd(summary.averageOrderValue)} />
        <SimpleRow label="Sản phẩm đã mua" value={EMPTY_VALUE} />
        <SimpleRow label="Lần mua cuối" value={formatDate(summary.lastPurchaseDate)} />
        <SimpleRow label="Tỷ lệ đơn thành công" value={summary.totalOrders > 0 ? `${Math.round((summary.successfulOrders / summary.totalOrders) * 100)}%` : EMPTY_VALUE} />
        <SimpleRow label="Số khiếu nại" value={summary.complaintOrders} />
    </Card>
);

export const CustomerShow = () => {
    const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
    const { query } = useShow<ICustomer>({ resource: "customers" });
    const { data, isLoading, isError } = query;
    const customer = data?.data;
    const orders = useMemo(() => mapOrders(customer?.orders), [customer?.orders]);
    const summary = useMemo(() => buildSummary(customer), [customer]);

    if (!isLoading && (isError || !customer)) {
        return (
            <Show breadcrumb={false} headerButtons={() => null} isLoading={isLoading} title={false}>
                <div className="customer-detail-page">
                    <EmptyData description="Không tìm thấy khách hàng" />
                </div>
            </Show>
        );
    }

    return (
        <Show breadcrumb={false} headerButtons={() => null} isLoading={isLoading} title={false}>
            {customer ? (
                <div className="customer-detail-page">
                    <div className="customer-detail-header">
                        <div>
                            <Breadcrumb
                                items={[
                                    { title: "Khách hàng" },
                                    { title: "Chi tiết khách hàng" },
                                    { title: safeText(customer.name) },
                                ]}
                            />
                            <Title level={2} className="customer-detail-title">Chi tiết khách hàng</Title>
                        </div>
                        <Space wrap className="customer-detail-actions">
                            <Button icon={<EditOutlined />} onClick={() => setEditingCustomerId(customer.id)}>
                                Chỉnh sửa
                            </Button>
                            <Button
                                disabled={!customer.email}
                                href={customer.email ? `mailto:${customer.email}` : undefined}
                                icon={<MailOutlined />}
                                type="primary"
                            >
                                Liên hệ khách hàng
                            </Button>
                            <Dropdown
                                trigger={["click"]}
                                menu={{
                                    items: [
                                        {
                                            key: "edit",
                                            icon: <EditOutlined />,
                                            label: "Chỉnh sửa",
                                            onClick: () => setEditingCustomerId(customer.id),
                                        },
                                        {
                                            key: "email",
                                            icon: <MailOutlined />,
                                            label: "Gửi email",
                                            disabled: !customer.email,
                                        },
                                    ],
                                }}
                            >
                                <Button aria-label="Thao tác khác" icon={<MoreOutlined />} />
                            </Dropdown>
                        </Space>
                    </div>

                    <div className="customer-detail-grid">
                        <aside className="customer-detail-left">
                            <CustomerProfileCard customer={customer} />
                            <CustomerValueCard summary={summary} />
                        </aside>

                        <main className="customer-detail-main">
                            <div className="customer-metrics-grid">
                                <MetricCard
                                    helper="Tất cả thời gian"
                                    icon={<ShoppingOutlined />}
                                    label="Tổng đơn hàng"
                                    tone="blue"
                                    value={String(summary.totalOrders)}
                                />
                                <MetricCard
                                    helper="Backend chưa cung cấp dữ liệu so sánh"
                                    icon={<RiseOutlined />}
                                    label="Tăng trưởng TB"
                                    tone="green"
                                    value={EMPTY_VALUE}
                                />
                                <MetricCard
                                    helper="Tổng đơn đã chốt tỷ giá"
                                    icon={<DollarOutlined />}
                                    label="Tổng chi tiêu"
                                    tone="purple"
                                    value={formatVnd(summary.totalSpent)}
                                />
                            </div>

                            <OrderHistoryCard orders={orders} />

                            <div className="customer-main-split">
                                <DeliveryCoverageCard customer={customer} summary={summary} />
                                <ActivityCard orders={orders} />
                            </div>

                            <AdditionalInfoCard />
                        </main>

                        <aside className="customer-detail-right">
                            <CustomerInfoCard customer={customer} summary={summary} />
                            <InternalNoteCard note={customer.note} />
                            <PreferencesCard />
                            <QuickStatsCard summary={summary} />
                        </aside>
                    </div>
                </div>
            ) : null}

            <CustomerFormModal
                customerId={editingCustomerId ?? undefined}
                mode="edit"
                onClose={() => setEditingCustomerId(null)}
                onCompleted={async () => {
                    await query.refetch();
                }}
                open={Boolean(editingCustomerId)}
            />
        </Show>
    );
};
