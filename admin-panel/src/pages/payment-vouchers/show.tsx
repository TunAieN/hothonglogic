import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import dayjs from "dayjs";
import { Link, useNavigate, useParams } from "react-router";
import { Alert, Breadcrumb, Button, Card, DatePicker, Empty, Form, Input, InputNumber, Modal, Radio, Skeleton, Space, Table, Tag, Typography, message } from "antd";
import { ArrowLeftOutlined, BankOutlined, CalendarOutlined, CheckCircleOutlined, CloseOutlined, CloseCircleOutlined, DollarOutlined, FileTextOutlined, InfoCircleOutlined, PrinterOutlined, SafetyCertificateOutlined, SendOutlined, UserOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { cancelPaymentVoucher, confirmPaymentTransaction, fetchPaymentVoucher, getPaymentErrorMessage } from "./api";
import type { PaymentTransaction, PaymentVoucher, PaymentVoucherRelatedOrder } from "./types";
import "./payment-vouchers.css";

const { Text, Title } = Typography;
const EMPTY_VALUE = "-";

const money = (value?: number | null) => Number(value ?? 0).toLocaleString("vi-VN") + " đ";

const statusLabels: Record<string, { text: string; tone: "warning" | "info" | "success" | "danger" | "neutral" }> = {
  waiting_payment: { text: "Chờ thanh toán", tone: "warning" },
  partial_paid: { text: "Thanh toán một phần", tone: "info" },
  paid: { text: "Đã thanh toán", tone: "success" },
  cancelled: { text: "Đã hủy", tone: "danger" },
};

const voucherTypeLabels: Record<string, string> = {
  deposit: "Đặt cọc đơn hàng",
  shipment: "Thanh toán vận đơn",
  shipment_payment: "Thanh toán vận đơn",
  order_payment: "Thanh toán đơn hàng",
};

type VoucherPackage = PaymentVoucher["packages"][number];
type DetailRow = {
  label: string;
  value?: ReactNode;
  full?: boolean;
};

const formatDateTime = (value?: string | null) => (value ? dayjs(value).format("DD/MM/YYYY HH:mm") : EMPTY_VALUE);
const formatDate = (value?: string | null) => (value ? dayjs(value).format("DD/MM/YYYY") : EMPTY_VALUE);
const formatPercent = (value?: number | null) => (value === null || value === undefined ? undefined : Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + "%");

const paymentMethodLabel = (value?: string | null) => {
  if (value === "cash") return "Tiền mặt";
  if (value === "bank_transfer") return "Chuyển khoản";
  if (value === "mixed") return "Kết hợp";
  return value || EMPTY_VALUE;
};

const getVoucherTypeLabel = (voucher: PaymentVoucher) => voucherTypeLabels[voucher.voucher_type] ?? voucherTypeLabels[voucher.receiver_type] ?? "Khác";
const isOrderDepositVoucher = (voucher: PaymentVoucher) => voucher.voucher_type === "deposit" || voucher.receiver_type === "deposit";

const renderValue = (value?: ReactNode) => {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  return value;
};
const paymentAccountLabel = (bankName?: string | null, accountNumber?: string | null, accountHolder?: string | null) => {
  if (bankName && accountNumber && accountHolder) {
    return `${bankName} (${accountNumber}) - ${accountHolder}`;
  }
  return EMPTY_VALUE;
};
const getPaymentAccount = (voucher: PaymentVoucher) => {
  return paymentAccountLabel(voucher.paymentAccount?.bank_name, voucher.paymentAccount?.account_number, voucher.paymentAccount?.account_holder);
};

const StatusBadge = ({ status }: { status: string }) => {
  const config = statusLabels[status] ?? { text: status || "Khác", tone: "neutral" as const };


  return (
    <span className={`payment-vouchers__status payment-vouchers__status--${config.tone}`}>
      <span className="payment-vouchers__status-dot" aria-hidden="true" />
      {config.text}
    </span>
  );
};

const DetailCard = ({ title, children, className }: { title: string; children: ReactNode; className?: string }) => (
  <Card className={`payment-vouchers__card payment-vouchers-show__card${className ? ` ${className}` : ""}`}>
    <Title level={3} className="payment-vouchers-show__card-title">{title}</Title>
    {children}
  </Card>
);

const DetailRows = ({ rows }: { rows: DetailRow[] }) => (
  <dl className="payment-vouchers-show__detail-list">
    {rows.map((row) => (
      <div className={`payment-vouchers-show__detail-row${row.full ? " payment-vouchers-show__detail-row--full" : ""}`} key={row.label}>
        <dt>{row.label}</dt>
        <dd>{renderValue(row.value)}</dd>
      </div>
    ))}
  </dl>
);

const SummaryLine = ({ label, value, danger, strong }: { label: string; value: ReactNode; danger?: boolean; strong?: boolean }) => (
  <div className={`payment-vouchers-show__summary-line${strong ? " payment-vouchers-show__summary-line--total" : ""}${danger ? " payment-vouchers-show__summary-line--danger" : ""}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const PaymentConfirmMethodOption = ({ selected, icon, title, description, tone, onClick }: { selected: boolean; icon: ReactNode; title: string; description: string; tone: "blue" | "green"; onClick: () => void }) => (
  <button
    type="button"
    className={"payment-vouchers-show__pay-method payment-vouchers-show__pay-method--" + tone + (selected ? " payment-vouchers-show__pay-method--selected" : "")}
    onClick={onClick}
  >
    <span className="payment-vouchers-show__pay-method-icon">{icon}</span>
    <span className="payment-vouchers-show__pay-method-copy">
      <Text strong>{title}</Text>
      <Text type="secondary">{description}</Text>
    </span>
    <span className="payment-vouchers-show__pay-method-radio" aria-hidden="true">
      {selected ? <CheckCircleOutlined /> : null}
    </span>
  </button>
);

const PageLoading = () => (
  <div className="payment-vouchers-show">
    <Card className="payment-vouchers__card payment-vouchers-show__card">
      <Skeleton active paragraph={{ rows: 3 }} />
    </Card>
    <div className="payment-vouchers-show__top-grid">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card className="payment-vouchers__card payment-vouchers-show__card" key={index}>
          <Skeleton active paragraph={{ rows: 5 }} />
        </Card>
      ))}
    </div>
  </div>
);

const VoucherHeader = ({ voucher, isDeposit, canPay, canCancel, onBack, onConfirmPayment, onCancelVoucher }: {
  voucher: PaymentVoucher;
  isDeposit: boolean;
  canPay: boolean;
  canCancel: boolean;
  onBack: () => void;
  onConfirmPayment: () => void;
  onCancelVoucher: () => void;
}) => {
  const title = isDeposit ? "Chi tiết phiếu đặt cọc" : "Chi tiết phiếu thanh toán";
  const breadcrumbTitle = isDeposit ? `Phiếu đặt cọc ${voucher.voucher_code}` : `Chi tiết phiếu thanh toán ${voucher.voucher_code}`;

  return (
    <div className="payment-vouchers-show__header">
      <div className="payment-vouchers-show__heading">
        <Breadcrumb
          className="payment-vouchers-show__breadcrumb"
          items={[
            { title: <Link to="/payment-vouchers">Phiếu thanh toán</Link> },
            { title: breadcrumbTitle },
          ]}
        />
        <Title level={1} className="payment-vouchers-show__title">{title}</Title>
        <StatusBadge status={voucher.status} />
      </div>

      <Space wrap className="payment-vouchers-show__actions">
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>Quay lại</Button>
        {canPay ? <Button type="primary" icon={<CheckCircleOutlined />} onClick={onConfirmPayment}>Xác nhận thanh toán</Button> : null}
        {canPay ? <Button icon={<SendOutlined />}>Gửi phiếu</Button> : null}
        <Button icon={<PrinterOutlined />}>In phiếu</Button>
        {canCancel ? <Button danger icon={<CloseCircleOutlined />} onClick={onCancelVoucher}>Hủy phiếu</Button> : null}
      </Space>
    </div>
  );
};

const VoucherInfoCard = ({ voucher, isDeposit }: { voucher: PaymentVoucher; isDeposit: boolean }) => {
  const hasBankSnapshot = Boolean(voucher.transfer_content || voucher.bank_name_snapshot || voucher.bank_account_number_snapshot || voucher.bank_account_holder_snapshot);
  const confirmedTransaction = voucher.transactions.find((transaction) => transaction.status === "confirmed" && transaction.received_at);

  return (
    <DetailCard title="Thông tin phiếu thanh toán">
      <DetailRows
        rows={[
          { label: "Mã phiếu", value: <span className="payment-vouchers__code">{voucher.voucher_code}</span> },
          { label: "Ngày tạo", value: formatDateTime(voucher.created_at) },
          { label: "Ngày thanh toán", value: formatDateTime(confirmedTransaction?.received_at) },
          { label: isDeposit ? "Loại phiếu" : "Loại thanh toán", value: getVoucherTypeLabel(voucher) },
          { label: "Phương thức thanh toán", value: paymentMethodLabel(voucher.payment_method_expected) },
          { label: "Kho hàng", value: isDeposit ? undefined : voucher.warehouse?.name },
          { label: "Tài khoản nhận", value: hasBankSnapshot ? voucher.bank_account_number_snapshot : undefined },
          { label: "Ngân hàng / Đơn vị nhận", value: hasBankSnapshot ? [voucher.bank_name_snapshot, voucher.bank_account_holder_snapshot].filter(Boolean).join(" - ") : undefined, full: true },
          { label: "Nội dung chuyển khoản", value: voucher.transfer_content, full: true },
        ]}
      />
    </DetailCard>
  );
};

const CustomerInfoCard = ({ voucher }: { voucher: PaymentVoucher }) => (
  <DetailCard title="Thông tin khách hàng">
    <DetailRows
      rows={[
        { label: "Khách hàng", value: <Link to={`/customers/show/${voucher.customer.id}`}>{voucher.customer.name}</Link> },
        { label: "Mã khách hàng", value: voucher.customer.code },
        { label: "Số điện thoại", value: voucher.customer.phone },
        { label: "Email", value: voucher.customer.email },
        { label: "Địa chỉ", value: voucher.delivery_address ?? voucher.customer.address, full: true },
      ]}
    />
  </DetailCard>
);

const DepositSummaryCard = ({ voucher }: { voucher: PaymentVoucher }) => {
  const orderTotalAmount = voucher.base_amount_vnd ?? voucher.order?.product_total_vnd ?? undefined;
  const requiredDepositAmount = voucher.total_amount;
  const paidAmount = voucher.paid_amount;
  const voucherRemainingAmount = voucher.remaining_amount ?? Math.max(requiredDepositAmount - paidAmount, 0);
  const remainingOrderAmount = orderTotalAmount === undefined ? undefined : Math.max(orderTotalAmount - requiredDepositAmount, 0);

  return (
    <DetailCard title="Tổng quan đặt cọc" className="payment-vouchers-show__summary-card">
      <div className="payment-vouchers-show__summary-list">
        {orderTotalAmount !== undefined ? <SummaryLine label="Tổng giá trị đơn hàng" value={money(orderTotalAmount)} /> : null}
        {voucher.deposit_percent !== null && voucher.deposit_percent !== undefined ? <SummaryLine label="Tỷ lệ đặt cọc" value={formatPercent(voucher.deposit_percent)} /> : null}
        <SummaryLine label="Số tiền cần đặt cọc" value={money(requiredDepositAmount)} />
        <SummaryLine label="Đã thanh toán" value={money(paidAmount)} />
        <SummaryLine label="Còn phải trả cho phiếu" value={money(voucherRemainingAmount)} />
        {remainingOrderAmount !== undefined ? <SummaryLine label="Giá trị đơn hàng còn lại" value={money(remainingOrderAmount)} /> : null}
        <SummaryLine label="Tổng tiền phiếu" value={money(requiredDepositAmount)} strong />
      </div>
    </DetailCard>
  );
};

const ShipmentPaymentSummaryCard = ({ voucher }: { voucher: PaymentVoucher }) => (
  <DetailCard title="Tổng quan thanh toán" className="payment-vouchers-show__summary-card">
    <div className="payment-vouchers-show__summary-list">
      <SummaryLine label="Phí cân nặng / vận chuyển" value={money(voucher.shipping_fee_total)} />
      <SummaryLine label="Phí vận chuyển nội địa TQ" value={money(voucher.domestic_shipping_fee)} />
      <SummaryLine label="Phụ phí khác" value={money(voucher.surcharge_total)} />
      <SummaryLine label="Tiền cọc được khấu trừ" value={money(voucher.deposit_applied)} danger />
      <SummaryLine label="Tiền dư áp dụng" value={money(voucher.customer_credit_applied)} danger />
      <SummaryLine label="Đã thanh toán" value={money(voucher.paid_amount)} />
      <SummaryLine label="Còn phải trả" value={money(voucher.remaining_amount)} />
      <SummaryLine label="Tổng thanh toán" value={money(voucher.total_amount)} strong />
    </div>
  </DetailCard>
);

const DepositOrdersSection = ({ order, voucher }: { order?: PaymentVoucherRelatedOrder | null; voucher: PaymentVoucher }) => {
  const columns: ColumnsType<PaymentVoucherRelatedOrder> = [
    {
      title: "Mã đơn hàng",
      dataIndex: "order_code",
      render: (value: string, item) => <Link to={`/orders/show/${item.id}`}>{value}</Link>,
      width: 180,
    },
    { title: "Ngày tạo", dataIndex: "created_at", render: formatDate, width: 140 },
    { title: "Giá trị đơn hàng", render: (_, item) => money(voucher.base_amount_vnd ?? item.product_total_vnd), align: "right", width: 170 },
    { title: "Tỷ lệ đặt cọc", render: (_, item) => formatPercent(voucher.deposit_percent ?? item.deposit_percent) ?? EMPTY_VALUE, align: "right", width: 130 },
    { title: "Số tiền đặt cọc", render: () => money(voucher.total_amount), align: "right", width: 160 },
    { title: "Trạng thái đơn hàng", dataIndex: "status", render: (value: string) => value || EMPTY_VALUE, width: 160 },
  ];

  return (
    <DetailCard title="Đơn hàng được đặt cọc">
      <Table
        rowKey="id"
        pagination={false}
        dataSource={order ? [order] : []}
        columns={columns}
        className="payment-vouchers__table payment-vouchers-show__table"
        scroll={{ x: 920 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thông tin đơn hàng liên quan" /> }}
      />
    </DetailCard>
  );
};

const ShipmentItemsSection = ({ voucher, columns }: { voucher: PaymentVoucher; columns: ColumnsType<VoucherPackage> }) => (
  <DetailCard title="Danh sách vận đơn / kiện hàng">
    <Table
      rowKey="id"
      pagination={false}
      dataSource={voucher.packages}
      columns={columns}
      className="payment-vouchers__table payment-vouchers-show__table"
      scroll={{ x: 920 }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có kiện hàng" /> }}
      summary={() => (
        <Table.Summary.Row>
          <Table.Summary.Cell index={0} colSpan={4}><Text strong>Tổng cộng</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={4} align="right"><Text strong>{money(voucher.shipping_fee_total)}</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={5} align="right"><Text strong>{money(voucher.surcharge_total)}</Text></Table.Summary.Cell>
          <Table.Summary.Cell index={6} align="right"><Text strong>{money(voucher.total_amount)}</Text></Table.Summary.Cell>
        </Table.Summary.Row>
      )}
    />
  </DetailCard>
);

const PaymentHistoryCard = ({ voucher, columns, isDeposit }: { voucher: PaymentVoucher; columns: ColumnsType<PaymentTransaction>; isDeposit: boolean }) => (
  <DetailCard title="Lịch sử thanh toán">
    <Table
      rowKey="id"
      pagination={false}
      dataSource={voucher.transactions}
      columns={columns}
      className="payment-vouchers__table payment-vouchers-show__table"
      scroll={{ x: 760 }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có giao dịch thanh toán" /> }}
    />
    {voucher.status === "paid" ? (
      <Alert className="payment-vouchers-show__paid-alert" type="info" showIcon message={isDeposit ? "Phiếu đặt cọc đã được thanh toán đầy đủ." : "Phiếu thanh toán đã được thanh toán đầy đủ."} />
    ) : null}
  </DetailCard>
);

const InvoiceCard = ({ voucher }: { voucher: PaymentVoucher }) => {
  if (!voucher.invoice) {
    return (
      <DetailCard title="Thông tin hóa đơn">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có hóa đơn" />
      </DetailCard>
    );
  }

  return (
    <DetailCard title="Thông tin hóa đơn">
      <div className="payment-vouchers-show__document">
        <div className="payment-vouchers-show__document-preview" aria-hidden="true">
          <FileTextOutlined />
        </div>
        <DetailRows
          rows={[
            { label: "Mã hóa đơn", value: voucher.invoice.invoice_code },
            { label: "Ngày phát hành", value: formatDateTime(voucher.invoice.issued_at) },
            { label: "Tổng tiền", value: money(voucher.invoice.total_amount) },
            { label: "Trạng thái", value: voucher.invoice.status },
          ]}
        />
      </div>
    </DetailCard>
  );
};

const NotesCard = ({ voucher }: { voucher: PaymentVoucher }) => (
  <DetailCard title="Ghi chú">
    <div className="payment-vouchers-show__note">{voucher.note?.trim() || voucher.cancelled_reason?.trim() || "Không có ghi chú"}</div>
  </DetailCard>
);

export const PaymentVoucherShow = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [voucher, setVoucher] = useState<PaymentVoucher | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [form] = Form.useForm();
  const [cancelForm] = Form.useForm();
  const loadVoucher = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setVoucher(await fetchPaymentVoucher(id));
    } catch (error) {
      message.error(getPaymentErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadVoucher();
  }, [loadVoucher]);

  
  const handleConfirmPayment = async () => {
    if (!voucher) return;
    try {
      const values = await form.validateFields();
      const updated = await confirmPaymentTransaction(voucher.id, {
        amount: Number(values.amount),
        payment_method: values.payment_method,
        bank_name: values.bank_name,
        bank_transaction_code: values.bank_transaction_code,
        received_at: values.received_at?.format("YYYY-MM-DD HH:mm:ss"),
        note: values.note,
      });
      setVoucher(updated);
      setPaymentOpen(false);
      form.resetFields();
      message.success("Đã xác nhận thanh toán.");
    } catch (error) {
      message.error(getPaymentErrorMessage(error));
    }
  };

  const handleCancel = async () => {
    if (!voucher) return;
    try {
      const values = await cancelForm.validateFields();
      const updated = await cancelPaymentVoucher(voucher.id, values.reason);
      setVoucher(updated);
      setCancelOpen(false);
      cancelForm.resetFields();
      message.success("Đã hủy phiếu thanh toán.");
    } catch (error) {
      message.error(getPaymentErrorMessage(error));
    }
  };

  const transactionColumns: ColumnsType<PaymentTransaction> = useMemo(() => [
    { title: "Thời gian", dataIndex: "received_at", render: (value?: string | null) => formatDateTime(value), width: 160 },
    { title: "Nội dung", dataIndex: "transaction_code", render: (value: string | null | undefined, item) => value || item.note || EMPTY_VALUE },
    { title: "Số tiền", dataIndex: "amount", render: (value: number | null | undefined, item) => <Text className={item.status === "confirmed" ? "payment-vouchers-show__money-success" : undefined}>{money(value)}</Text>, align: "right", width: 150 },
    { title: "Phương thức", dataIndex: "payment_method", render: paymentMethodLabel, width: 150 },
    { title: "Người thực hiện", render: () => voucher?.creator?.name ?? "Admin", width: 150 },
    { title: "Trạng thái", dataIndex: "status", render: (value: string) => <Tag color={value === "confirmed" ? "green" : "default"}>{value || EMPTY_VALUE}</Tag>, width: 130 },
  ], [voucher?.creator?.name]);

  const packageColumns: ColumnsType<VoucherPackage> = useMemo(() => [
    {
      title: "Mã vận đơn",
      render: (_, item) => <span className="payment-vouchers__code">{item.vnPackage.tracking_number_snapshot ?? EMPTY_VALUE}</span>,
      width: 170,
    },
    {
      title: "Mã đơn hàng",
      render: (_, item) => {
        const order = item.vnPackage.cn_package?.order;
        if (!order?.id) return order?.order_code ?? EMPTY_VALUE;
        return <Link to={`/orders/show/${order.id}`}>{order.order_code}</Link>;
      },
      width: 170,
    },
    { title: "Ngày nhận", render: (_, item) => formatDate(item.vnPackage.received_at), width: 130 },
    { title: "Cân tính phí", render: (_, item) => Number(item.chargeable_weight ?? 0).toLocaleString("vi-VN") + " kg", align: "right", width: 130 },
    { title: "Phí vận chuyển", render: (_, item) => money(item.shipping_fee), align: "right", width: 150 },
    { title: "Phụ phí", render: (_, item) => money(item.surcharge_amount), align: "right", width: 130 },
    { title: "Thành tiền", render: (_, item) => money(item.total_amount), align: "right", width: 150 },
    { title: "Trạng thái", render: (_, item) => <StatusBadge status={item.vnPackage.payment_status ?? voucher?.status ?? ""} />, width: 160 },
  ], [voucher?.status]);

  if (loading && !voucher) {
    return <PageLoading />;
  }

  if (!voucher) {
    return (
      <Card className="payment-vouchers__card payment-vouchers-show__card">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không tìm thấy phiếu thanh toán." />
      </Card>
    );
  }

  const isDeposit = isOrderDepositVoucher(voucher);
  const canPay = ["waiting_payment", "partial_paid"].includes(voucher.status);
  const canCancel = canPay;

  return (
    <div className="payment-vouchers-show">
      <VoucherHeader
        voucher={voucher}
        isDeposit={isDeposit}
        canPay={canPay}
        canCancel={canCancel}
        onBack={() => navigate("/payment-vouchers")}
        onConfirmPayment={() => {
          form.setFieldsValue({
            amount: voucher.remaining_amount,
            payment_method: voucher.payment_method_expected === "cash" ? "cash" : "bank_transfer",
            received_at: dayjs(),
            bank_name: getPaymentAccount(voucher),
          });
          setPaymentOpen(true);
        }}
        onCancelVoucher={() => setCancelOpen(true)}
      />

      <div className="payment-vouchers-show__top-grid">
        <VoucherInfoCard voucher={voucher} isDeposit={isDeposit} />
        <CustomerInfoCard voucher={voucher} />
        {isDeposit ? <DepositSummaryCard voucher={voucher} /> : <ShipmentPaymentSummaryCard voucher={voucher} />}
      </div>

      {isDeposit ? <DepositOrdersSection order={voucher.order} voucher={voucher} /> : <ShipmentItemsSection voucher={voucher} columns={packageColumns} />}

      <div className="payment-vouchers-show__secondary-grid">
        <PaymentHistoryCard voucher={voucher} columns={transactionColumns} isDeposit={isDeposit} />
        <InvoiceCard voucher={voucher} />
      </div>

      <NotesCard voucher={voucher} />

      <Modal
        className="payment-vouchers-show__payment-modal"
        title={<div className="payment-vouchers-show__payment-modal-title"><span><SafetyCertificateOutlined /></span><div><Text strong>Xác nhận thanh toán</Text><Text type="secondary">Xác nhận thông tin thanh toán để cập nhật trạng thái phiếu.</Text></div></div>}
        open={paymentOpen}
        width={840}
        centered
        onCancel={() => setPaymentOpen(false)}
        footer={<div className="payment-vouchers-show__payment-modal-footer"><Button icon={<CloseOutlined />} onClick={() => setPaymentOpen(false)}>Hủy</Button><Button type="primary" icon={<CheckCircleOutlined />} onClick={() => void handleConfirmPayment()}>Xác nhận đã nhận tiền</Button></div>}
      >
        <Form form={form} layout="vertical" className="payment-vouchers-show__payment-form">
          <div className="payment-vouchers-show__payment-card">
            <Form.Item noStyle shouldUpdate>
              {({ getFieldValue }) => {
                const selectedMethod = getFieldValue("payment_method") ?? "bank_transfer";
                return <div className="payment-vouchers-show__payment-section">
                  <div className="payment-vouchers-show__payment-label"><span>*</span> Phương thức thanh toán</div>
                  <Form.Item name="payment_method" rules={[{ required: true }]} className="payment-vouchers-show__hidden-form-item">
                    <Radio.Group style={{ display: "none" }} options={[{ value: "bank_transfer", label: "Chuyển khoản" }, { value: "cash", label: "Tiền mặt" }]} />
                  </Form.Item>
                  <div className="payment-vouchers-show__pay-method-grid">
                    <PaymentConfirmMethodOption selected={selectedMethod === "bank_transfer"} icon={<BankOutlined />} title="Chuyển khoản" description="Thanh toán qua ngân hàng" tone="blue" onClick={() => form.setFieldsValue({ payment_method: "bank_transfer" })} />
                    <PaymentConfirmMethodOption selected={selectedMethod === "cash"} icon={<DollarOutlined />} title="Tiền mặt" description="Thanh toán bằng tiền mặt" tone="green" onClick={() => form.setFieldsValue({ payment_method: "cash" })} />
                  </div>
                </div>;
              }}
            </Form.Item>

            <Form.Item noStyle shouldUpdate>
              {({ getFieldValue }) => getFieldValue("payment_method") === "bank_transfer" ? (
                <div className="payment-vouchers-show__bank-fields">
                  <Form.Item name="bank_name" label="Ngân hàng nhận" rules={[{ required: true, message: "Vui lòng nhập ngân hàng" }]}> 
                    <Input className="payment-vouchers-show__large-input" prefix={<BankOutlined />} placeholder="Chọn ngân hàng nhận"  readOnly />
                  </Form.Item>
                  <Form.Item name="bank_transaction_code" label="Mã giao dịch ngân hàng" extra="Mã giao dịch giúp đối soát nhanh hơn.">
                    <Input className="payment-vouchers-show__large-input" prefix={<SafetyCertificateOutlined />} placeholder="Nhập mã giao dịch / tham chiếu (nếu có)" />
                  </Form.Item>
                </div>
              ) : null}
            </Form.Item>

            <Form.Item name="amount" label="Số tiền nhận" rules={[{ required: true }]} extra={voucher.remaining_amount !== undefined && voucher.remaining_amount !== null ? "Còn phải thanh toán: " + money(voucher.remaining_amount) : undefined}>
              <InputNumber<number>
                min={1}
                className="payment-vouchers-show__amount-input"
                style={{ width: "100%" }}
                prefix={<DollarOutlined />}
                addonAfter="VND"
                formatter={(value) => Number(value ?? 0).toLocaleString("vi-VN")}
                parser={(value) => Number(String(value ?? "").replace(/\./g, "").replace(/,/g, "")) || 0}
              />
            </Form.Item>

            <div className="payment-vouchers-show__two-field-grid">
              <Form.Item name="received_at" label="Thời gian nhận" rules={[{ required: true }]}> 
                <DatePicker showTime format="DD/MM/YYYY HH:mm:ss" className="payment-vouchers-show__large-picker" suffixIcon={<CalendarOutlined />} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label="Người xác nhận">
                <Input className="payment-vouchers-show__large-input" prefix={<UserOutlined />} value="Người dùng hiện tại" readOnly />
              </Form.Item>
            </div>

            <Alert
              className="payment-vouchers-show__payment-notice"
              type="warning"
              showIcon
              icon={<InfoCircleOutlined />}
              message="Lưu ý"
              description={<ul><li>Vui lòng kiểm tra kỹ thông tin trước khi xác nhận.</li><li>Hệ thống sẽ ghi nhận thanh toán và cập nhật trạng thái phiếu.</li><li>Kiểm tra lại chứng từ hoặc thông tin đối soát trước khi lưu.</li></ul>}
            />

            <Form.Item name="note" label="Ghi chú" className="payment-vouchers-show__payment-note">
              <Input.TextArea rows={4} maxLength={500} showCount placeholder="Nhập ghi chú (nếu có)..." />
            </Form.Item>
          </div>
        </Form>
      </Modal>
      <Modal title="Hủy phiếu thanh toán" open={cancelOpen} onCancel={() => setCancelOpen(false)} onOk={() => void handleCancel()} okText="Hủy phiếu" okButtonProps={{ danger: true }}>
        <Form form={cancelForm} layout="vertical">
          <Form.Item name="reason" label="Lý do hủy" rules={[{ required: true, message: "Vui lòng nhập lý do hủy" }]}><Input.TextArea rows={4} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
