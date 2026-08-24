import { useMemo } from "react";
import { useNavigate } from "react-router";
import dayjs from "dayjs";
import { Alert, Button, Card, DatePicker, Form, Input, InputNumber, Select, Space, Table, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, SendOutlined } from "@ant-design/icons";
import { mockInvoiceCustomers, mockInvoiceOrders } from "./mockData";
import type { InvoiceOrderOption, InvoiceType, PaymentMethod } from "./types";
import { buildInvoiceTotals, formatDate, money, safeText } from "./invoiceUtils";
import "./invoice-pages.css";

const { Text, Title } = Typography;

type FeeFormItem = {
  description?: string;
  quantity?: number;
  unit_price?: number;
};

type InvoiceFormValues = {
  invoice_type: InvoiceType;
  customer_id?: string;
  order_id?: string;
  issued_at: dayjs.Dayjs;
  due_at: dayjs.Dayjs;
  payment_method: PaymentMethod;
  note?: string;
  discount_amount?: number;
  tax_amount?: number;
  paid_amount?: number;
  items: FeeFormItem[];
};

const invoiceTypeOptions = [
  { value: "order", label: "Hóa đơn đơn hàng" },
  { value: "shipping", label: "Hóa đơn vận chuyển" },
  { value: "service", label: "Hóa đơn dịch vụ" },
  { value: "adjustment", label: "Hóa đơn điều chỉnh" },
];

const paymentMethodOptions = [
  { value: "bank_transfer", label: "Chuyển khoản" },
  { value: "cash", label: "Tiền mặt" },
  { value: "e_wallet", label: "Ví điện tử" },
  { value: "other", label: "Khác" },
];

const initialValues: InvoiceFormValues = {
  invoice_type: "order",
  issued_at: dayjs(),
  due_at: dayjs().add(7, "day"),
  payment_method: "bank_transfer",
  discount_amount: 0,
  tax_amount: 0,
  paid_amount: 0,
  items: [
    { description: "Tiền hàng", quantity: 1, unit_price: 0 },
    { description: "Phí vận chuyển quốc tế", quantity: 1, unit_price: 0 },
  ],
};

