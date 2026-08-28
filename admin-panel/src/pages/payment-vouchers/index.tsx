import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Key } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Col, Descriptions, Form, Input, InputNumber, Modal, Popover, Radio, Result, Row, Select, Space, Table, Tabs, Tag, Tooltip, Typography, message } from "antd";
import { ArrowLeftOutlined, ArrowRightOutlined, BankOutlined, CalculatorOutlined, CheckOutlined, CopyOutlined, CreditCardOutlined, DeleteOutlined, DollarOutlined, EnvironmentOutlined, FileDoneOutlined, FileTextOutlined, HomeOutlined, InfoCircleOutlined, PhoneOutlined, PlusOutlined, ReloadOutlined, RightOutlined, SafetyCertificateOutlined, ShopOutlined, ShoppingCartOutlined, ShoppingOutlined, TruckOutlined, UserOutlined, WalletOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { createPaymentVoucher, fetchDefaultPaymentAccount, fetchEligiblePaymentPackages, fetchPaymentVouchers, getPaymentErrorMessage, previewPaymentVoucher } from "./api";
import type { EligiblePaymentPackage, PaymentAccount, PaymentVoucher, VoucherPreview, VoucherSurchargeInput } from "./types";
import { Can } from "../../shared/auth/Can";
import "./payment-vouchers.css";

const { Text, Title } = Typography;

const money = (value?: number | null) => `${Number(value ?? 0).toLocaleString("vi-VN")} đ`;
const kg = (value?: number | null) => `${Number(value ?? 0).toLocaleString("vi-VN")} kg`;
const getCustomer = (item?: EligiblePaymentPackage) => item?.cn_package?.order?.customer;
const getOrderCode = (item?: EligiblePaymentPackage) => item?.cn_package?.order?.order_code ?? item?.order_code_snapshot ?? "-";
const getChargeableWeight = (item: EligiblePaymentPackage) => {
  const actual = Number(item.actual_weight ?? 0);
  const volumetric = item.actual_length && item.actual_width && item.actual_height ? (Number(item.actual_length) * Number(item.actual_width) * Number(item.actual_height)) / 6000 : Number(item.actual_volume ?? 0);
  return Math.max(actual, volumetric);
};

const statusLabels: Record<string, { text: string; color: string }> = {
  waiting_payment: { text: "Chờ thanh toán", color: "gold" },
  partial_paid: { text: "Thanh toán một phần", color: "blue" },
  paid: { text: "Đã thanh toán", color: "green" },
  cancelled: { text: "Đã hủy", color: "red" },
};

const wizardSteps = ["Chọn vận đơn", "Thông tin phiếu", "Tính tiền", "Hình thức thanh toán", "Xác nhận"];

const modalBodyStyle: CSSProperties = {
  minHeight: 500,
  maxHeight: "calc(94vh - 230px)",
  overflowY: "auto",
  padding: "24px 32px",
};

const panelStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#fff",
};

const softPanelStyle: CSSProperties = {
  ...panelStyle,
  background: "#fbfdff",
};

const renderWizardStepper = (activeStep: number) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", alignItems: "center", gap: 12, marginTop: 18 }}>
    {wizardSteps.map((title, index) => {
      const isDone = index < activeStep;
      const isActive = index === activeStep;
      return (
        <div key={title} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
              fontSize: 13,
              fontWeight: 700,
              color: isDone || isActive ? "#fff" : "#6b7280",
              background: isDone || isActive ? "#1677ff" : "#f3f4f6",
              border: isDone || isActive ? "1px solid #1677ff" : "1px solid #d1d5db",
            }}
          >
            {isDone ? <CheckOutlined /> : index + 1}
          </div>
          <Text strong={isActive} style={{ color: isActive ? "#111827" : "#6b7280", whiteSpace: "nowrap", fontSize: 13 }}>{title}</Text>
          {index < wizardSteps.length - 1 && <div style={{ height: 1, flex: 1, minWidth: 32, background: isDone ? "#1677ff" : "#d1d5db" }} />}
        </div>
      );
    })}
  </div>
);

