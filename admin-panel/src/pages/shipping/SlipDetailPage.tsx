import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import {
  AppstoreOutlined, ArrowLeftOutlined, CarOutlined, CheckCircleOutlined, ColumnHeightOutlined,
  DollarCircleOutlined, DownloadOutlined, FileDoneOutlined, FilePdfOutlined, FileTextOutlined,
  HistoryOutlined, InfoCircleOutlined, PrinterOutlined, SafetyCertificateOutlined, UserOutlined,
} from "@ant-design/icons";
import { Breadcrumb, Button, Card, Empty, Skeleton, Space, Table, Timeline, Typography, message } from "antd";
import type { TableColumnsType } from "antd";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { fetchExportSlip, shippingErrorMessage } from "./api";
import { downloadExportSlip } from "./exportSlipDocument";
import { formatVnd, formatWeight, ShippingStatusTag, taskStatusLabels } from "./helpers";
import type { ExportSlip, ShippingPackage } from "./types";
import "./shipping.css";

const serviceLabels: Record<string, string> = { standard: "Tiêu chuẩn", express: "Nhanh", same_day: "Hỏa tốc" };
const deliveryLabels: Record<string, string> = { door_delivery: "Giao tận nơi", warehouse_pickup: "Nhận tại kho", transshipment: "Trung chuyển" };
const paymentMethodLabels: Record<string, string> = { bank_transfer: "Chuyển khoản ngân hàng", cash: "Tiền mặt", mixed: "Kết hợp" };

const DetailStat = ({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: string }) => <Card className={`shipping-detail-stat shipping-task-stat--${tone}`} styles={{ body: { padding: 16 } }}>
  <span className="shipping-task-stat__icon">{icon}</span><div><div className="shipping-task-stat__label">{label}</div><div className="shipping-detail-stat__value">{value}</div></div>
</Card>;