export const InvoiceCreatePage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm<InvoiceFormValues>();
  const customerId = Form.useWatch("customer_id", form);
  const watchedItems = Form.useWatch("items", form) ?? initialValues.items;
  const discountAmount = Form.useWatch("discount_amount", form) ?? 0;
  const taxAmount = Form.useWatch("tax_amount", form) ?? 0;
  const paidAmount = Form.useWatch("paid_amount", form) ?? 0;

  const selectedCustomer = useMemo(
    () => mockInvoiceCustomers.find((customer) => customer.id === customerId),
    [customerId],
  );

  const orderOptions = useMemo(
    () => mockInvoiceOrders.filter((order) => order.customer_id === customerId),
    [customerId],
  );

  const totals = buildInvoiceTotals(watchedItems, discountAmount, taxAmount, paidAmount);

  const handleCancel = () => navigate("/invoices");

  const handleSaveDraft = async () => {
    await form.validateFields(["invoice_type", "customer_id"]);
    message.success("Đã lưu nháp hóa đơn trên dữ liệu demo.");
  };

  const handlePublish = async () => {
    await form.validateFields();
    // TODO: Call API to create invoice
    message.success("Đã phát hành hóa đơn demo thành công.");
    navigate("/invoices");
  };

  const orderColumns: ColumnsType<InvoiceOrderOption> = [
    { title: "Mã đơn hàng", dataIndex: "order_code" },
    { title: "Ngày tạo", dataIndex: "created_at", render: (value: string) => formatDate(value) },
    { title: "Giá trị đơn hàng", dataIndex: "total_amount", align: "right", render: (value: number) => money(value) },
    { title: "Trạng thái", dataIndex: "status", render: (value: string) => safeText(value) },
  ];

  return (
    <div className="invoice-page">
      <div className="invoice-page__header">
        <Space align="start">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/invoices")}>Quay lại</Button>
          <div>
            <Title level={2} className="invoice-page__title">Tạo hóa đơn</Title>
            <Text className="invoice-muted">Thiết lập hóa đơn demo, sẵn sàng thay dữ liệu mock bằng API sau này.</Text>
          </div>
        </Space>
      </div>

      <Alert
        className="invoice-alert"
        type="info"
        showIcon
        message="Form t?o h?a ??n hi?n v?n l? demo"
        description="List v? chi ti?t h?a ??n ?? d?ng API th?t. Backend hi?n ch?a c? mutation t?o h?a ??n th? c?ng, n?n form n?y ch?a ghi d? li?u v?o c? s? d? li?u."
      />

      <Form<InvoiceFormValues> form={form} layout="vertical" initialValues={initialValues} className="invoice-create-form">
        <div className="invoice-create-grid">
          <main className="invoice-create-main">
            <Card title="Thông tin chung" className="invoice-card">
              <div className="invoice-form-grid">
                <Form.Item name="invoice_type" label="Loại hóa đơn" rules={[{ required: true, message: "Vui lòng chọn loại hóa đơn" }]}>
                  <Select options={invoiceTypeOptions} />
                </Form.Item>
                <Form.Item name="customer_id" label="Khách hàng" rules={[{ required: true, message: "Vui lòng chọn khách hàng" }]}>
                  <Select
                    showSearch
                    placeholder="Chọn khách hàng"
                    optionFilterProp="label"
                    options={mockInvoiceCustomers.map((customer) => ({ value: customer.id, label: customer.name }))}
                    onChange={() => form.setFieldValue("order_id", undefined)}
                  />
                </Form.Item>
                <Form.Item name="order_id" label="Đơn hàng liên quan">
                  <Select
                    disabled={!customerId}
                    placeholder="Chọn đơn hàng"
                    options={orderOptions.map((order) => ({ value: order.id, label: order.order_code }))}
                  />
                </Form.Item>
                <Form.Item name="payment_method" label="Phương thức thanh toán dự kiến">
                  <Select options={paymentMethodOptions} />
                </Form.Item>
                <Form.Item name="issued_at" label="Ngày phát hành" rules={[{ required: true, message: "Vui lòng chọn ngày phát hành" }]}>
                  <DatePicker format="DD/MM/YYYY" />
                </Form.Item>
                <Form.Item name="due_at" label="Ngày đến hạn" rules={[{ required: true, message: "Vui lòng chọn ngày đến hạn" }]}>
                  <DatePicker format="DD/MM/YYYY" />
                </Form.Item>
              </div>
              <Form.Item name="note" label="Ghi chú">
                <Input.TextArea rows={3} placeholder="Nhập ghi chú (nếu có)..." />
              </Form.Item>
            </Card>

            {selectedCustomer && (
              <Card title="Thông tin khách hàng" className="invoice-card invoice-customer-preview">
                <div className="invoice-preview-grid">
                  <div><Text type="secondary">Mã khách hàng</Text><strong>{selectedCustomer.customer_code}</strong></div>
                  <div><Text type="secondary">Số điện thoại</Text><strong>{safeText(selectedCustomer.phone)}</strong></div>
                  <div><Text type="secondary">Email</Text><strong>{safeText(selectedCustomer.email)}</strong></div>
                  <div><Text type="secondary">Địa chỉ</Text><strong>{safeText(selectedCustomer.address)}</strong></div>
                </div>
              </Card>
            )}

            {customerId && (
              <Card title="Đơn hàng của khách hàng" className="invoice-card">
                <Table<InvoiceOrderOption> columns={orderColumns} dataSource={orderOptions} rowKey="id" pagination={false} scroll={{ x: 720 }} />
              </Card>
            )}

            <Card title="Danh sách khoản phí" className="invoice-card">
              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <div className="invoice-fee-list">
                    {fields.map((field, index) => {
                      const currentItem = watchedItems?.[index];
                      const lineTotal = Number(currentItem?.quantity ?? 0) * Number(currentItem?.unit_price ?? 0);

                      return (
                        <div className="invoice-fee-row" key={field.key}>
                          <Form.Item name={[field.name, "description"]} label="Nội dung" rules={[{ required: true, message: "Nhập nội dung" }]}>
                            <Input placeholder="Ví dụ: Tiền hàng" />
                          </Form.Item>
                          <Form.Item name={[field.name, "quantity"]} label="Số lượng" rules={[{ required: true, message: "Nhập số lượng" }]}>
                            <InputNumber min={0} style={{ width: "100%" }} />
                          </Form.Item>
                          <Form.Item name={[field.name, "unit_price"]} label="Đơn giá" rules={[{ required: true, message: "Nhập đơn giá" }]}>
                            <InputNumber min={0} addonAfter="đ" style={{ width: "100%" }} />
                          </Form.Item>
                          <div className="invoice-fee-row__total">
                            <Text type="secondary">Thành tiền</Text>
                            <strong>{money(lineTotal)}</strong>
                          </div>
                          <Button danger type="text" icon={<DeleteOutlined />} aria-label="Xóa khoản phí" onClick={() => remove(field.name)} disabled={fields.length <= 1} />
                        </div>
                      );
                    })}
                    <Button icon={<PlusOutlined />} onClick={() => add({ description: "", quantity: 1, unit_price: 0 })}>Thêm khoản phí</Button>
                  </div>
                )}
              </Form.List>
            </Card>
          </main>

          <aside className="invoice-create-side">
            <Card title="Tổng kết thanh toán" className="invoice-card invoice-create-summary">
              <Form.Item name="discount_amount" label="Giảm giá">
                <InputNumber min={0} addonAfter="đ" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="tax_amount" label="VAT">
                <InputNumber min={0} addonAfter="đ" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="paid_amount" label="Đã thanh toán trước">
                <InputNumber min={0} addonAfter="đ" style={{ width: "100%" }} />
              </Form.Item>
              <div className="invoice-total-box invoice-total-box--compact">
                <div><span>Tạm tính</span><strong>{money(totals.subtotal)}</strong></div>
                <div><span>Giảm giá</span><strong>-{money(totals.discountAmount)}</strong></div>
                <div><span>Thuế VAT</span><strong>{money(totals.taxAmount)}</strong></div>
                <div className="invoice-total-box__strong"><span>Tổng cộng</span><strong>{money(totals.total)}</strong></div>
                <div><span>Đã thanh toán trước</span><strong>{money(totals.paidAmount)}</strong></div>
                <div className="invoice-total-box__due"><span>Còn phải thu</span><strong>{money(totals.remaining)}</strong></div>
              </div>
            </Card>
          </aside>
        </div>

        <Card className="invoice-create-footer">
          <Space wrap>
            <Button onClick={handleCancel}>Hủy</Button>
            <Button icon={<SaveOutlined />} onClick={() => void handleSaveDraft()}>Lưu nháp</Button>
            <Button type="primary" icon={<SendOutlined />} onClick={() => void handlePublish()}>Phát hành hóa đơn</Button>
          </Space>
        </Card>
      </Form>
    </div>
  );
};
