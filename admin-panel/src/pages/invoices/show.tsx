import { Link, useNavigate, useParams } from "react-router";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Descriptions, Dropdown, Empty, Result, Space, Spin, Table, Timeline, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  FileTextOutlined,
  MoreOutlined,
  PrinterOutlined,
  SendOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import type { Invoice, InvoiceActivity, InvoiceItem, InvoicePayment } from "./types";
import { fetchInvoice } from "./api";
import { formatDate, formatDateTime, getOverdueDays, invoiceTypeLabels, money, paymentMethodLabels, safeText } from "./invoiceUtils";
import { InvoiceStatusTag } from "./InvoiceStatusTag";
import "./invoice-pages.css";

const { Text, Title } = Typography;

const developmentMessage = () => message.info("Chức năng đang được phát triển.");

const SummaryTile = ({ label, value, tone }: { label: string; value: string; tone?: "blue" | "green" | "red" }) => (
  <Card className={`invoice-detail-summary__tile invoice-detail-summary__tile--${tone ?? "blue"}`}>
    <Text className="invoice-muted">{label}</Text>
    <div>{value}</div>
  </Card>
);

export const InvoiceDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Không tìm thấy mã hóa đơn trên URL.");
      setLoading(false);
      return;
    }

    const loadInvoice = async () => {
      setLoading(true);
      try {
        const data = await fetchInvoice(id);
        setInvoice(data);
        setError(data ? null : "Không tìm thấy hóa đơn.");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Không thể tải chi tiết hóa đơn.");
      } finally {
        setLoading(false);
      }
    };

    void loadInvoice();
  }, [id]);

  if (loading) {
    return <Spin fullscreen tip="Đang tải hóa đơn..." />;
  }

  if (error || !invoice) {
    return <Result status="404" title={error ?? "Không tìm thấy hóa đơn"} extra={<Button onClick={() => navigate("/invoices")}>Quay lại danh sách</Button>} />;
  }

  const overdueDays = getOverdueDays(invoice);
  const subtotal = invoice.items.reduce((sum, item) => sum + item.total_amount, 0);

  const itemColumns: ColumnsType<InvoiceItem> = [
    { title: "STT", width: 72, render: (_value, _record, index) => index + 1 },
    { title: "Nội dung", dataIndex: "description" },
    { title: "Số lượng", dataIndex: "quantity", align: "right", width: 110 },
    { title: "Đơn giá", dataIndex: "unit_price", align: "right", width: 150, render: (value: number) => money(value) },
    { title: "Thành tiền", dataIndex: "total_amount", align: "right", width: 160, render: (value: number) => money(value) },
  ];

  const paymentColumns: ColumnsType<InvoicePayment> = [
    { title: "Mã phiếu thanh toán", dataIndex: "voucher_code", width: 180 },
    { title: "Thời gian", dataIndex: "paid_at", width: 150, render: (value: string) => formatDateTime(value) },
    { title: "Phương thức", dataIndex: "payment_method", width: 140, render: (value: InvoicePayment["payment_method"]) => paymentMethodLabels[value] },
    { title: "Số tiền", dataIndex: "amount", align: "right", width: 150, render: (value: number) => money(value) },
    { title: "Mã giao dịch", dataIndex: "transaction_code", width: 160, render: (value?: string | null) => safeText(value) },
    { title: "Trạng thái", dataIndex: "status", width: 120, render: (value: string) => value === "success" ? "Thành công" : safeText(value) },
    { title: "Người xác nhận", dataIndex: "confirmed_by", width: 150, render: (value?: string | null) => safeText(value) },
  ];

  const timelineItems = invoice.activities.map((activity: InvoiceActivity) => ({
    color: activity.tone === "green" ? "green" : activity.tone === "red" ? "red" : activity.tone === "orange" ? "orange" : "blue",
    children: (
      <div className="invoice-activity-item">
        <Text strong>{activity.title}</Text>
        <div className="invoice-muted invoice-small-text">{activity.actor} • {formatDateTime(activity.occurred_at)}</div>
      </div>
    ),
  }));

  return (
    <div className="invoice-page">
      <div className="invoice-page__header invoice-detail-header">
        <Space align="start">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/invoices")}>Quay lại</Button>
          <div>
            <Title level={2} className="invoice-page__title">Chi tiết hóa đơn</Title>
            <Space wrap>
              <Text strong>{invoice.invoice_code}</Text>
              <InvoiceStatusTag status={invoice.status} rawStatus={invoice.backend_status} />
            </Space>
          </div>
        </Space>
        <Space wrap className="invoice-page__actions">
          <Button icon={<PrinterOutlined />} onClick={developmentMessage}>In hóa đơn</Button>
          <Button icon={<DownloadOutlined />} onClick={developmentMessage}>Tải PDF</Button>
          <Button type="primary" icon={<SendOutlined />} onClick={developmentMessage}>Gửi hóa đơn</Button>
          <Dropdown trigger={["click"]} menu={{ items: [{ key: "edit", label: "Chỉnh sửa", onClick: developmentMessage }, { key: "cancel", label: "Hủy hóa đơn", danger: true, onClick: developmentMessage }] }}>
            <Button icon={<MoreOutlined />} aria-label="Mở menu hành động khác" />
          </Dropdown>
        </Space>
      </div>

      {overdueDays > 0 && (
        <Alert type="error" showIcon className="invoice-alert" message={`Hóa đơn đã quá hạn ${overdueDays} ngày.`} />
      )}

      <div className="invoice-detail-summary">
        <SummaryTile label="Tổng tiền" value={money(invoice.total_amount)} />
        <SummaryTile label="Đã thanh toán" value={money(invoice.paid_amount)} tone="green" />
        <SummaryTile label="Còn phải thu" value={money(invoice.remaining_amount)} tone={invoice.remaining_amount > 0 ? "red" : "green"} />
        <SummaryTile label="Ngày đến hạn" value={formatDate(invoice.due_at)} />
      </div>

      <div className="invoice-detail-grid">
        <main className="invoice-detail-main">
          <div className="invoice-detail-info-grid">
            <Card title="Thông tin hóa đơn" className="invoice-card">
              <Descriptions column={1} size="small" items={[
                { key: "code", label: "Mã hóa đơn", children: invoice.invoice_code },
                { key: "issued", label: "Ngày phát hành", children: formatDateTime(invoice.issued_at) },
                { key: "due", label: "Ngày đến hạn", children: formatDate(invoice.due_at) },
                { key: "order", label: "Mã đơn hàng", children: invoice.order_code ? <Link to="#" onClick={(event) => { event.preventDefault(); message.info("Liên kết đơn hàng sẽ được kết nối khi contract hóa đơn có order route."); }}>{invoice.order_code}</Link> : "—" },
                { key: "type", label: "Loại hóa đơn", children: invoiceTypeLabels[invoice.invoice_type] },
                { key: "creator", label: "Người tạo", children: invoice.created_by },
                { key: "note", label: "Ghi chú nội bộ", children: safeText(invoice.note) },
              ]} />
            </Card>

            <Card title="Thông tin khách hàng" className="invoice-card">
              <Descriptions column={1} size="small" items={[
                { key: "name", label: "Tên khách hàng", children: invoice.customer.name },
                { key: "code", label: "Mã khách hàng", children: invoice.customer.customer_code },
                { key: "phone", label: "Số điện thoại", children: safeText(invoice.customer.phone) },
                { key: "email", label: "Email", children: safeText(invoice.customer.email) },
                { key: "address", label: "Địa chỉ", children: safeText(invoice.customer.address) },
                { key: "tax", label: "Mã số thuế", children: safeText(invoice.customer.tax_code) },
                { key: "company", label: "Tên công ty", children: safeText(invoice.customer.company_name) },
              ]} />
            </Card>
          </div>

          <Card title="Chi tiết các khoản phí" className="invoice-card">
            <Table<InvoiceItem> columns={itemColumns} dataSource={invoice.items} rowKey="id" pagination={false} scroll={{ x: 760 }} />
            <div className="invoice-total-box">
              <div><span>Tạm tính</span><strong>{money(subtotal)}</strong></div>
              <div><span>Giảm giá</span><strong>-{money(invoice.discount_amount)}</strong></div>
              <div><span>Thuế VAT</span><strong>{money(invoice.tax_amount)}</strong></div>
              <div className="invoice-total-box__strong"><span>Tổng cộng</span><strong>{money(invoice.total_amount)}</strong></div>
              <div><span>Đã thanh toán</span><strong>{money(invoice.paid_amount)}</strong></div>
              <div className="invoice-total-box__due"><span>Còn phải thu</span><strong>{money(invoice.remaining_amount)}</strong></div>
            </div>
          </Card>

          <Card title="Lịch sử thanh toán" className="invoice-card">
            <Table<InvoicePayment>
              columns={paymentColumns}
              dataSource={invoice.payments}
              rowKey="id"
              pagination={false}
              scroll={{ x: 960 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có giao dịch thanh toán cho hóa đơn này." /> }}
            />
          </Card>
        </main>

        <aside className="invoice-detail-side">
          <Card title={<span><WalletOutlined /> Tổng quan thanh toán</span>} className="invoice-card">
            <div className="invoice-total-box invoice-total-box--compact">
              <div><span>Tổng cộng</span><strong>{money(invoice.total_amount)}</strong></div>
              <div><span>Đã thanh toán</span><strong>{money(invoice.paid_amount)}</strong></div>
              <div className="invoice-total-box__due"><span>Còn phải thu</span><strong>{money(invoice.remaining_amount)}</strong></div>
            </div>
          </Card>
          <Card title={<span><FileTextOutlined /> Lịch sử hoạt động</span>} className="invoice-card">
            <Timeline items={timelineItems} />
          </Card>
        </aside>
      </div>
    </div>
  );
};
