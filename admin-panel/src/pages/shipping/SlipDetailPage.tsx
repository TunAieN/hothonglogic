import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import {
  AppstoreOutlined, ArrowLeftOutlined, CarOutlined, CheckCircleOutlined, ColumnHeightOutlined,
  DollarCircleOutlined, DownloadOutlined, FileDoneOutlined, FilePdfOutlined, FileTextOutlined,
  HistoryOutlined, InfoCircleOutlined, PrinterOutlined, SafetyCertificateOutlined, UserOutlined,
} from "@ant-design/icons";
import { Breadcrumb, Button, Card, Empty, Skeleton, Space, Table, Tag, Timeline, Typography, message } from "antd";
import type { TableColumnsType } from "antd";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { fetchExportSlip, shippingErrorMessage } from "./api";
import { downloadExportSlip } from "./exportSlipDocument";
import { formatWeight, ShippingStatusTag, taskStatusLabels } from "./helpers";
import type { ExportSlip, ShippingPackage } from "./types";
import "./shipping.css";

const serviceLabels: Record<string, string> = { standard: "Tiêu chuẩn", express: "Nhanh", same_day: "Hỏa tốc" };
const deliveryLabels: Record<string, string> = { door_delivery: "Giao tận nơi", warehouse_pickup: "Nhận tại kho", transshipment: "Trung chuyển" };
const paymentMethodLabels: Record<string, string> = { bank_transfer: "Chuyển khoản ngân hàng", cash: "Tiền mặt", mixed: "Kết hợp" };
const formatDetailVnd = (value?: number | null) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value ?? 0)} đ`;

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
    { title: "Kích thước", width: 150, render: (_, row) => `${row.length} × ${row.width} × ${row.height} cm` },
    { title: "Khối lượng (kg)", dataIndex: "weight", align: "right", width: 125, render: (value) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value ?? 0) },
    { title: "Số kiện", align: "center", width: 85, render: () => 1 },
    { title: "Trạng thái", width: 130, render: () => slip?.financials?.status === "paid" ? <Tag color="success" bordered={false}>Đã thanh toán</Tag> : <Tag color="error" bordered={false}>Chưa hoàn tất</Tag> },
  ], [slip?.financials?.status]);

  if (loading) return <div className="shipping-page"><Skeleton active paragraph={{ rows: 14 }} /></div>;
  if (!slip) return <div className="shipping-page"><Card className="shipping-panel"><Empty description="Không tìm thấy phiếu xuất hàng"><Button onClick={() => navigate("/shipping/slips")}>Quay lại danh sách</Button></Empty></Card></div>;

  const payment = slip.payment;
  const financials = slip.financials;
  const financialStatus = financials?.status || payment?.status || "unpaid";
  const paymentTone = financialStatus === "paid" ? "paid" : financialStatus === "partial" ? "partial" : "unpaid";
  const paymentTitle = financialStatus === "paid" ? "ĐÃ TẤT TOÁN" : financialStatus === "partial" ? "THANH TOÁN CHƯA HOÀN TẤT" : "CHƯA THANH TOÁN";
  const deliveryAddress = slip.delivery_address;
  const addressText = deliveryAddress?.full_address || [deliveryAddress?.address_line, deliveryAddress?.ward_name, deliveryAddress?.district_name, deliveryAddress?.province_name].filter(Boolean).join(", ");
  const ghnMode = slip.ghn?.mode === "production" ? "Production" : slip.ghn?.mode === "test" ? "Test" : "Preview";
  const feeDifference = slip.ghn?.fee_difference ?? 0;
  const feeDifferenceText = `${feeDifference > 0 ? "+" : ""}${formatDetailVnd(feeDifference)}`;
  const history = [...(slip.history || [])].sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf());
  const historyText = (action: string, toStatus?: string | null) => {
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
        <div className="shipping-slip-identity__facts">
          <div className="shipping-slip-identity__meta"><span>Mã nhiệm vụ</span>{slip.task_id ? <Link to={`/shipping/tasks/${slip.task_id}`}>{slip.task_code}</Link> : <strong>—</strong>}</div>
          <div className="shipping-slip-identity__meta"><span>Ngày tạo phiếu</span><strong>{slip.created_at ? dayjs(slip.created_at).format("DD/MM/YYYY HH:mm") : "—"}</strong></div>
          <div className="shipping-slip-identity__meta"><span>Người tạo</span><strong>{slip.creator_name || "—"}</strong></div>
          <div className="shipping-slip-identity__meta"><span>Kho xuất hàng</span><strong>{[slip.warehouse_name, slip.warehouse_address].filter(Boolean).join(" - ") || "—"}</strong></div>
          <div className="shipping-slip-identity__meta"><span>Dự kiến giao</span><strong>{slip.scheduled_delivery_date ? `${dayjs(slip.scheduled_delivery_date).format("DD/MM/YYYY")} (theo GHN)` : "—"}</strong></div>
        </div>
      </Card>
      <Card className={`shipping-payment-confirm shipping-payment-confirm--${paymentTone}`} styles={{ body: { padding: 20 } }}>
        <div className="shipping-payment-confirm__title"><SafetyCertificateOutlined /><strong>{paymentTitle}</strong></div>
        <p>{financialStatus === "paid" ? "Toàn bộ nghĩa vụ tài chính của phiếu đã được tất toán." : "Phiếu vẫn còn nghĩa vụ tài chính chưa hoàn tất."}</p>
        <div className="shipping-payment-confirm__details">
          <span>Mã phiếu thanh toán: <strong>{payment?.voucher_codes?.join(", ") || "—"}</strong></span>
          <span>Ngày thanh toán: <strong>{payment?.paid_at ? dayjs(payment.paid_at).format("DD/MM/YYYY HH:mm") : "—"}</strong></span>
          <span>Phương thức: <strong>{payment?.payment_method ? paymentMethodLabels[payment.payment_method] || payment.payment_method : "—"}</strong></span>
          <span>Mã giao dịch: <strong>{payment?.transaction_code || "—"}</strong></span>
          {payment?.bank_name && <span>Ngân hàng: <strong>{payment.bank_name}</strong></span>}
          <span>Tổng đã tất toán: <strong>{formatDetailVnd(financials?.settled_total)}</strong></span>
          <span>Còn phải thu: <strong>{formatDetailVnd(financials?.remaining_amount)}</strong></span>
        </div>
      </Card>
    </div>

    <div className="shipping-detail-stat-grid">
      <DetailStat icon={<FileTextOutlined />} label="Số đơn hàng" value={slip.order_count} tone="blue" />
      <DetailStat icon={<AppstoreOutlined />} label="Tổng số kiện" value={slip.total_packages} tone="mint" />
      <DetailStat icon={<ColumnHeightOutlined />} label="Tổng khối lượng" value={formatWeight(slip.total_weight)} tone="purple" />
      <DetailStat icon={<DollarCircleOutlined />} label="Tổng giá trị đã tất toán" value={formatDetailVnd(financials?.settled_total)} tone="orange" />
    </div>

    <div className="shipping-detail-info-grid">
      <Card title="Thông tin xuất hàng" className="shipping-panel">
        <DetailLine icon={<UserOutlined />} label="Nhân viên phụ trách xuất hàng"><div>{slip.delivery_staff_name || "—"}{slip.delivery_staff_phone && <small className="shipping-table__subtext">{slip.delivery_staff_phone}</small>}</div></DetailLine>
        <DetailLine label="Kho xuất">{[slip.warehouse_name, slip.warehouse_address].filter(Boolean).join(" - ") || "—"}</DetailLine>
        <DetailLine icon={<CarOutlined />} label="Đơn vị vận chuyển">{slip.carrier_code?.toLowerCase() === "ghn" ? "Giao Hàng Nhanh (GHN)" : slip.carrier_name || "—"}</DetailLine>
        <DetailLine label="Hình thức giao">{slip.delivery_method ? deliveryLabels[slip.delivery_method] || slip.delivery_method : "—"}</DetailLine>
        <DetailLine label="Dự kiến giao ngày">{slip.scheduled_delivery_date ? `${dayjs(slip.scheduled_delivery_date).format("DD/MM/YYYY")} (theo GHN)` : "—"}</DetailLine>
        <DetailLine label="Thu hộ (COD)">{formatDetailVnd(financials?.cod_amount)}</DetailLine>
        <DetailLine label="Ghi chú giao hàng">{slip.note || "Không có ghi chú"}</DetailLine>
      </Card>
      <Card title="Thông tin GHN" className="shipping-panel">
        <DetailLine label="Đơn vị vận chuyển">{slip.carrier_code?.toLowerCase() === "ghn" ? "Giao Hàng Nhanh (GHN)" : slip.carrier_name || "—"}</DetailLine>
        <DetailLine label="Dịch vụ">{slip.ghn?.service_name || (slip.service_type ? serviceLabels[slip.service_type] || slip.service_type : "—")}</DetailLine>
        <DetailLine label="Service ID">{slip.ghn?.service_id ?? "—"}</DetailLine>
        <DetailLine label="Gói hàng">{slip.ghn ? `${slip.ghn.package_count} kiện • ${formatWeight(slip.ghn.total_weight)}` : "—"}</DetailLine>
        <DetailLine label="Kích thước tổng hợp">{slip.ghn ? `${slip.ghn.length} × ${slip.ghn.width} × ${slip.ghn.height} cm` : "—"}</DetailLine>
        <DetailLine label="Dự kiến giao">{slip.scheduled_delivery_date ? `${dayjs(slip.scheduled_delivery_date).format("DD/MM/YYYY")} (theo GHN)` : "—"}</DetailLine>
        <DetailLine label="Chế độ"><Tag color={slip.ghn?.mode === "production" ? "red" : "blue"}>{ghnMode}</Tag></DetailLine>
        <DetailLine label="Đơn GHN thực tế">{slip.shipment?.exists ? `${slip.shipment.tracking_number || slip.shipment.carrier_order_id || "Đã tạo"}${slip.shipment.status ? ` • ${slip.shipment.status}` : ""}` : "Chưa tạo"}</DetailLine>
        <DetailLine label="Phí đã thu / phí hiện tại">{formatDetailVnd(slip.ghn?.collected_fee)} / {formatDetailVnd(slip.ghn?.current_fee)}</DetailLine>
        <DetailLine label="Chênh lệch preview"><Tag color={feeDifference === 0 ? "success" : "warning"}>{feeDifferenceText}</Tag></DetailLine>
      </Card>
      <Card title="Thông tin tài chính đã tất toán" className="shipping-panel shipping-financial-card">
        <DetailLine label="Tiền hàng">{formatDetailVnd(financials?.product_total)}</DetailLine>
        <DetailLine label="Phí vận chuyển TQ → VN">{formatDetailVnd(financials?.weight_shipping_total)}</DetailLine>
        <DetailLine label="Phí giao nội địa GHN">{formatDetailVnd(financials?.domestic_shipping_total)}</DetailLine>
        <DetailLine label="Phụ phí">{formatDetailVnd(financials?.surcharge_total)}</DetailLine>
        <div className="shipping-financial-card__total"><span>Tổng đã tất toán</span><strong>{formatDetailVnd(financials?.settled_total)}</strong></div>
        <DetailLine label="Đã dùng tiền cọc">{formatDetailVnd(financials?.deposit_applied)}</DetailLine>
        <DetailLine label="Đã dùng công nợ/credit">{formatDetailVnd(financials?.customer_credit_applied)}</DetailLine>
        <DetailLine label="Thanh toán sau tiền cọc">{formatDetailVnd(financials?.payment_after_deposit)}</DetailLine>
        <DetailLine label="Còn phải thu">{formatDetailVnd(financials?.remaining_amount)}</DetailLine>
        <DetailLine label="Thu hộ (COD)">{formatDetailVnd(financials?.cod_amount)}</DetailLine>
        <div className={`shipping-financial-card__status shipping-financial-card__status--${paymentTone}`}><span><CheckCircleOutlined /> {paymentTitle}</span><strong>{payment?.paid_at ? dayjs(payment.paid_at).format("DD/MM/YYYY HH:mm") : "—"}</strong></div>
      </Card>
    </div>

    <Card title="Danh sách đơn hàng xuất" className="shipping-panel shipping-detail-table" styles={{ body: { padding: 0 } }}>
      <Table<ShippingPackage> rowKey="id" columns={columns} dataSource={slip.packages || []} pagination={false} scroll={{ x: 1260 }} locale={{ emptyText: "Phiếu xuất chưa có vận đơn." }} summary={() => <Table.Summary.Row className="shipping-detail-table__summary">
        <Table.Summary.Cell index={0} colSpan={5}>Tổng cộng</Table.Summary.Cell>
        <Table.Summary.Cell index={5} align="right">{formatWeight(slip.total_weight)}</Table.Summary.Cell>
        <Table.Summary.Cell index={6} align="center">{slip.total_packages}</Table.Summary.Cell>
        <Table.Summary.Cell index={7} align="center">{paymentTitle}</Table.Summary.Cell>
      </Table.Summary.Row>} />
    </Card>

    <div className="shipping-detail-bottom-grid">
      <Card title={<span><HistoryOutlined /> Lịch sử xử lý</span>} className="shipping-panel shipping-history-card">
        {history.length ? <Timeline items={history.map((item) => { const text = historyText(item.action, item.to_status); return { color: item.to_status === "cancelled" ? "red" : "blue", children: <div className="shipping-history-item"><strong>{text.title}</strong><p>{text.description}</p><span>{item.actor_name || "Hệ thống"} • {item.created_at ? dayjs(item.created_at).format("DD/MM/YYYY HH:mm") : "—"}</span></div> }; })} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có lịch sử xử lý" />}
      </Card>
      <div className="shipping-detail-side-stack">
        <Card title={<span><UserOutlined /> Thông tin người nhận</span>} className="shipping-panel">
          {deliveryAddress ? <><DetailLine label="Người nhận">{deliveryAddress.receiver_name || "—"}</DetailLine><DetailLine label="Số điện thoại">{deliveryAddress.receiver_phone || "—"}</DetailLine><DetailLine label="Địa chỉ chi tiết">{deliveryAddress.address_line || "—"}</DetailLine><DetailLine label="Tỉnh/Thành">{deliveryAddress.province_name || "—"}</DetailLine><DetailLine label="Quận/Huyện">{deliveryAddress.district_name || "—"}</DetailLine><DetailLine label="Phường/Xã">{deliveryAddress.ward_name || "—"}</DetailLine><DetailLine label="Địa chỉ snapshot đầy đủ">{addressText || "—"}</DetailLine><DetailLine label="GHN District ID">{deliveryAddress.district_code || "—"}</DetailLine><DetailLine label="GHN Ward Code">{deliveryAddress.ward_code || "—"}</DetailLine></> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có snapshot địa chỉ giao nhận" />}
        </Card>
        <Card title={<span><FilePdfOutlined /> Tệp đính kèm</span>} className="shipping-panel"><div className="shipping-no-attachment"><InfoCircleOutlined /><span>Chưa có tệp đính kèm được lưu cho phiếu này.</span></div></Card>
        <Card title="Ghi chú" className="shipping-panel"><Typography.Paragraph className="shipping-note-text">{slip.note || "Không có ghi chú"}</Typography.Paragraph></Card>
      </div>
    </div>
  </div>;
};