const DetailLine = ({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) => <div className="shipping-detail-line">
  <div className="shipping-detail-line__label">{icon}{label}</div><div className="shipping-detail-line__value">{children}</div>
</div>;

export const ExportSlipDetailPage = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const printed = useRef(false);
  const [slip, setSlip] = useState<ExportSlip | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchExportSlip(id).then((result) => active && setSlip(result)).catch((error) => message.error(shippingErrorMessage(error))).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (slip && searchParams.get("print") === "1" && !printed.current) {
      printed.current = true;
      window.setTimeout(() => window.print(), 150);
    }
  }, [searchParams, slip]);

  const columns = useMemo<TableColumnsType<ShippingPackage>>(() => [
    { title: "STT", width: 58, align: "center", render: (_, __, index) => index + 1 },
    { title: "Mã đơn hàng", dataIndex: "order_code", width: 165, render: (value, row) => row.order_id ? <Link className="shipping-table__order-link" to={`/orders/show/${row.order_id}`}>{value}</Link> : value || "—" },
    { title: "Mã vận đơn", dataIndex: "tracking_number", width: 180, render: (value) => value || "—" },
    { title: "Khách hàng", width: 175, render: (_, row) => row.customer_name ? <div><strong>{row.customer_name}</strong>{row.customer_phone && <small className="shipping-table__subtext">{row.customer_phone}</small>}</div> : "—" },
    { title: "Kích thước (cm)", children: [
      { title: "Dài", dataIndex: "length", align: "center", width: 70 },
      { title: "Rộng", dataIndex: "width", align: "center", width: 70 },
      { title: "Cao", dataIndex: "height", align: "center", width: 70 },
    ] },
    { title: "Khối lượng (kg)", dataIndex: "weight", align: "right", width: 125, render: (value) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value ?? 0) },
    { title: "Số kiện", align: "center", width: 85, render: () => 1 },
    { title: "Giá trị (VND)", dataIndex: "value", align: "right", width: 140, render: (value) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value ?? 0) },
  ], []);

  if (loading) return <div className="shipping-page"><Skeleton active paragraph={{ rows: 14 }} /></div>;
  if (!slip) return <div className="shipping-page"><Card className="shipping-panel"><Empty description="Không tìm thấy phiếu xuất hàng"><Button onClick={() => navigate("/shipping/slips")}>Quay lại danh sách</Button></Empty></Card></div>;

  const payment = slip.payment;
  const financials = slip.financials;
  const paymentTone = payment?.status === "paid" ? "paid" : payment?.status === "partial" ? "partial" : "unpaid";
  const paymentTitle = payment?.status === "paid" ? "ĐÃ THANH TOÁN" : payment?.status === "partial" ? "THANH TOÁN CHƯA HOÀN TẤT" : "CHƯA THANH TOÁN";
  const customers = Array.from(new Map((slip.customers || []).map((customer) => [`${customer.name}|${customer.phone}|${customer.address}`, customer])).values());
  const history = [
    ...(slip.history || []).map((item) => ({ ...item, sortDate: item.created_at, isPayment: false })),
    ...(payment?.paid_at ? [{ id: "payment", action: "confirm_payment", from_status: null, to_status: null, actor_name: payment.confirmed_by || "Hệ thống", created_at: payment.paid_at, sortDate: payment.paid_at, isPayment: true }] : []),
  ].sort((a, b) => dayjs(b.sortDate).valueOf() - dayjs(a.sortDate).valueOf());
  const historyText = (action: string, toStatus?: string | null) => {
    if (action === "confirm_payment") return { title: "Xác nhận thanh toán", description: "Đơn hàng đã được xác nhận thanh toán thành công" };
    if (action === "create_shipping_task") return { title: "Đã tạo phiếu", description: "Phiếu xuất hàng được tạo từ nhiệm vụ xuất hàng" };
    const status = toStatus || "created";
    const descriptions: Record<string, string> = { preparing: "Hàng hóa đang được chuẩn bị để giao", in_transit: "Đơn hàng đang được giao cho khách", completed: "Phiếu xuất hàng đã hoàn thành", cancelled: "Nhiệm vụ xuất hàng đã bị hủy" };
    return { title: taskStatusLabels[status] || "Cập nhật nhiệm vụ", description: descriptions[status] || "Trạng thái nhiệm vụ đã được cập nhật" };
  };

  return <div className="shipping-page shipping-slip-detail">
    <Breadcrumb className="shipping-detail-breadcrumb" items={[{ title: <Link to="/shipping/queue">Xuất hàng</Link> }, { title: <Link to="/shipping/slips">Phiếu xuất hàng</Link> }, { title: "Chi tiết phiếu xuất hàng" }]} />
    <div className="shipping-page__header shipping-print-hidden">
      <div><div className="shipping-detail-title"><Typography.Title level={2} className="shipping-page__title">Chi tiết phiếu xuất hàng</Typography.Title><ShippingStatusTag status={slip.status} /></div><span className="shipping-page__subtitle">Xem thông tin chi tiết phiếu xuất hàng và danh sách đơn hàng / vận đơn</span></div>
      <Space wrap><Button icon={<PrinterOutlined />} onClick={() => window.print()}>In phiếu</Button><Button icon={<DownloadOutlined />} onClick={() => downloadExportSlip(slip)}>Tải xuống</Button><Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/shipping/slips")}>Quay lại</Button></Space>
    </div>

    <div className="shipping-detail-hero-grid">
      <Card className="shipping-panel shipping-slip-identity" styles={{ body: { padding: 20 } }}>
        <div className="shipping-slip-identity__icon"><FileDoneOutlined /></div>
        <div className="shipping-slip-identity__code"><span>Mã phiếu xuất</span><strong>{slip.export_code}</strong></div>
        <div className="shipping-slip-identity__meta"><span>Mã nhiệm vụ</span>{slip.task_id ? <Link to={`/shipping/tasks/${slip.task_id}`}>{slip.task_code}</Link> : <strong>—</strong>}</div>
        <div className="shipping-slip-identity__meta"><span>Ngày tạo phiếu</span><strong>{slip.created_at ? dayjs(slip.created_at).format("DD/MM/YYYY HH:mm") : "—"}</strong></div>
        <div className="shipping-slip-identity__meta"><span>Nhân viên tạo</span><strong>{slip.creator_name || "—"}</strong></div>
      </Card>
      <Card className={`shipping-payment-confirm shipping-payment-confirm--${paymentTone}`} styles={{ body: { padding: 20 } }}>
        <div className="shipping-payment-confirm__title"><SafetyCertificateOutlined /><strong>{paymentTitle}</strong></div>
        <p>{payment?.status === "paid" ? "Phiếu xuất hàng này đã được xác nhận thanh toán thành công." : `${payment?.paid_package_count ?? 0}/${payment?.total_package_count ?? 0} kiện đã được xác nhận thanh toán.`}</p>
        <div className="shipping-payment-confirm__details">
          <span>Ngày thanh toán: <strong>{payment?.paid_at ? dayjs(payment.paid_at).format("DD/MM/YYYY HH:mm") : "—"}</strong></span>
          <span>Phương thức: <strong>{payment?.payment_method ? paymentMethodLabels[payment.payment_method] || payment.payment_method : "—"}</strong></span>
          <span>Mã giao dịch: <strong>{payment?.transaction_code || "—"}</strong></span>
          {payment?.bank_name && <span>Ngân hàng: <strong>{payment.bank_name}</strong></span>}
        </div>
      </Card>
    </div>

    <div className="shipping-detail-stat-grid">
      <DetailStat icon={<FileTextOutlined />} label="Số đơn hàng" value={slip.order_count} tone="blue" />
      <DetailStat icon={<AppstoreOutlined />} label="Tổng kiện" value={slip.total_packages} tone="mint" />
      <DetailStat icon={<ColumnHeightOutlined />} label="Tổng khối lượng" value={formatWeight(slip.total_weight)} tone="purple" />
      <DetailStat icon={<DollarCircleOutlined />} label="Tổng giá trị" value={formatVnd(slip.total_value)} tone="orange" />
    </div>

    <div className="shipping-detail-info-grid">
      <Card title="Thông tin giao hàng" className="shipping-panel">
        <DetailLine icon={<UserOutlined />} label="Nhân viên giao hàng"><div>{slip.delivery_staff_name || "—"}{slip.delivery_staff_phone && <small className="shipping-table__subtext">{slip.delivery_staff_phone}</small>}</div></DetailLine>
        <DetailLine icon={<CarOutlined />} label="Đơn vị vận chuyển">{slip.carrier_name || "—"}</DetailLine>
        <DetailLine label="Dự kiến giao ngày">{slip.scheduled_delivery_date ? dayjs(slip.scheduled_delivery_date).format("DD/MM/YYYY") : "—"}</DetailLine>
        <DetailLine label="Giao hàng từ">{slip.warehouse_name || "—"}</DetailLine>
        <DetailLine label="Ghi chú giao hàng">{slip.note || "Không có ghi chú"}</DetailLine>
      </Card>
      <Card title="Thông tin bổ sung" className="shipping-panel">
        <DetailLine label="Dịch vụ vận chuyển">{slip.service_type ? serviceLabels[slip.service_type] || slip.service_type : "—"}</DetailLine>
        <DetailLine label="Hình thức giao">{slip.delivery_method ? deliveryLabels[slip.delivery_method] || slip.delivery_method : "—"}</DetailLine>
        <DetailLine label="Thu hộ (COD)">{financials?.cod_amount == null ? "—" : formatVnd(financials.cod_amount)}</DetailLine>
        <DetailLine label="Phí vận chuyển">{formatVnd(financials?.shipping_fee)}</DetailLine>
        <DetailLine label="Ghi chú vận chuyển">{slip.transport_note || "Không có ghi chú"}</DetailLine>
      </Card>
      <Card title="Thông tin thanh toán" className="shipping-panel shipping-financial-card">
        <DetailLine label="Tổng giá trị đơn hàng">{formatVnd(financials?.order_value)}</DetailLine>
        <DetailLine label="Phí vận chuyển">{formatVnd(financials?.shipping_fee)}</DetailLine>
        <DetailLine label="Thu hộ (COD)">{financials?.cod_amount == null ? "—" : formatVnd(financials.cod_amount)}</DetailLine>
        <div className="shipping-financial-card__total"><span>Tổng cộng</span><strong>{formatVnd(financials?.total_amount)}</strong></div>
        <div className={`shipping-financial-card__status shipping-financial-card__status--${paymentTone}`}><span><CheckCircleOutlined /> {paymentTitle}</span><strong>{payment?.paid_at ? dayjs(payment.paid_at).format("DD/MM/YYYY HH:mm") : "—"}</strong></div>
      </Card>
    </div>

    <Card title="Danh sách đơn hàng / vận đơn" className="shipping-panel shipping-detail-table" styles={{ body: { padding: 0 } }}>
      <Table<ShippingPackage> rowKey="id" columns={columns} dataSource={slip.packages || []} pagination={false} scroll={{ x: 1260 }} locale={{ emptyText: "Phiếu xuất chưa có vận đơn." }} summary={() => <Table.Summary.Row className="shipping-detail-table__summary">
        <Table.Summary.Cell index={0} colSpan={7}>Tổng cộng</Table.Summary.Cell>
        <Table.Summary.Cell index={7} align="right">{formatWeight(slip.total_weight)}</Table.Summary.Cell>
        <Table.Summary.Cell index={8} align="center">{slip.total_packages}</Table.Summary.Cell>
        <Table.Summary.Cell index={9} align="right">{new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(slip.total_value)}</Table.Summary.Cell>
      </Table.Summary.Row>} />
    </Card>

    <div className="shipping-detail-bottom-grid">
      <Card title={<span><HistoryOutlined /> Lịch sử xử lý</span>} className="shipping-panel shipping-history-card">
        {history.length ? <Timeline items={history.map((item) => { const text = historyText(item.action, item.to_status); return { color: item.isPayment ? "green" : item.to_status === "cancelled" ? "red" : "blue", children: <div className="shipping-history-item"><strong>{text.title}</strong><p>{text.description}</p><span>{item.actor_name || "Hệ thống"} • {item.created_at ? dayjs(item.created_at).format("DD/MM/YYYY HH:mm") : "—"}</span></div> }; })} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có lịch sử xử lý" />}
      </Card>
      <div className="shipping-detail-side-stack">
        <Card title={<span><UserOutlined /> Thông tin người nhận</span>} className="shipping-panel">
          {customers.length === 1 ? <><DetailLine label="Họ tên">{customers[0].name || "—"}</DetailLine><DetailLine label="Số điện thoại">{customers[0].phone || "—"}</DetailLine><DetailLine label="Địa chỉ">{customers[0].address || "—"}</DetailLine></> : customers.length > 1 ? <div className="shipping-multiple-recipients"><UserOutlined /><strong>Nhiều người nhận</strong><span>{customers.length} người nhận — xem chi tiết theo từng đơn trong bảng vận đơn.</span></div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thông tin người nhận" />}
        </Card>
        <Card title={<span><FilePdfOutlined /> Tệp đính kèm</span>} className="shipping-panel"><div className="shipping-no-attachment"><InfoCircleOutlined /><span>Chưa có tệp đính kèm được lưu cho phiếu này.</span></div></Card>
        <Card title="Ghi chú" className="shipping-panel"><Typography.Paragraph className="shipping-note-text">{slip.note || "Không có ghi chú"}</Typography.Paragraph></Card>
      </div>
    </div>
  </div>;
};
