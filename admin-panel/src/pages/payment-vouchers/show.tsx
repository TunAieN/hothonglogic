import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { useNavigate, useParams } from "react-router";
import { Button, Card, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Radio, Space, Table, Tag, Typography, message } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, PrinterOutlined, SendOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { cancelPaymentVoucher, confirmPaymentTransaction, fetchPaymentVoucher, getPaymentErrorMessage } from "./api";
import type { PaymentTransaction, PaymentVoucher } from "./types";

const { Text, Title } = Typography;
const money = (value?: number | null) => `${Number(value ?? 0).toLocaleString("vi-VN")} đ`;
const statusLabels: Record<string, { text: string; color: string }> = {
  waiting_payment: { text: "Chờ thanh toán", color: "gold" },
  partial_paid: { text: "Thanh toán một phần", color: "blue" },
  paid: { text: "Đã thanh toán", color: "green" },
  cancelled: { text: "Đã hủy", color: "red" },
};

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

  const transactionColumns: ColumnsType<PaymentTransaction> = [
    { title: "Mã giao dịch", dataIndex: "transaction_code" },
    { title: "Phương thức", dataIndex: "payment_method", render: (value) => value === "cash" ? "Tiền mặt" : "Chuyển khoản" },
    { title: "Số tiền", dataIndex: "amount", render: money, align: "right" },
    { title: "Ngân hàng", dataIndex: "bank_name" },
    { title: "Thời gian nhận", dataIndex: "received_at", render: (value) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-" },
    { title: "Trạng thái", dataIndex: "status", render: (value) => <Tag color={value === "confirmed" ? "green" : "default"}>{value}</Tag> },
  ];

  if (!voucher) {
    return <Card loading={loading}>Không tìm thấy phiếu thanh toán.</Card>;
  }

  const canPay = ["waiting_payment", "partial_paid"].includes(voucher.status);
  const canCancel = canPay;
  const hasBankSnapshot = Boolean(voucher.transfer_content || voucher.bank_name_snapshot || voucher.bank_account_number_snapshot || voucher.bank_account_holder_snapshot);

  return <Space direction="vertical" size="large" style={{ width: "100%" }}>
    <Card>
      <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
        <Space direction="vertical">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/payment-vouchers")}>Quay lại</Button>
          <Title level={2} style={{ margin: 0 }}>{voucher.voucher_code}</Title>
          <Tag color={statusLabels[voucher.status]?.color}>{statusLabels[voucher.status]?.text ?? voucher.status}</Tag>
        </Space>
        <Space wrap>
          {canPay && <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => { form.setFieldsValue({ amount: voucher.remaining_amount, payment_method: voucher.payment_method_expected === "cash" ? "cash" : "bank_transfer", received_at: dayjs() }); setPaymentOpen(true); }}>Xác nhận thanh toán</Button>}
          {canPay && <Button icon={<SendOutlined />}>Gửi phiếu</Button>}
          <Button icon={<PrinterOutlined />}>In phiếu</Button>
          {canCancel && <Button danger icon={<CloseCircleOutlined />} onClick={() => setCancelOpen(true)}>Hủy phiếu</Button>}
        </Space>
      </Space>
    </Card>


    <Card title="Thông tin phiếu">
      <Descriptions bordered column={2}>
        <Descriptions.Item label="Khách hàng">{voucher.customer.name}</Descriptions.Item>
        <Descriptions.Item label="Số điện thoại">{voucher.customer.phone}</Descriptions.Item>
        <Descriptions.Item label="Kho hàng">{voucher.warehouse?.name ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="Ngày tạo">{dayjs(voucher.created_at).format("DD/MM/YYYY HH:mm")}</Descriptions.Item>
        <Descriptions.Item label="Hình thức nhận">{voucher.receiver_type}</Descriptions.Item>
        <Descriptions.Item label="Địa chỉ giao">{voucher.delivery_address ?? voucher.customer.address ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="Tổng phí vận chuyển">{money(voucher.shipping_fee_total)}</Descriptions.Item>
        <Descriptions.Item label="Tổng phụ phí">{money(voucher.surcharge_total)}</Descriptions.Item>
        <Descriptions.Item label="Tiền cọc">{money(voucher.deposit_applied)}</Descriptions.Item>
        <Descriptions.Item label="Tiền dư áp dụng">{money(voucher.customer_credit_applied)}</Descriptions.Item>
        <Descriptions.Item label="Đã thanh toán">{money(voucher.paid_amount)}</Descriptions.Item>
        <Descriptions.Item label="Còn phải trả"><Text strong type="danger">{money(voucher.remaining_amount)}</Text></Descriptions.Item>
      </Descriptions>
    </Card>

    {hasBankSnapshot && <Card title="Thông tin chuyển khoản">
      <Descriptions bordered column={2}>
        <Descriptions.Item label="Ngân hàng">{voucher.bank_name_snapshot ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="Số tài khoản">{voucher.bank_account_number_snapshot ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="Chủ tài khoản">{voucher.bank_account_holder_snapshot ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="Nội dung chuyển khoản">{voucher.transfer_content ?? "-"}</Descriptions.Item>
      </Descriptions>
    </Card>}
    <Card title="Danh sách kiện">
      <Table rowKey="id" pagination={false} dataSource={voucher.packages} columns={[
        { title: "Mã vận đơn", render: (_, item) => item.vnPackage.tracking_number_snapshot },
        { title: "Mã đơn hàng", render: (_, item) => item.vnPackage.cn_package?.order?.order_code ?? "-" },
        { title: "Cân tính phí", render: (_, item) => `${item.chargeable_weight} kg`, align: "right" },
        { title: "Giá cước", render: (_, item) => money(item.price_per_kg), align: "right" },
        { title: "Phí vận chuyển", render: (_, item) => money(item.shipping_fee), align: "right" },
        { title: "Phụ phí", render: (_, item) => money(item.surcharge_amount), align: "right" },
        { title: "Thành tiền", render: (_, item) => money(item.total_amount), align: "right" },
      ]} />
    </Card>

    <Card title="Lịch sử giao dịch">
      <Table rowKey="id" pagination={false} dataSource={voucher.transactions} columns={transactionColumns} />
    </Card>

    {voucher.invoice && <Card title="Hóa đơn">
      <Descriptions bordered column={2}>
        <Descriptions.Item label="Mã hóa đơn">{voucher.invoice.invoice_code}</Descriptions.Item>
        <Descriptions.Item label="Ngày phát hành">{voucher.invoice.issued_at ? dayjs(voucher.invoice.issued_at).format("DD/MM/YYYY HH:mm") : "-"}</Descriptions.Item>
        <Descriptions.Item label="Tổng tiền">{money(voucher.invoice.total_amount)}</Descriptions.Item>
        <Descriptions.Item label="Trạng thái">{voucher.invoice.status}</Descriptions.Item>
      </Descriptions>
    </Card>}

    <Modal title="Xác nhận thanh toán" open={paymentOpen} onCancel={() => setPaymentOpen(false)} onOk={() => void handleConfirmPayment()} okText="Xác nhận đã nhận tiền">
      <Form form={form} layout="vertical">
        <Form.Item name="payment_method" label="Phương thức" rules={[{ required: true }]}><Radio.Group options={[{ value: "bank_transfer", label: "Chuyển khoản" }, { value: "cash", label: "Tiền mặt" }]} /></Form.Item>
        <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => getFieldValue("payment_method") === "bank_transfer" ? <>
          <Form.Item name="bank_name" label="Ngân hàng nhận" rules={[{ required: true, message: "Vui lòng nhập ngân hàng" }]}><Input /></Form.Item>
          <Form.Item name="bank_transaction_code" label="Mã giao dịch ngân hàng"><Input /></Form.Item>
        </> : null}</Form.Item>
        <Form.Item name="amount" label="Số tiền nhận" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="received_at" label="Thời gian nhận" rules={[{ required: true }]}><DatePicker showTime style={{ width: "100%" }} /></Form.Item>
        <Form.Item label="Người xác nhận"><Input value="Người dùng hiện tại" readOnly /></Form.Item>
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>

    <Modal title="Hủy phiếu thanh toán" open={cancelOpen} onCancel={() => setCancelOpen(false)} onOk={() => void handleCancel()} okText="Hủy phiếu" okButtonProps={{ danger: true }}>
      <Form form={cancelForm} layout="vertical">
        <Form.Item name="reason" label="Lý do hủy" rules={[{ required: true, message: "Vui lòng nhập lý do hủy" }]}><Input.TextArea rows={4} /></Form.Item>
      </Form>
    </Modal>
  </Space>;
};