const SummaryTile = ({ icon, label, value, tone = "blue" }: { icon: ReactNode; label: string; value: ReactNode; tone?: "blue" | "green" | "purple" }) => {
  const colors = {
    blue: { bg: "#eff6ff", fg: "#1677ff" },
    green: { bg: "#ecfdf3", fg: "#16a34a" },
    purple: { bg: "#f5f3ff", fg: "#7c3aed" },
  }[tone];

  return (
    <div style={{ ...softPanelStyle, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, minHeight: 84 }}>
      <div style={{ width: 42, height: 42, borderRadius: "50%", background: colors.bg, color: colors.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
        {icon}
      </div>
      <div>
        <Text type="secondary" style={{ display: "block", fontSize: 13 }}>{label}</Text>
        <Text strong style={{ fontSize: 24, lineHeight: 1.2 }}>{value}</Text>
      </div>
    </div>
  );
};

const toMoneyNumber = (value?: number | string | null) => {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

type PaymentBreakdown = {
  productAmount: number;
  purchaseFee: number;
  foreignDomesticFee: number;
  orderSurcharge: number;
  orderTotal: number;
  weightShippingFee: number;
  localShippingFee: number;
  shippingSurcharge: number;
  shippingTotal: number;
  totalPayable: number;
  depositPaid: number;
  previousPaidAmount: number;
  balanceApplied: number;
  discountAmount: number;
  remainingAmount: number;
};

const calculatePaymentBreakdown = (selectedPackages: EligiblePaymentPackage[], preview: VoucherPreview | null): PaymentBreakdown => {
  const ordersById = new Map<string, NonNullable<NonNullable<EligiblePaymentPackage["cn_package"]>["order"]>>();

  selectedPackages.forEach((item) => {
    const order = item.cn_package?.order;
    if (!order?.id || ordersById.has(order.id)) {
      return;
    }
    ordersById.set(order.id, order);
  });

  const orderRows = Array.from(ordersById.values());
  const fallbackProductAmount = orderRows.reduce((sum, order) => sum + toMoneyNumber(order.product_total_vnd), 0);
  const productAmount = preview ? toMoneyNumber(preview.product_total) : fallbackProductAmount;
  const purchaseFee = 0;
  const foreignDomesticFee = 0;
  const orderSurcharge = 0;
  const orderTotal = preview ? toMoneyNumber(preview.order_total) : productAmount + purchaseFee + foreignDomesticFee + orderSurcharge;

  const weightShippingFee = toMoneyNumber(preview?.shipping_fee_total);
  const localShippingFee = toMoneyNumber(preview?.domestic_shipping_fee);
  const shippingSurcharge = toMoneyNumber(preview?.surcharge_total);
  const shippingTotal = weightShippingFee + localShippingFee + shippingSurcharge;

  const totalPayable = preview ? toMoneyNumber(preview.gross_total) : orderTotal + shippingTotal;
  const fallbackDepositPaid = orderRows.reduce((sum, order) => sum + toMoneyNumber(order.deposit_paid_amount_vnd), 0);
  const depositPaid = preview ? toMoneyNumber(preview.deposit_applied) : fallbackDepositPaid;
  const previousPaidAmount = 0;
  const balanceApplied = toMoneyNumber(preview?.customer_credit_applied);
  const discountAmount = 0;
  const remainingAmount = preview
    ? toMoneyNumber(preview.remaining_amount)
    : Math.max(totalPayable - depositPaid - previousPaidAmount - balanceApplied - discountAmount, 0);

  return {
    productAmount,
    purchaseFee,
    foreignDomesticFee,
    orderSurcharge,
    orderTotal,
    weightShippingFee,
    localShippingFee,
    shippingSurcharge,
    shippingTotal,
    totalPayable,
    depositPaid,
    previousPaidAmount,
    balanceApplied,
    discountAmount,
    remainingAmount,
  };
};

const PaymentBreakdownRow = ({ label, value, subtract = false, strong = false, total = false }: { label: string; value: number; subtract?: boolean; strong?: boolean; total?: boolean }) => (
  <div className={"payment-vouchers__breakdown-row" + (total ? " payment-vouchers__breakdown-row--total" : "") + (subtract ? " payment-vouchers__breakdown-row--subtract" : "")}>
    <span>{label}</span>
    <strong className={strong ? "payment-vouchers__breakdown-value--strong" : undefined}>{subtract ? "-" : ""}{money(value)}</strong>
  </div>
);

const PaymentBreakdownCard = ({ title, index, icon, tone, children, footer }: { title: string; index: number; icon: ReactNode; tone: "blue" | "green" | "amber"; children: ReactNode; footer?: ReactNode }) => (
  <div className={"payment-vouchers__breakdown-card payment-vouchers__breakdown-card--" + tone}>
    <div className="payment-vouchers__breakdown-heading">
      <span className="payment-vouchers__breakdown-icon">{icon}</span>
      <Text strong>{index}. {title}</Text>
    </div>
    <div className="payment-vouchers__breakdown-body">{children}</div>
    {footer ? <div className="payment-vouchers__breakdown-footer">{footer}</div> : null}
  </div>
);

type WizardTone = "blue" | "green" | "purple" | "amber";

const WizardInfoCard = ({ title, index, icon, tone, className, children }: { title: string; index: number; icon: ReactNode; tone: WizardTone; className?: string; children: ReactNode }) => (
  <div className={"payment-vouchers__wizard-card payment-vouchers__wizard-card--" + tone + (className ? " " + className : "")}>
    <div className="payment-vouchers__wizard-card-header">
      <span className="payment-vouchers__wizard-card-icon">{icon}</span>
      <Text strong>{index}. {title}</Text>
    </div>
    <div className="payment-vouchers__wizard-card-body">{children}</div>
  </div>
);

const WizardInfoRow = ({ label, value, valueClassName }: { label: string; value: ReactNode; valueClassName?: string }) => (
  <div className="payment-vouchers__wizard-info-row">
    <span>{label}</span>
    <strong className={valueClassName}>{value ?? "-"}</strong>
  </div>
);

type ConfirmationValueTone = "default" | "success" | "warning" | "danger";

const ConfirmationInfoRow = ({ icon, label, value, action, tone = "default", highlight = false }: { icon?: ReactNode; label: string; value: ReactNode; action?: ReactNode; tone?: ConfirmationValueTone; highlight?: boolean }) => (
  <div className={"payment-vouchers__confirm-row" + (highlight ? " payment-vouchers__confirm-row--highlight" : "")}>
    <span className="payment-vouchers__confirm-row-label">
      {icon ? <span className="payment-vouchers__confirm-row-icon">{icon}</span> : null}
      {label}
    </span>
    <span className={"payment-vouchers__confirm-row-value payment-vouchers__confirm-row-value--" + tone}>
      <span>{value}</span>
      {action}
    </span>
  </div>
);

const ConfirmationSectionCard = ({ title, icon, tone, children }: { title: string; icon: ReactNode; tone: "blue" | "green"; children: ReactNode }) => (
  <div className={"payment-vouchers__confirm-card payment-vouchers__confirm-card--" + tone}>
    <div className="payment-vouchers__confirm-card-header">
      <span className="payment-vouchers__confirm-card-icon">{icon}</span>
      <Text strong>{title}</Text>
    </div>
    <div className="payment-vouchers__confirm-card-body">{children}</div>
  </div>
);

const copyTextToClipboard = async (value?: string | null) => {
  const copyValue = String(value ?? "").trim();

  if (!copyValue) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(copyValue);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = copyValue;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    message.success("Đã sao chép");
  } catch {
    message.error("Không thể sao chép");
  }
};

const CopyValueButton = ({ value }: { value?: string | null }) => {
  const copyValue = String(value ?? "").trim();

  if (!copyValue) {
    return null;
  }

  return (
    <Tooltip title="Sao chép">
      <Button aria-label="Sao chép" icon={<CopyOutlined />} onClick={() => void copyTextToClipboard(copyValue)} />
    </Tooltip>
  );
};

const MethodInfoRow = ({ label, value, copyable = false }: { label: string; value?: ReactNode; copyable?: boolean }) => {
  const copyValue = typeof value === "string" ? value : undefined;

  return (
    <div className="payment-vouchers__method-info-row">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
      {copyable ? <CopyValueButton value={copyValue} /> : null}
    </div>
  );
};

const DeliveryMethodOption = ({ selected, icon, title, description, onClick }: { selected: boolean; icon: ReactNode; title: string; description: string; onClick: () => void }) => (
  <button type="button" className={"payment-vouchers__delivery-option" + (selected ? " payment-vouchers__delivery-option--selected" : "")} onClick={onClick}>
    <span className="payment-vouchers__delivery-radio" aria-hidden="true" />
    <span className="payment-vouchers__delivery-option-icon">{icon}</span>
    <span className="payment-vouchers__delivery-option-copy">
      <strong>{title}</strong>
      <small>{description}</small>
    </span>
  </button>
);

const getUniqueOrders = (items: EligiblePaymentPackage[]) => {
  const ordersById = new Map<string, NonNullable<NonNullable<EligiblePaymentPackage["cn_package"]>["order"]>>();
  items.forEach((item) => {
    const order = item.cn_package?.order;
    if (order?.id && !ordersById.has(order.id)) {
      ordersById.set(order.id, order);
    }
  });
  return Array.from(ordersById.values());
};

const getDepositStatus = (depositPaid: number, orderTotal: number) => {
  if (depositPaid <= 0) return { text: "Chưa đặt cọc", tone: "warning" as StatusBadgeTone };
  if (orderTotal > 0 && depositPaid < orderTotal) return { text: "Đặt cọc một phần", tone: "warning" as StatusBadgeTone };
  return { text: "Đã đặt cọc", tone: "success" as StatusBadgeTone };
};

type DisplayWarehouse = NonNullable<NonNullable<EligiblePaymentPackage["receipt"]>["warehouse"]> & {
  warehouse_name?: string | null;
  branch_name?: string | null;
  data?: { name?: string | null; address?: string | null } | null;
};

const getSelectedWarehouseInfo = (items: EligiblePaymentPackage[]) => {
  const warehouse = items
    .map((item) => item.receipt?.warehouse as DisplayWarehouse | null | undefined)
    .find((item): item is DisplayWarehouse => Boolean(item));

  return {
    warehouse,
    name: warehouse?.name ?? warehouse?.warehouse_name ?? warehouse?.branch_name ?? warehouse?.data?.name ?? "",
    address: warehouse?.address ?? warehouse?.data?.address ?? "",
  };
};

type StatusBadgeTone = "warning" | "info" | "success" | "danger" | "neutral";

const statusToneMap: Record<string, StatusBadgeTone> = {
  waiting_payment: "warning",
  partial_paid: "info",
  paid: "success",
  cancelled: "danger",
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const StatusBadge = ({ label, tone = "neutral" }: { label: ReactNode; tone?: StatusBadgeTone }) => (
  <span className={`payment-vouchers__status payment-vouchers__status--${tone}`}>
    <span className="payment-vouchers__status-dot" aria-hidden="true" />
    {label}
  </span>
);

const PaymentCode = ({ children }: { children: ReactNode }) => (
  <span className="payment-vouchers__code">{children}</span>
);

const PaymentPageHeader = ({ canCreate, loading, onCreate, onRefresh }: { canCreate: boolean; loading: boolean; onCreate: () => void; onRefresh: () => void }) => (
  <div className="payment-vouchers__page-header">
    <div className="payment-vouchers__page-heading">
      <Title level={2} className="payment-vouchers__page-title">Tạo phiếu thanh toán</Title>
      <Text className="payment-vouchers__page-description">Chọn vận đơn đủ điều kiện để tạo phiếu thanh toán.</Text>
    </div>
    <Space wrap className="payment-vouchers__page-actions">
      <Tooltip title="Tải lại dữ liệu">
        <Button aria-label="Tải lại dữ liệu" icon={<ReloadOutlined />} loading={loading} onClick={onRefresh} />
      </Tooltip>
      <Can permission="payment_vouchers.create">
        <Button type="primary" disabled={!canCreate} onClick={onCreate}>
          Tạo phiếu thanh toán
        </Button>
      </Can>
    </Space>
  </div>
);

const PaymentSummaryCard = ({ icon, label, value, suffix, tone }: { icon: ReactNode; label: string; value: ReactNode; suffix?: string; tone: "blue" | "green" | "purple" | "amber" }) => (
  <div className="payment-vouchers__summary-card">
    <div className={`payment-vouchers__summary-icon payment-vouchers__summary-icon--${tone}`} aria-hidden="true">
      {icon}
    </div>
    <div className="payment-vouchers__summary-copy">
      <div className="payment-vouchers__summary-label">{label}</div>
      <div className="payment-vouchers__summary-value">
        {value}
        {suffix && <span>{suffix}</span>}
      </div>
    </div>
  </div>
);

const PaymentSummaryCards = ({ totalPackages, actualWeight, chargeableWeight, selectedCount }: { totalPackages: number; actualWeight: number; chargeableWeight: number; selectedCount: number }) => (
  <div className="payment-vouchers__summary-grid" aria-label="Tổng quan phiếu thanh toán">
    <PaymentSummaryCard icon={<ShoppingOutlined />} label="Tổng vận đơn đủ điều kiện" value={totalPackages.toLocaleString("vi-VN")} suffix="vận đơn" tone="blue" />
    <PaymentSummaryCard icon={<WalletOutlined />} label="Tổng cân thực tế" value={Number(actualWeight.toFixed(2)).toLocaleString("vi-VN")} suffix="kg" tone="green" />
    <PaymentSummaryCard icon={<CreditCardOutlined />} label="Tổng cân tính phí" value={Number(chargeableWeight.toFixed(2)).toLocaleString("vi-VN")} suffix="kg" tone="amber" />
    <PaymentSummaryCard icon={<CheckOutlined />} label="Số vận đơn đang chọn" value={selectedCount.toLocaleString("vi-VN")} suffix="vận đơn" tone="purple" />
  </div>
);

const SectionHeader = ({ title, extra }: { title: string; extra?: ReactNode }) => (
  <div className="payment-vouchers__section-header">
    <Title level={4} className="payment-vouchers__section-title">{title}</Title>
    {extra}
  </div>
);

const PaymentToolbar = ({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) => (
  <div className="payment-vouchers__toolbar" aria-label="Bộ lọc danh sách vận đơn">
    <div className="payment-vouchers__toolbar-copy">
      <Text strong>Bộ lọc</Text>
      <Text type="secondary">Trang hiện tại chưa có bộ lọc hoạt động, dữ liệu đang theo điều kiện backend trả về.</Text>
    </div>
    <Tooltip title="Tải lại danh sách">
      <Button aria-label="Tải lại danh sách vận đơn" icon={<ReloadOutlined />} loading={loading} onClick={onRefresh} />
    </Tooltip>
  </div>
);

const tablePagination = (totalLabel: string) => ({
  pageSize: 10,
  showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} / ${total} ${totalLabel}`,
});

const EligibleShipmentTable = ({
  columns,
  dataSource,
  loading,
  selectedKeys,
  selectedCount,
  canCreate,
  onSelectionChange,
  onCreate,
}: {
  columns: ColumnsType<EligiblePaymentPackage>;
  dataSource: EligiblePaymentPackage[];
  loading: boolean;
  selectedKeys: Key[];
  selectedCount: number;
  canCreate: boolean;
  onSelectionChange: (selectedRowKeys: Key[]) => void;
  onCreate: () => void;
}) => (
  <>
    <Table<EligiblePaymentPackage>
      rowKey="id"
      loading={loading}
      columns={columns}
      dataSource={dataSource}
      rowSelection={{
        selectedRowKeys: selectedKeys,
        onChange: onSelectionChange,
        columnWidth: 48,
      }}
      pagination={tablePagination("vận đơn")}
      scroll={{ x: 1100 }}
      className="payment-vouchers__table"
    />
    {selectedCount > 0 && (
      <div className={`payment-vouchers__selection-bar${canCreate ? "" : " payment-vouchers__selection-bar--danger"}`}>
        <Text type={canCreate ? "secondary" : "danger"}>
          Đã chọn {selectedCount} vận đơn{canCreate ? "." : ", nhưng đang trộn nhiều khách hàng."}
        </Text>
        <Can permission="payment_vouchers.create">
          <Button type="primary" disabled={!canCreate} onClick={onCreate}>
            Tạo phiếu thanh toán
          </Button>
        </Can>
      </div>
    )}
  </>
);

const voucherTabs = [
  { key: "waiting_payment", label: "Chờ thanh toán" },
  { key: "partial_paid", label: "Thanh toán một phần" },
  { key: "paid", label: "Đã thanh toán" },
  { key: "cancelled", label: "Đã hủy" },
];

const PaymentVoucherSection = ({
  activeKey,
  columns,
  dataSource,
  loading,
  onTabChange,
}: {
  activeKey: string;
  columns: ColumnsType<PaymentVoucher>;
  dataSource: PaymentVoucher[];
  loading: boolean;
  onTabChange: (activeKey: string) => void;
}) => (
  <Card className="payment-vouchers__card payment-vouchers__card--vouchers">
    <SectionHeader title="Phiếu thanh toán" />
    <Tabs
      activeKey={activeKey}
      onChange={onTabChange}
      className="payment-vouchers__tabs"
      items={voucherTabs.map((tab) => ({
        ...tab,
        children: (
          <Table<PaymentVoucher>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={dataSource}
            pagination={tablePagination("phiếu")}
            scroll={{ x: 1180 }}
            className="payment-vouchers__table"
          />
        ),
      }))}
    />
  </Card>
);

export const PaymentVouchersPage = () => {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<EligiblePaymentPackage[]>([]);
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [successVoucher, setSuccessVoucher] = useState<PaymentVoucher | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [preview, setPreview] = useState<VoucherPreview | null>(null);
  const [defaultPaymentAccount, setDefaultPaymentAccount] = useState<PaymentAccount | null>(null);
  const [surcharges, setSurcharges] = useState<VoucherSurchargeInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [activeVoucherTab, setActiveVoucherTab] = useState("waiting_payment");
  const [form] = Form.useForm();

  const selectedPackages = useMemo(
    () => packages.filter((item) => selectedKeys.includes(item.id)),
    [packages, selectedKeys],
  );
  const selectedCustomerIds = useMemo(
    () => Array.from(new Set(selectedPackages.map((item) => getCustomer(item)?.id).filter(Boolean))),
    [selectedPackages],
  );
  const canCreate = selectedPackages.length > 0 && selectedCustomerIds.length === 1;

  const totalEligibleActualWeight = useMemo(
    () => packages.reduce((sum, item) => sum + Number(item.actual_weight ?? 0), 0),
    [packages],
  );

  const totalEligibleChargeableWeight = useMemo(
    () => packages.reduce((sum, item) => sum + getChargeableWeight(item), 0),
    [packages],
  );

  const loadDefaultPaymentAccount = useCallback(async () => {
    try {
      setDefaultPaymentAccount(await fetchDefaultPaymentAccount());
    } catch (error) {
      message.error(getPaymentErrorMessage(error));
    }
  }, []);


  const selectedActualWeight = useMemo(
    () => selectedPackages.reduce((sum, item) => sum + Number(item.actual_weight ?? 0), 0),
    [selectedPackages],
  );

  const selectedChargeableWeight = useMemo(
    () => selectedPackages.reduce((sum, item) => sum + getChargeableWeight(item), 0),
    [selectedPackages],
  );

  const paymentBreakdown = useMemo(
    () => calculatePaymentBreakdown(selectedPackages, preview),
    [preview, selectedPackages],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eligible, voucherList] = await Promise.all([
        fetchEligiblePaymentPackages(),
        fetchPaymentVouchers(activeVoucherTab),
      ]);
      setPackages(eligible);
      setVouchers(voucherList);
    } catch (error) {
      message.error(getPaymentErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [activeVoucherTab]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openWizard = () => {
    if (!canCreate) {
      message.warning(selectedPackages.length === 0 ? "Vui lòng chọn vận đơn." : "Không được trộn vận đơn khác khách.");
      return;
    }
    const first = selectedPackages[0];
    form.setFieldsValue({
      receiver_type: "pickup_at_warehouse",
      payment_method_expected: "bank_transfer",
      delivery_address: getCustomer(first)?.address ?? "",
      note: "",
    });
    setPreview(null);
    setSurcharges([]);
    setActiveStep(0);
    setWizardOpen(true);
    void loadDefaultPaymentAccount();
  };

  const refreshPreview = async () => {
    setLoading(true);
    try {
      const data = await previewPaymentVoucher(selectedPackages.map((item) => item.id), surcharges);
      setPreview(data);
      if (data.payment_account) {
        setDefaultPaymentAccount(data.payment_account);
      }
      return data;
    } catch (error) {
      message.error(getPaymentErrorMessage(error));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (activeStep === 1) {
      await form.validateFields(["receiver_type", "delivery_address", "payment_method_expected"]);
      await refreshPreview();
    }
    if (activeStep === 2) {
      await refreshPreview();
    }
    setActiveStep((step) => Math.min(step + 1, 4));
  };

  const handleCreate = async () => {
    setSubmitLoading(true);
    try {
      const values = {
        receiver_type: "pickup_at_warehouse",
        payment_method_expected: "bank_transfer",
        delivery_address: getCustomer(selectedPackages[0])?.address ?? "",
        note: "",
        ...form.getFieldsValue(true),
      };

      if (!values.receiver_type) values.receiver_type = "pickup_at_warehouse";
      if (!values.payment_method_expected) values.payment_method_expected = "bank_transfer";
      if (values.receiver_type !== "pickup_at_warehouse" && !String(values.delivery_address ?? "").trim()) {
        message.warning("Vui lòng nhập địa chỉ giao hàng.");
        return;
      }

      const voucher = await createPaymentVoucher({
        package_ids: selectedPackages.map((item) => item.id),
        request_uuid: crypto.randomUUID(),
        vn_warehouse_id: selectedPackages[0]?.receipt?.warehouse?.id,
        receiver_type: values.receiver_type,
        delivery_address: values.delivery_address,
        payment_method_expected: values.payment_method_expected,
        note: values.note,
        surcharges,
      });
      setWizardOpen(false);
      setSuccessVoucher(voucher);
      setSelectedKeys([]);
      await loadData();
    } catch (error) {
      message.error(getPaymentErrorMessage(error));
    } finally {
      setSubmitLoading(false);
    }
  };

  const packageColumns: ColumnsType<EligiblePaymentPackage> = [
    { title: "Mã vận đơn", dataIndex: "tracking_number_snapshot", width: 180, render: (value) => <PaymentCode>{value ?? "-"}</PaymentCode> },
    { title: "Mã đơn hàng", width: 170, render: (_, item) => <PaymentCode>{getOrderCode(item)}</PaymentCode> },
    { title: "Khách hàng", width: 190, render: (_, item) => getCustomer(item)?.name ?? item.customer_name_snapshot ?? "-" },
    { title: "Cân thực tế", render: (_, item) => kg(item.actual_weight), align: "right", width: 130 },
    { title: "Cân tính phí", render: (_, item) => kg(getChargeableWeight(item)), align: "right", width: 130 },
    { title: "Ngày nhận", render: (_, item) => formatDate(item.received_at), width: 130 },
    { title: "Trạng thái", render: () => <StatusBadge label="Đã kiểm" tone="success" />, width: 130 },
  ];

  const voucherColumns: ColumnsType<PaymentVoucher> = [
    { title: "Mã phiếu", dataIndex: "voucher_code", render: (value, item) => <Button type="link" className="payment-vouchers__link-button" onClick={() => navigate(`/payment-vouchers/${item.id}`)}><PaymentCode>{value}</PaymentCode></Button>, width: 170 },
    { title: "Khách hàng", render: (_, item) => item.customer?.name ?? "-", width: 180 },
    { title: "Tổng phải trả", render: (_, item) => money(item.total_amount), align: "right", width: 150 },
    { title: "Đã thanh toán", render: (_, item) => money(item.paid_amount), align: "right", width: 150 },
    { title: "Còn phải trả", render: (_, item) => money(item.remaining_amount), align: "right", width: 150 },
    { title: "Ngày tạo", dataIndex: "created_at", render: formatDateTime, width: 160 },
    { title: "Trạng thái", render: (_, item) => <StatusBadge label={statusLabels[item.status]?.text ?? item.status} tone={statusToneMap[item.status] ?? "neutral"} />, width: 160 },
    { title: "Người tạo", render: (_, item) => item.creator?.name ?? "-", width: 140 },
    { title: "Hành động", render: (_, item) => <Button type="link" onClick={() => navigate(`/payment-vouchers/${item.id}`)}>Xem chi tiết</Button>, width: 130 },
  ];

  const selectedPackageColumns: ColumnsType<EligiblePaymentPackage> = [...packageColumns, { title: "Thao tác", width: 90, align: "center", render: (_, item) => <Button icon={<DeleteOutlined />} onClick={() => setSelectedKeys((keys) => keys.filter((key) => key !== item.id))} /> }];

  const renderPaymentMethodCard = ({ value, title, description, badge, icon, tone }: { value: string; title: string; description: string; badge: string; icon: ReactNode; tone: "blue" | "green" | "purple" }) => (
    <Form.Item noStyle shouldUpdate key={value}>{({ getFieldValue }) => {
      const selected = getFieldValue("payment_method_expected") === value;
      return (
        <button
          type="button"
          className={"payment-vouchers__method-card payment-vouchers__method-card--" + tone + (selected ? " payment-vouchers__method-card--selected" : "")}
          onClick={() => form.setFieldsValue({ payment_method_expected: value })}
        >
          <span className="payment-vouchers__method-card-icon">{icon}</span>
          <span className="payment-vouchers__method-card-copy">
            <Text strong>{title}</Text>
            <Text type="secondary">{description}</Text>
            <Tag className="payment-vouchers__method-card-badge">{badge}</Tag>
          </span>
          <span className="payment-vouchers__method-card-radio" aria-hidden="true">
            {selected ? <CheckOutlined /> : null}
          </span>
        </button>
      );
    }}</Form.Item>
  );

  const renderStep = () => {
    const customer = getCustomer(selectedPackages[0]);
    const paymentAccount = preview?.payment_account ?? defaultPaymentAccount;
    const transferContent = preview?.transfer_content ?? "TT <ma phieu thanh toan>";

    if (activeStep === 0) return <Space direction="vertical" size={14} style={{ width: "100%" }}>
      {selectedCustomerIds.length > 1 && <Tag color="red">Danh sách đang có nhiều khách hàng, vui lòng bỏ bớt vận đơn.</Tag>}
      <Row gutter={18}><Col span={8}><SummaryTile icon={<ShoppingOutlined />} label="Tổng số kiện" value={selectedPackages.length} /></Col><Col span={8}><SummaryTile icon={<WalletOutlined />} label="Tổng cân thực tế" value={kg(selectedActualWeight)} tone="green" /></Col><Col span={8}><SummaryTile icon={<CreditCardOutlined />} label="Tổng cân tính phí" value={kg(Number(selectedChargeableWeight.toFixed(2)))} tone="purple" /></Col></Row>
      <Table rowKey="id" pagination={false} columns={selectedPackageColumns} dataSource={selectedPackages} size="middle" bordered scroll={{ x: 980 }} />
    </Space>;

    if (activeStep === 1) {
      const selectedOrders = getUniqueOrders(selectedPackages);
      const orderCodes = selectedOrders.map((order) => order.order_code).filter(Boolean);
      const trackingNumbers = selectedPackages.map((item) => item.tracking_number_snapshot).filter(Boolean);
      const visibleTrackingNumbers = trackingNumbers.slice(0, 2);
      const hiddenTrackingCount = Math.max(trackingNumbers.length - visibleTrackingNumbers.length, 0);
      const warehouseInfo = getSelectedWarehouseInfo(selectedPackages);
      const orderDebt = Math.max(paymentBreakdown.orderTotal - paymentBreakdown.depositPaid, 0);
      const depositStatus = getDepositStatus(paymentBreakdown.depositPaid, paymentBreakdown.orderTotal);
      const voucherCreatedAt = new Date().toISOString();

      return <Form form={form} layout="vertical" requiredMark className="payment-vouchers__wizard-step-form">
        <div className="payment-vouchers__info-step-grid">
          <div className="payment-vouchers__info-step-left">
            <WizardInfoCard title="Thông tin khách hàng" index={1} icon={<UserOutlined />} tone="blue">
              <div className="payment-vouchers__two-field-grid">
                <Form.Item label="Khách hàng" required>
                  <Input value={customer?.name ?? ""} readOnly />
                </Form.Item>
                <Form.Item label="Số điện thoại" required>
                  <Input prefix={<PhoneOutlined />} value={customer?.phone ?? ""} readOnly />
                </Form.Item>
              </div>
            </WizardInfoCard>

            <WizardInfoCard title="Thông tin giao nhận" index={4} icon={<TruckOutlined />} tone="green">
              <Form.Item hidden name="receiver_type" rules={[{ required: true, message: "Vui lòng chọn hình thức nhận hàng" }]}><Input /></Form.Item>
              <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => {
                const receiverType = getFieldValue("receiver_type") ?? "pickup_at_warehouse";
                const isPickup = receiverType === "pickup_at_warehouse";
                return <>
                  <div className="payment-vouchers__delivery-options" aria-label="Hình thức nhận hàng">
                    <DeliveryMethodOption selected={isPickup} icon={<HomeOutlined />} title="Nhận tại kho" description="Khách hàng đến kho để nhận hàng" onClick={() => form.setFieldsValue({ receiver_type: "pickup_at_warehouse" })} />
                    <DeliveryMethodOption selected={!isPickup} icon={<TruckOutlined />} title="Giao tận nơi" description="Giao hàng đến địa chỉ khách hàng" onClick={() => form.setFieldsValue({ receiver_type: "local_delivery" })} />
                  </div>
                  {isPickup ? <div className="payment-vouchers__pickup-section">
                    <Form.Item label="Kho nhận hàng" required>
                      <Input value={warehouseInfo.name} readOnly placeholder="Chưa xác định được kho nhận hàng" />
                    </Form.Item>
                    {warehouseInfo.warehouse ? <div className="payment-vouchers__warehouse-card">
                      <div className="payment-vouchers__warehouse-title"><ShopOutlined /> <Text strong>Thông tin kho</Text></div>
                      <Text>{warehouseInfo.name || "Chưa xác định được tên kho"}</Text>
                      {warehouseInfo.address ? <Text type="secondary">{warehouseInfo.address}</Text> : null}
                    </div> : null}
                    <div className="payment-vouchers__delivery-status"><CheckOutlined /> Khách hàng sẽ đến kho để nhận hàng</div>
                  </div> : <Form.Item name="delivery_address" label="Địa chỉ giao hàng" rules={[{ required: true, message: "Vui lòng nhập địa chỉ giao" }]}>
                    <Input prefix={<EnvironmentOutlined />} placeholder="Nhập địa chỉ giao hàng" />
                  </Form.Item>}
                </>;
              }}</Form.Item>
            </WizardInfoCard>
          </div>

          <WizardInfoCard title="Thông tin phiếu" index={2} icon={<FileTextOutlined />} tone="blue" className="payment-vouchers__info-step-middle">
            <WizardInfoRow label="Mã phiếu dự kiến" value="Tự động tạo" />
            <WizardInfoRow label="Ngày tạo phiếu" value={formatDateTime(voucherCreatedAt)} />
            <WizardInfoRow label="Loại phiếu" value={<StatusBadge label="Thanh toán đơn hàng" tone="info" />} />
            <WizardInfoRow label="Nhân viên tạo" value="Admin" />
            <WizardInfoRow label="Trạng thái" value={<StatusBadge label="Chưa thanh toán" tone="warning" />} />
          </WizardInfoCard>

          <WizardInfoCard title="Tóm tắt đơn hàng" index={3} icon={<ShoppingCartOutlined />} tone="purple" className="payment-vouchers__info-step-summary">
            <WizardInfoRow label="Mã đơn hàng" value={orderCodes.length > 0 ? <Tooltip title={orderCodes.join(", ")}><span>{orderCodes[0]}{orderCodes.length > 1 ? " +" + (orderCodes.length - 1) : ""}</span></Tooltip> : "—"} valueClassName="payment-vouchers__purple-value" />
            <WizardInfoRow label="Vận đơn" value={trackingNumbers.length > 0 ? <Tooltip title={trackingNumbers.join(", ")}><span>{visibleTrackingNumbers.join(", ")}{hiddenTrackingCount > 0 ? " +" + hiddenTrackingCount : ""}</span></Tooltip> : "Chưa có vận đơn"} />
            <WizardInfoRow label="Số kiện hàng" value={selectedPackages.length + " kiện"} />
            <WizardInfoRow label="Tổng cân thực tế" value={kg(selectedActualWeight)} />
            <WizardInfoRow label="Tổng cân tính phí" value={kg(Number(selectedChargeableWeight.toFixed(2)))} />
            <div className="payment-vouchers__wizard-divider" />
            <WizardInfoRow label="Trạng thái đặt cọc" value={<StatusBadge label={depositStatus.text} tone={depositStatus.tone} />} />
            <WizardInfoRow label="Tiền hàng" value={money(paymentBreakdown.productAmount)} />
            <WizardInfoRow label="Đã đặt cọc" value={paymentBreakdown.depositPaid > 0 ? "-" + money(paymentBreakdown.depositPaid) : money(0)} valueClassName="payment-vouchers__negative-value" />
            <WizardInfoRow label="Công nợ đơn hàng" value={money(orderDebt)} valueClassName={orderDebt > 0 ? "payment-vouchers__debt-value" : "payment-vouchers__paid-value"} />
          </WizardInfoCard>
        </div>

        <WizardInfoCard title="Ghi chú" index={5} icon={<FileDoneOutlined />} tone="amber" className="payment-vouchers__note-card">
          <Form.Item name="note" className="payment-vouchers__note-field">
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="Nhập ghi chú (nếu có)..." />
          </Form.Item>
        </WizardInfoCard>
      </Form>;
    }

    if (activeStep === 2) return <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Button icon={<ReloadOutlined />} onClick={() => void refreshPreview()} loading={loading}>Tính lại tiền</Button>
      <Table rowKey="id" pagination={false} dataSource={preview?.packages ?? []} size="middle" bordered scroll={{ x: 980 }} columns={[{ title: "Mã vận đơn", dataIndex: "tracking_number", width: 150 }, { title: "Cân thực tế", render: (_, item) => kg(toMoneyNumber(item.actual_weight)), align: "right", width: 110 }, { title: "Cân quy đổi", render: (_, item) => kg(toMoneyNumber(item.volumetric_weight)), align: "right", width: 110 }, { title: "Cân tính phí", render: (_, item) => kg(toMoneyNumber(item.chargeable_weight)), align: "right", width: 110 }, { title: "Khung giá áp dụng", render: (_, item) => item.rate_description ?? "-", width: 180 }, { title: "Đơn giá", render: (_, item) => money(toMoneyNumber(item.unit_price ?? item.price_per_kg)), align: "right", width: 120 }, { title: "Kiểu tính giá", render: (_, item) => item.price_type === "fixed" ? "Giá cố định" : "Giá theo kg", width: 120 }, { title: "Phụ phí", render: (_, item) => money(toMoneyNumber(item.surcharge_amount)), align: "right", width: 110 }, { title: "Thành tiền", render: (_, item) => money(toMoneyNumber(item.total_amount)), align: "right", width: 120 }]} />
      <div style={{ ...panelStyle, padding: 14 }}><Text strong>Phụ phí khác</Text><div style={{ marginTop: 12 }}><Space direction="vertical" style={{ width: "100%" }}>{surcharges.map((item, index) => <Space key={index} wrap style={{ width: "100%" }}><Select style={{ width: 190 }} value={item.vn_package_id} placeholder="Theo phiếu" allowClear onChange={(value) => setSurcharges((rows) => rows.map((row, i) => i === index ? { ...row, vn_package_id: value } : row))} options={selectedPackages.map((pkg) => ({ value: pkg.id, label: pkg.tracking_number_snapshot }))} /><Select style={{ width: 170 }} value={item.surcharge_type} onChange={(value) => setSurcharges((rows) => rows.map((row, i) => i === index ? { ...row, surcharge_type: value } : row))} options={[{ value: "packing", label: "Đóng gói" }, { value: "inspection", label: "Kiểm hàng" }, { value: "fragile", label: "Hàng dễ vỡ" }, { value: "heavy", label: "Hàng nặng" }, { value: "oversized", label: "Quá khổ" }, { value: "domestic_delivery", label: "Giao nội địa" }, { value: "other", label: "Khác" }]} /><InputNumber min={0} value={item.amount} onChange={(value) => setSurcharges((rows) => rows.map((row, i) => i === index ? { ...row, amount: toMoneyNumber(value) } : row))} /><Input style={{ flex: 1, minWidth: 220 }} placeholder="Ghi chú" value={item.note} onChange={(event) => setSurcharges((rows) => rows.map((row, i) => i === index ? { ...row, note: event.target.value } : row))} /><Button icon={<DeleteOutlined />} onClick={() => setSurcharges((rows) => rows.filter((_, i) => i !== index))} /></Space>)}<div className="payment-vouchers__surcharge-footer"><Button icon={<PlusOutlined />} onClick={() => setSurcharges((rows) => [...rows, { surcharge_type: "other", amount: 0 }])}>Thêm phụ phí</Button><Text>Tổng phụ phí vận chuyển: <Text strong>{money(paymentBreakdown.shippingSurcharge)}</Text></Text></div></Space></div></div>
      <div className="payment-vouchers__breakdown-grid"><PaymentBreakdownCard title="Chi phí đơn hàng" index={1} icon={<ShoppingOutlined />} tone="blue"><PaymentBreakdownRow label="Tiền hàng" value={paymentBreakdown.productAmount} /><PaymentBreakdownRow label="Phí mua hàng / dịch vụ" value={paymentBreakdown.purchaseFee} /><PaymentBreakdownRow label="Phí nội địa nước ngoài" value={paymentBreakdown.foreignDomesticFee} /><PaymentBreakdownRow label="Phụ phí đơn hàng" value={paymentBreakdown.orderSurcharge} /><PaymentBreakdownRow label="Tổng giá trị đơn hàng" value={paymentBreakdown.orderTotal} strong total /></PaymentBreakdownCard><PaymentBreakdownCard title="Chi phí vận chuyển" index={2} icon={<TruckOutlined />} tone="green"><PaymentBreakdownRow label="Phí vận chuyển theo cân" value={paymentBreakdown.weightShippingFee} /><PaymentBreakdownRow label="Phí nội địa Việt Nam" value={paymentBreakdown.localShippingFee} /><PaymentBreakdownRow label="Phụ phí vận chuyển" value={paymentBreakdown.shippingSurcharge} /><PaymentBreakdownRow label="Tổng phí vận chuyển" value={paymentBreakdown.shippingTotal} strong total /></PaymentBreakdownCard><PaymentBreakdownCard title="Tổng thanh toán" index={3} icon={<CalculatorOutlined />} tone="amber" footer={<div className="payment-vouchers__remaining-total"><span>Còn phải thanh toán</span><strong>{money(paymentBreakdown.remainingAmount)}</strong></div>}><PaymentBreakdownRow label="Tổng giá trị đơn hàng" value={paymentBreakdown.orderTotal} /><PaymentBreakdownRow label="Tổng phí vận chuyển" value={paymentBreakdown.shippingTotal} /><PaymentBreakdownRow label="Tổng phải trả" value={paymentBreakdown.totalPayable} strong total /><PaymentBreakdownRow label="Tiền đã đặt cọc" value={paymentBreakdown.depositPaid} subtract /><PaymentBreakdownRow label="Đã thanh toán trước đó" value={paymentBreakdown.previousPaidAmount} subtract /><PaymentBreakdownRow label="Tiền dư áp dụng" value={paymentBreakdown.balanceApplied} subtract /><PaymentBreakdownRow label="Giảm giá" value={paymentBreakdown.discountAmount} subtract /></PaymentBreakdownCard></div>
      <div className="payment-vouchers__calculation-note"><InfoCircleOutlined /><Text>Giá trị được tính dựa trên thông tin đơn hàng, vận đơn và bảng giá hiện tại. Vui lòng kiểm tra kỹ trước khi tiếp tục.</Text></div>
    </Space>;

    if (activeStep === 3) return <Form form={form} layout="vertical" className="payment-vouchers__method-step">
      <Form.Item name="payment_method_expected" rules={[{ required: true, message: "Vui lòng chọn phương thức thanh toán" }]} className="payment-vouchers__method-hidden-field">
        <Radio.Group style={{ display: "none" }} options={[{ value: "bank_transfer", label: "Chuyển khoản" }, { value: "cash", label: "Tiền mặt" }, { value: "mixed", label: "Kết hợp" }]} />
      </Form.Item>

      <div className="payment-vouchers__method-section-title">
        <Text strong><span>*</span> Phương thức thanh toán dự kiến</Text>
        <Text type="secondary">Chọn phương thức bạn dự kiến sẽ thanh toán cho phiếu này.</Text>
      </div>

      <div className="payment-vouchers__method-grid">
        {renderPaymentMethodCard({ value: "bank_transfer", title: "Chuyển khoản", description: "Thanh toán qua tài khoản ngân hàng", badge: "An toàn · Nhanh chóng", icon: <BankOutlined />, tone: "blue" })}
        {renderPaymentMethodCard({ value: "cash", title: "Tiền mặt", description: "Thanh toán bằng tiền mặt", badge: "Linh hoạt · Tiện lợi", icon: <DollarOutlined />, tone: "green" })}
        {renderPaymentMethodCard({ value: "mixed", title: "Kết hợp", description: "Kết hợp nhiều hình thức thanh toán", badge: "Linh hoạt · Chủ động", icon: <CreditCardOutlined />, tone: "purple" })}
      </div>

      <Form.Item shouldUpdate noStyle>{({ getFieldValue }) => {
        const selectedPaymentMethod = getFieldValue("payment_method_expected") ?? "bank_transfer";
        const shouldShowBankInfo = ["bank_transfer", "mixed"].includes(selectedPaymentMethod);

        if (!shouldShowBankInfo) {
          return <div className="payment-vouchers__cash-card">
            <div className="payment-vouchers__cash-card-icon"><DollarOutlined /></div>
            <div>
              <Text strong>Thanh toán bằng tiền mặt</Text>
              <ul>
                <li>Thanh toán trực tiếp tại kho hoặc với nhân viên phụ trách.</li>
                <li>Kiểm tra số tiền trước khi xác nhận.</li>
                <li>Phiếu sẽ được cập nhật trạng thái theo quy trình hiện tại.</li>
              </ul>
            </div>
          </div>;
        }

        return <>
          <div className="payment-vouchers__bank-card">
            <div className="payment-vouchers__bank-heading">
              <span className="payment-vouchers__bank-icon"><BankOutlined /></span>
              <Text strong>Thông tin chuyển khoản</Text>
              <span className="payment-vouchers__bank-shield"><SafetyCertificateOutlined /></span>
            </div>
            {selectedPaymentMethod === "mixed" ? <Text className="payment-vouchers__mixed-note">Phương thức kết hợp sử dụng thông tin chuyển khoản bên dưới và phần còn lại theo quy trình thu tiền hiện tại.</Text> : null}
            <div className="payment-vouchers__bank-info-grid">
              <div className="payment-vouchers__bank-info-box">
                <MethodInfoRow label="Ngân hàng" value={paymentAccount?.bank_name} />
                <MethodInfoRow label="Chủ tài khoản" value={paymentAccount?.account_holder} />
              </div>
              <div className="payment-vouchers__bank-info-box">
                <MethodInfoRow label="Số tài khoản" value={paymentAccount?.account_number} copyable />
                <MethodInfoRow label="Nội dung chuyển khoản" value={transferContent} copyable />
              </div>
            </div>
            {!paymentAccount ? <Text type="danger" className="payment-vouchers__bank-warning">Chưa cấu hình tài khoản nhận tiền mặc định đang hoạt động.</Text> : null}
          </div>

          <div className="payment-vouchers__method-notice">
            <InfoCircleOutlined />
            <div>
              <Text strong>Lưu ý quan trọng</Text>
              <ul>
                <li>Vui lòng chuyển khoản đúng nội dung để hệ thống ghi nhận nhanh chóng.</li>
                <li>Sau khi nhận được thanh toán, nhân viên sẽ cập nhật trạng thái phiếu theo quy trình hiện tại.</li>
              </ul>
            </div>
          </div>
        </>;
      }}</Form.Item>
    </Form>;

    const trackingNumbers = selectedPackages
      .map((item) => item.tracking_number_snapshot)
      .filter((value): value is string => Boolean(value));
    const noteValue = String(form.getFieldValue("note") ?? "").trim();
    const packageCountText = selectedPackages.length.toLocaleString("vi-VN") + " kiện";
    const packageDetailAction = trackingNumbers.length > 0 ? (
      <Popover
        trigger="click"
        title="Danh sách vận đơn"
        content={<Space direction="vertical" size={6}>{trackingNumbers.map((trackingNumber) => <PaymentCode key={trackingNumber}>{trackingNumber}</PaymentCode>)}</Space>}
      >
        <Button type="link" className="payment-vouchers__confirm-detail-link">
          Xem chi tiết <RightOutlined />
        </Button>
      </Popover>
    ) : null;

    return <div className="payment-vouchers__confirm-step">
      <div className="payment-vouchers__confirm-hero">
        <div className="payment-vouchers__confirm-ready">
          <div className="payment-vouchers__confirm-ready-icon"><FileDoneOutlined /><span><CheckOutlined /></span></div>
          <Text strong className="payment-vouchers__confirm-ready-title">Sẵn sàng tạo phiếu</Text>
          <Text className="payment-vouchers__confirm-ready-copy">Vui lòng kiểm tra lại thông tin trước khi xác nhận tạo phiếu thanh toán.</Text>
        </div>
        <div className="payment-vouchers__confirm-table">
          <ConfirmationInfoRow icon={<UserOutlined />} label="Khách hàng" value={customer?.name ?? "-"} />
          <ConfirmationInfoRow icon={<PhoneOutlined />} label="Số điện thoại" value={customer?.phone ?? "-"} />
          <ConfirmationInfoRow icon={<ShoppingOutlined />} label="Danh sách vận đơn" value={<Tag color="blue" className="payment-vouchers__confirm-count-tag">{packageCountText}</Tag>} action={packageDetailAction} />
          <ConfirmationInfoRow icon={<CalculatorOutlined />} label="Tổng phải trả" value={money(paymentBreakdown.totalPayable)} />
          <ConfirmationInfoRow icon={<WalletOutlined />} label="Đã trả tiền đặt cọc" value={money(paymentBreakdown.depositPaid)} tone={paymentBreakdown.depositPaid > 0 ? "success" : "default"} />
          <ConfirmationInfoRow icon={<CreditCardOutlined />} label="Đã trừ tiền dư/cọc" value={money(paymentBreakdown.balanceApplied)} tone={paymentBreakdown.balanceApplied > 0 ? "warning" : "default"} />
          <ConfirmationInfoRow icon={<DollarOutlined />} label="Còn phải trả" value={money(paymentBreakdown.remainingAmount)} tone="danger" highlight />
        </div>
      </div>

      <div className="payment-vouchers__confirm-card-grid">
        <ConfirmationSectionCard title="Thông tin khách hàng" icon={<UserOutlined />} tone="blue">
          <ConfirmationInfoRow label="Khách hàng" value={customer?.name ?? "-"} />
          <ConfirmationInfoRow label="Số điện thoại" value={customer?.phone ?? "-"} />
          <ConfirmationInfoRow label="Ghi chú" value={noteValue ? noteValue : <em>Không có</em>} />
        </ConfirmationSectionCard>

        <ConfirmationSectionCard title="Tổng quan thanh toán" icon={<WalletOutlined />} tone="green">
          <ConfirmationInfoRow label="Tổng phải trả" value={money(paymentBreakdown.totalPayable)} />
          <ConfirmationInfoRow label="Đã trả tiền đặt cọc" value={money(paymentBreakdown.depositPaid)} tone={paymentBreakdown.depositPaid > 0 ? "success" : "default"} />
          <ConfirmationInfoRow label="Đã trừ tiền dư/cọc" value={money(paymentBreakdown.balanceApplied)} tone={paymentBreakdown.balanceApplied > 0 ? "success" : "default"} />
          <ConfirmationInfoRow label="Còn phải trả" value={money(paymentBreakdown.remainingAmount)} tone="danger" highlight />
        </ConfirmationSectionCard>
      </div>

      <div className="payment-vouchers__confirm-alert">
        <InfoCircleOutlined />
        <div>
          <Text strong>Lưu ý quan trọng</Text>
          <Text>Sau khi xác nhận, hệ thống sẽ tạo phiếu thanh toán với trạng thái “Chờ thanh toán”.</Text>
          <Text>Bạn có thể xem và quản lý phiếu tại danh sách phiếu thanh toán.</Text>
        </div>
      </div>
    </div>;
  };

  return <div className="payment-vouchers">
    <PaymentPageHeader
      canCreate={canCreate}
      loading={loading}
      onCreate={openWizard}
      onRefresh={() => void loadData()}
    />

    <PaymentSummaryCards
      totalPackages={packages.length}
      actualWeight={totalEligibleActualWeight}
      chargeableWeight={totalEligibleChargeableWeight}
      selectedCount={selectedPackages.length}
    />

    <Card className="payment-vouchers__card">
      <SectionHeader title="Danh sách vận đơn đủ điều kiện" />
      <PaymentToolbar loading={loading} onRefresh={() => void loadData()} />
      <EligibleShipmentTable
        columns={packageColumns}
        dataSource={packages}
        loading={loading}
        selectedKeys={selectedKeys}
        selectedCount={selectedPackages.length}
        canCreate={canCreate}
        onSelectionChange={setSelectedKeys}
        onCreate={openWizard}
      />
    </Card>

    <PaymentVoucherSection
      activeKey={activeVoucherTab}
      columns={voucherColumns}
      dataSource={vouchers}
      loading={loading}
      onTabChange={setActiveVoucherTab}
    />

    <Modal
      className="payment-vouchers__wizard-modal"
      title={<div className="payment-vouchers__modal-heading"><div className="payment-vouchers__modal-title"><span className="payment-vouchers__modal-title-icon"><FileTextOutlined /></span><div className="payment-vouchers__modal-title-copy"><Text strong>Tạo phiếu thanh toán</Text><Text type="secondary">Xác nhận thông tin và hoàn tất tạo phiếu thanh toán</Text></div></div>{renderWizardStepper(activeStep)}</div>}
      open={wizardOpen}
      width={1080}
      onCancel={() => setWizardOpen(false)}
      centered
      destroyOnHidden
      
      footer={<div className="payment-vouchers__wizard-footer"><Button icon={<ArrowLeftOutlined />} onClick={() => activeStep === 0 ? setWizardOpen(false) : setActiveStep((step) => step - 1)}>{activeStep === 0 ? "Hủy" : "Quay lại"}</Button>{activeStep < 4 ? <Button type="primary" icon={<ArrowRightOutlined />} disabled={!canCreate} loading={loading} onClick={() => void handleNext()}>Tiếp tục</Button> : <Button type="primary" icon={<CheckOutlined />} disabled={!canCreate || submitLoading} loading={submitLoading} onClick={() => void handleCreate()}>Xác nhận tạo phiếu</Button>}</div>}
      styles={{ body: modalBodyStyle }}
    >
      {renderStep()}
    </Modal>

    <Modal open={Boolean(successVoucher)} footer={null} onCancel={() => setSuccessVoucher(null)}>
      <Result status="success" title="Tạo phiếu thanh toán thành công!" subTitle={successVoucher?.voucher_code} extra={<Space direction="vertical" style={{ width: "100%" }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Khách hàng">{successVoucher?.customer.name}</Descriptions.Item>
          <Descriptions.Item label="Tổng giá trị đơn hàng">{money(successVoucher?.base_amount_vnd)}</Descriptions.Item>
          <Descriptions.Item label="Tổng trước khấu trừ">{money(toMoneyNumber(successVoucher?.base_amount_vnd) + toMoneyNumber(successVoucher?.shipping_fee_total) + toMoneyNumber(successVoucher?.domestic_shipping_fee) + toMoneyNumber(successVoucher?.surcharge_total))}</Descriptions.Item>
          <Descriptions.Item label="Tiền cọc được khấu trừ">{money(successVoucher?.deposit_applied)}</Descriptions.Item>
          <Descriptions.Item label="Tiền dư áp dụng">{money(successVoucher?.customer_credit_applied)}</Descriptions.Item>
          <Descriptions.Item label="Số tiền cần thanh toán">{money(successVoucher?.total_amount)}</Descriptions.Item>
          <Descriptions.Item label="Đã thanh toán">{money(successVoucher?.paid_amount)}</Descriptions.Item>
          <Descriptions.Item label="Còn phải trả">{money(successVoucher?.remaining_amount)}</Descriptions.Item>
          <Descriptions.Item label="Trạng thái"><Tag color="gold">Chờ thanh toán</Tag></Descriptions.Item>
        </Descriptions>
        <Space><Button onClick={() => setSuccessVoucher(null)}>Đóng</Button><Button type="primary" onClick={() => successVoucher && navigate(`/payment-vouchers/${successVoucher.id}`)}>Xem chi tiết phiếu</Button></Space>
      </Space>} />
    </Modal>
  </div>;
};
