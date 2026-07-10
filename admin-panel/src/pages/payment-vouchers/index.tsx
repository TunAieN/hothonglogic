import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Key } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Col, Descriptions, Form, Input, InputNumber, Modal, Radio, Result, Row, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import { BankOutlined, CheckOutlined, CreditCardOutlined, DeleteOutlined, DollarOutlined, FileDoneOutlined, PlusOutlined, ReloadOutlined, ShoppingOutlined, WalletOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { createPaymentVoucher, fetchDefaultPaymentAccount, fetchEligiblePaymentPackages, fetchPaymentVouchers, getPaymentErrorMessage, previewPaymentVoucher } from "./api";
import type { EligiblePaymentPackage, PaymentAccount, PaymentVoucher, VoucherPreview, VoucherSurchargeInput } from "./types";

const { Text, Title } = Typography;

const money = (value?: number | null) => `${Number(value ?? 0).toLocaleString("vi-VN")} đ`;
const kg = (value?: number | null) => `${Number(value ?? 0).toLocaleString("vi-VN")} kg`;
const getCustomer = (item?: EligiblePaymentPackage) => item?.cn_package?.order?.customer;
const getOrderCode = (item?: EligiblePaymentPackage) => item?.cn_package?.order?.order_code ?? "-";
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
  paddingTop: 20,
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

const SummaryRow = ({ label, value, danger = false }: { label: string; value: ReactNode; danger?: boolean }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", borderBottom: "1px solid #eef0f3" }}>
    <div style={{ padding: "10px 14px", background: "#fbfbfc" }}><Text type="secondary">{label}</Text></div>
    <div style={{ padding: "10px 14px" }}><Text strong={danger} type={danger ? "danger" : undefined}>{value}</Text></div>
  </div>
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

      if (!values.receiver_type) {
        values.receiver_type = "pickup_at_warehouse";
      }
      if (!values.payment_method_expected) {
        values.payment_method_expected = "bank_transfer";
      }
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
    { title: "Mã vận đơn", dataIndex: "tracking_number_snapshot", width: 180 },
    { title: "Mã đơn hàng", render: (_, item) => getOrderCode(item), width: 150 },
    { title: "Khách hàng", render: (_, item) => getCustomer(item)?.name ?? item.customer_name_snapshot ?? "-" },
    { title: "Cân thực tế", render: (_, item) => kg(item.actual_weight), width: 120 },
    { title: "Cân tính phí", render: (_, item) => kg(getChargeableWeight(item)), width: 120 },
    { title: "Trạng thái", render: () => <Tag color="success">Đã kiểm</Tag>, width: 120 },
  ];

  const voucherColumns: ColumnsType<PaymentVoucher> = [
    { title: "Mã phiếu", dataIndex: "voucher_code", render: (value, item) => <Button type="link" onClick={() => navigate(`/payment-vouchers/${item.id}`)}>{value}</Button> },
    { title: "Khách hàng", render: (_, item) => item.customer?.name },
    { title: "Tổng phải trả", render: (_, item) => money(item.total_amount), align: "right" },
    { title: "Đã thanh toán", render: (_, item) => money(item.paid_amount), align: "right" },
    { title: "Còn phải trả", render: (_, item) => money(item.remaining_amount), align: "right" },
    { title: "Trạng thái", render: (_, item) => <Tag color={statusLabels[item.status]?.color}>{statusLabels[item.status]?.text ?? item.status}</Tag> },
    { title: "Người tạo", render: (_, item) => item.creator?.name ?? "-" },
    { title: "Hành động", render: (_, item) => <Button type="link" onClick={() => navigate(`/payment-vouchers/${item.id}`)}>Xem chi tiết</Button> },
  ];

  const selectedPackageColumns: ColumnsType<EligiblePaymentPackage> = [
    ...packageColumns,
    {
      title: "Thao tác",
      width: 90,
      align: "center",
      render: (_, item) => <Button icon={<DeleteOutlined />} onClick={() => setSelectedKeys((keys) => keys.filter((key) => key !== item.id))} />,
    },
  ];

  const renderPaymentMethodCard = (value: string, label: string, icon: ReactNode) => (
    <Form.Item noStyle shouldUpdate key={value}>
      {({ getFieldValue }) => {
        const selected = getFieldValue("payment_method_expected") === value;
        return (
          <button
            type="button"
            onClick={() => form.setFieldsValue({ payment_method_expected: value })}
            style={{
              ...panelStyle,
              position: "relative",
              width: "100%",
              minHeight: 78,
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              cursor: "pointer",
              textAlign: "left",
              borderColor: selected ? "#1677ff" : "#e5e7eb",
              background: selected ? "#f0f6ff" : "#fff",
              color: selected ? "#0958d9" : "#111827",
            }}
          >
            <span style={{ color: selected ? "#1677ff" : "#16a34a", fontSize: 22 }}>{icon}</span>
            <Text strong>{label}</Text>
            {selected && <span style={{ position: "absolute", top: 12, right: 12, width: 18, height: 18, borderRadius: "50%", background: "#1677ff", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}><CheckOutlined /></span>}
          </button>
        );
      }}
    </Form.Item>
  );

  const renderStep = () => {
    const customer = getCustomer(selectedPackages[0]);
    const paymentAccount = preview?.payment_account ?? defaultPaymentAccount;
    const transferContent = preview?.transfer_content ?? "TT <ma phieu thanh toan>";

    if (activeStep === 0) {
      return <Space direction="vertical" size={14} style={{ width: "100%" }}>
        {selectedCustomerIds.length > 1 && <Tag color="red">Danh sách đang có nhiều khách hàng, vui lòng bỏ bớt vận đơn.</Tag>}
        <Row gutter={18}>
          <Col span={8}><SummaryTile icon={<ShoppingOutlined />} label="Tổng số kiện" value={selectedPackages.length} /></Col>
          <Col span={8}><SummaryTile icon={<WalletOutlined />} label="Tổng cân thực tế" value={kg(selectedActualWeight)} tone="green" /></Col>
          <Col span={8}><SummaryTile icon={<CreditCardOutlined />} label="Tổng cân tính phí" value={kg(Number(selectedChargeableWeight.toFixed(2)))} tone="purple" /></Col>
        </Row>
        <Table rowKey="id" pagination={false} columns={selectedPackageColumns} dataSource={selectedPackages} size="middle" bordered />
      </Space>;
    }

    if (activeStep === 1) {
      return <Form form={form} layout="vertical" requiredMark>
        <Row gutter={18}>
          <Col span={12}><Form.Item label="Khách hàng"><Input value={customer?.name} readOnly /></Form.Item></Col>
          <Col span={12}><Form.Item label="Số điện thoại"><Input value={customer?.phone ?? ""} readOnly /></Form.Item></Col>
          <Col span={12}><Form.Item label="Kho hàng"><Input value={selectedPackages[0]?.receipt?.warehouse?.name ?? "Kho Việt Nam"} readOnly /></Form.Item></Col>
          <Col span={12}><Form.Item label="Ngày tạo"><Input value={new Date().toLocaleDateString("vi-VN")} readOnly /></Form.Item></Col>
          <Col span={12}><Form.Item name="receiver_type" label="Hình thức nhận hàng" rules={[{ required: true, message: "Vui lòng chọn hình thức nhận hàng" }]}><Select options={[{ value: "pickup_at_warehouse", label: "Nhận tại kho" }, { value: "local_delivery", label: "Giao nội thành" }, { value: "carrier_delivery", label: "Gửi nhà xe/đơn vị vận chuyển" }]} /></Form.Item></Col>
          <Col span={12}><Form.Item noStyle shouldUpdate>{({ getFieldValue }) => <Form.Item name="delivery_address" label="Địa chỉ giao" rules={getFieldValue("receiver_type") === "pickup_at_warehouse" ? [] : [{ required: true, message: "Vui lòng nhập địa chỉ giao" }]}><Input /></Form.Item>}</Form.Item></Col>
          <Col span={24}><Form.Item name="note" label="Ghi chú"><Input.TextArea rows={3} placeholder="Nhập ghi chú (nếu có)..." /></Form.Item></Col>
        </Row>
      </Form>;
    }

    if (activeStep === 2) {
      const summaryItems = preview ? [
        ["Tổng phí vận chuyển", money(preview.shipping_fee_total)],
        ["Phí nội địa", money(preview.domestic_shipping_fee)],
        ["Tổng phụ phí", money(preview.surcharge_total)],
        ["Tổng phải trả", money(preview.total_amount)],
        ["Tiền cọc", money(preview.deposit_applied)],
        ["Tiền dư áp dụng", money(preview.customer_credit_applied)],
      ] : [];

      return <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Button icon={<ReloadOutlined />} onClick={() => void refreshPreview()} loading={loading}>Tính lại tiền</Button>
        <Table rowKey="id" pagination={false} dataSource={preview?.packages ?? []} size="middle" bordered scroll={{ x: 980 }} columns={[
          { title: "Mã vận đơn", dataIndex: "tracking_number", width: 150 },
          { title: "Cân thực tế", render: (_, item) => kg((Number(item.actual_weight))), align: "right", width: 110 },
          { title: "Cân quy đổi", render: (_, item) => kg((Number(item.volumetric_weight))), align: "right", width: 110 },
          { title: "Cân tính phí", render: (_, item) => kg((Number(item.chargeable_weight))), align: "right", width: 110 },
          { title: "Khung giá áp dụng", render: (_, item) => item.rate_description ?? "-", width: 180 },
          { title: "Đơn giá", render: (_, item) => money((Number(item.unit_price ?? item.price_per_kg))), align: "right", width: 120 },
          { title: "Kiểu tính giá", render: (_, item) => item.price_type === "fixed" ? "Giá cố định" : "Giá theo kg", width: 120 },
          { title: "Phụ phí", render: (_, item) => money((Number(item.surcharge_amount))), align: "right", width: 110 },
          { title: "Thành tiền", render: (_, item) => money((Number(item.total_amount))), align: "right", width: 120 },
        ]} />
        <div style={{ ...panelStyle, padding: 14 }}>
          <Text strong>Phụ phí</Text>
          <div style={{ marginTop: 12 }}>
            <Space direction="vertical" style={{ width: "100%" }}>
              {surcharges.map((item, index) => <Space key={index} wrap style={{ width: "100%" }}>
                <Select style={{ width: 190 }} value={item.vn_package_id} placeholder="Theo phiếu" allowClear onChange={(value) => setSurcharges((rows) => rows.map((row, i) => i === index ? { ...row, vn_package_id: value } : row))} options={selectedPackages.map((pkg) => ({ value: pkg.id, label: pkg.tracking_number_snapshot }))} />
                <Select style={{ width: 170 }} value={item.surcharge_type} onChange={(value) => setSurcharges((rows) => rows.map((row, i) => i === index ? { ...row, surcharge_type: value } : row))} options={[
                  { value: "packing", label: "Đóng gói" },
                  { value: "inspection", label: "Kiểm hàng" },
                  { value: "fragile", label: "Hàng dễ vỡ" },
                  { value: "heavy", label: "Hàng nặng" },
                  { value: "oversized", label: "Quá khổ" },
                  { value: "domestic_delivery", label: "Giao nội địa" },
                  { value: "other", label: "Khác" },
                ]} />
                <InputNumber min={0} value={item.amount} onChange={(value) => setSurcharges((rows) => rows.map((row, i) => i === index ? { ...row, amount: Number(value ?? 0) } : row))} />
                <Input style={{ flex: 1, minWidth: 220 }} placeholder="Ghi chú" value={item.note} onChange={(event) => setSurcharges((rows) => rows.map((row, i) => i === index ? { ...row, note: event.target.value } : row))} />
                <Button icon={<DeleteOutlined />} onClick={() => setSurcharges((rows) => rows.filter((_, i) => i !== index))} />
              </Space>)}
              <Button icon={<PlusOutlined />} onClick={() => setSurcharges((rows) => [...rows, { surcharge_type: "other", amount: 0 }])}>Thêm phụ phí</Button>
            </Space>
          </div>
        </div>
        {preview && <div style={{ ...panelStyle, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {summaryItems.map(([label, value]) => <SummaryRow key={label} label={label} value={value} />)}
          </div>
          <SummaryRow label="Còn phải trả" value={money(preview.remaining_amount)} danger />
        </div>}
      </Space>;
    }

    if (activeStep === 3) {
      return <Form form={form} layout="vertical">
        <Form.Item name="payment_method_expected" label="Phương thức thanh toán dự kiến" rules={[{ required: true, message: "Vui lòng chọn phương thức thanh toán" }]}>
          <Radio.Group style={{ display: "none" }} options={[{ value: "bank_transfer", label: "Chuyển khoản" }, { value: "cash", label: "Tiền mặt" }, { value: "mixed", label: "Kết hợp" }]} />
        </Form.Item>
        <Row gutter={14}>
          <Col span={8}>{renderPaymentMethodCard("bank_transfer", "Chuyển khoản", <BankOutlined />)}</Col>
          <Col span={8}>{renderPaymentMethodCard("cash", "Tiền mặt", <DollarOutlined />)}</Col>
          <Col span={8}>{renderPaymentMethodCard("mixed", "Kết hợp", <CreditCardOutlined />)}</Col>
        </Row>
        <Form.Item shouldUpdate noStyle>{({ getFieldValue }) => ["bank_transfer", "mixed"].includes(getFieldValue("payment_method_expected")) ? <div style={{ ...softPanelStyle, marginTop: 16, padding: 18 }}>
          <Row gutter={[18, 10]}>
            <Col span={2}><div style={{ width: 46, height: 46, borderRadius: 10, background: "#eff6ff", color: "#1677ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}><BankOutlined /></div></Col>
            <Col span={11}><SummaryRow label="Ngân hàng" value={paymentAccount?.bank_name ?? "-"} /><SummaryRow label="Chủ tài khoản" value={paymentAccount?.account_holder ?? "-"} /></Col>
            <Col span={11}><SummaryRow label="Số tài khoản" value={paymentAccount?.account_number ?? "-"} /><SummaryRow label="Nội dung chuyển khoản" value={transferContent} /></Col>
            {!paymentAccount && <Col span={24}><Text type="danger">Chưa cấu hình tài khoản nhận tiền mặc định đang hoạt động.</Text></Col>}
          </Row>
        </div> : <div style={{ ...softPanelStyle, marginTop: 16, padding: 18 }}><Input placeholder="Ghi chú thu tiền mặt dự kiến" /></div>}</Form.Item>
      </Form>;
    }

    return <div style={{ ...panelStyle, display: "grid", gridTemplateColumns: "190px 1fr", overflow: "hidden", minHeight: 190 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #eef0f3", background: "#fcfcfd" }}>
        <div style={{ width: 78, height: 78, borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}><FileDoneOutlined /></div>
      </div>
      <div>
        <SummaryRow label="Khách hàng" value={customer?.name ?? "-"} />
        <SummaryRow label="Số điện thoại" value={customer?.phone ?? "-"} />
        <SummaryRow label="Danh sách vận đơn" value={`${selectedPackages.length} kiện`} />
        <SummaryRow label="Tổng phải trả" value={money(preview?.total_amount)} />
        <SummaryRow label="Đã trừ tiền dư/cọc" value={money((preview?.deposit_applied ?? 0) + (preview?.customer_credit_applied ?? 0))} />
        <SummaryRow label="Còn phải trả" value={money(preview?.remaining_amount)} danger />
      </div>
    </div>;
  };

  return <Space direction="vertical" size="large" style={{ width: "100%" }}>
    <Card>
      <Row justify="space-between" align="middle" gutter={[16, 16]}>
        <Col><Title level={2} style={{ margin: 0 }}>Vận đơn cần thanh toán</Title><Text type="secondary">Chọn vận đơn đã về kho Việt Nam và đã kiểm để tạo phiếu thanh toán.</Text></Col>
        <Col><Space wrap><Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Tải lại</Button><Button type="primary" disabled={!canCreate} onClick={openWizard}>Tạo yêu cầu thanh toán</Button></Space></Col>
      </Row>
    </Card>

    <Card title="Danh sách vận đơn đủ điều kiện">
      <Table rowKey="id" loading={loading} columns={packageColumns} dataSource={packages} rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }} pagination={{ pageSize: 10 }} />
      {selectedPackages.length > 0 && <Text type={canCreate ? "secondary" : "danger"}>Đã chọn {selectedPackages.length} vận đơn{canCreate ? "." : ", nhưng đang trộn nhiều khách hàng."}</Text>}
    </Card>

    <Card title="Phiếu thanh toán">
      <Tabs activeKey={activeVoucherTab} onChange={setActiveVoucherTab} items={[
        { key: "waiting_payment", label: "Chờ thanh toán" },
        { key: "partial_paid", label: "Thanh toán một phần" },
        { key: "paid", label: "Đã thanh toán" },
        { key: "cancelled", label: "Đã hủy" },
      ].map((tab) => ({ ...tab, children: <Table rowKey="id" loading={loading} columns={voucherColumns} dataSource={vouchers} pagination={{ pageSize: 10 }} /> }))} />
    </Card>

    <Modal
      title={<div><Text strong style={{ fontSize: 16 }}>Tạo phiếu thanh toán</Text>{renderWizardStepper(activeStep)}</div>}
      open={wizardOpen}
      width={1080}
      onCancel={() => setWizardOpen(false)}
      centered
      destroyOnHidden
      footer={<div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}><Button onClick={() => activeStep === 0 ? setWizardOpen(false) : setActiveStep((step) => step - 1)}>{activeStep === 0 ? "Hủy" : "Quay lại"}</Button>{activeStep < 4 ? <Button type="primary" disabled={!canCreate} loading={loading} onClick={() => void handleNext()}>Tiếp tục</Button> : <Button type="primary" loading={submitLoading} onClick={() => void handleCreate()}>Xác nhận tạo phiếu</Button>}</div>}
      styles={{ body: modalBodyStyle }}
    >
      {renderStep()}
    </Modal>

    <Modal open={Boolean(successVoucher)} footer={null} onCancel={() => setSuccessVoucher(null)}>
      <Result status="success" title="Tạo phiếu thanh toán thành công!" subTitle={successVoucher?.voucher_code} extra={<Space direction="vertical" style={{ width: "100%" }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Khách hàng">{successVoucher?.customer.name}</Descriptions.Item>
          <Descriptions.Item label="Tổng phải trả">{money(successVoucher?.total_amount)}</Descriptions.Item>
          <Descriptions.Item label="Đã thanh toán">{money(successVoucher?.paid_amount)}</Descriptions.Item>
          <Descriptions.Item label="Còn phải trả">{money(successVoucher?.remaining_amount)}</Descriptions.Item>
          <Descriptions.Item label="Trạng thái"><Tag color="gold">Chờ thanh toán</Tag></Descriptions.Item>
        </Descriptions>
        <Space><Button onClick={() => setSuccessVoucher(null)}>Đóng</Button><Button type="primary" onClick={() => successVoucher && navigate(`/payment-vouchers/${successVoucher.id}`)}>Xem chi tiết phiếu</Button></Space>
      </Space>} />
    </Modal>
  </Space>;
};