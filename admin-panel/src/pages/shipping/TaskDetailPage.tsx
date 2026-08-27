import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useGetIdentity } from "@refinedev/core";
import {
  AppstoreOutlined, ArrowLeftOutlined, CalendarOutlined, CarOutlined, CheckCircleOutlined,
  ColumnHeightOutlined, CopyOutlined, DollarCircleOutlined, EnvironmentOutlined,
  FileTextOutlined, HistoryOutlined, MoreOutlined, PrinterOutlined, RocketOutlined,
  SwapOutlined, UnorderedListOutlined, UserOutlined, WalletOutlined,
} from "@ant-design/icons";
import {
  Alert, Breadcrumb, Button, Card, Dropdown, Empty, Modal, Skeleton, Space, Table, Tag, Timeline,
  Tooltip, Typography, message,
} from "antd";
import type { MenuProps, TableColumnsType } from "antd";
import { Link, useNavigate, useParams } from "react-router";
import { fetchExportSlip, fetchShippingTask, shippingErrorMessage, updateShippingTaskStatus } from "./api";
import { downloadExportSlip } from "./exportSlipDocument";
import { formatVnd, formatWeight, taskStatusLabels } from "./helpers";
import type { ExportSlip, ShippingTask } from "./types";
import type { User } from "../../shared/types";
import "./shipping.css";

type TaskOrder = ShippingTask["orders"][number];
type TaskOrderRow = TaskOrder & { trackingNumbers: string[]; customerPhone?: string | null; paymentStatus: "paid" | "unpaid" | "unknown" };

const serviceLabels: Record<string, string> = { standard: "Tiêu chuẩn", express: "Nhanh", same_day: "Hỏa tốc" };
const deliveryLabels: Record<string, string> = { door_delivery: "Giao tận nơi", warehouse_pickup: "Nhận tại kho", transshipment: "Trung chuyển" };
const detailStatusLabels: Record<string, string> = { ...taskStatusLabels, created: "Chờ xử lý", in_transit: "Đang giao hàng" };
const transitionLabels: Record<string, string> = { preparing: "Chuyển sang Đang chuẩn bị", in_transit: "Chuyển sang Đang giao hàng", completed: "Hoàn thành nhiệm vụ" };
const TaskDetailStatusTag = ({ status }: { status: string }) => <Tag bordered={false} className={`shipping-status-pill shipping-status-pill--${status}`}>{detailStatusLabels[status] || status}</Tag>;

const DetailLine = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => <div className="shipping-task-detail-line">
  <span className="shipping-task-detail-line__icon">{icon}</span><span>{label}</span><strong>{children}</strong>
</div>;

export const ShippingTaskDetailPage = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<User>();
  const [task, setTask] = useState<ShippingTask>();
  const [slip, setSlip] = useState<ExportSlip | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const permissions = identity?.role?.permissions ?? [];
  const canUpdate = permissions.some((item) => ["all", "exports.update", "export.update"].includes(item));
  const canCancel = permissions.some((item) => ["all", "exports.cancel", "export.cancel"].includes(item));

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const taskResult = await fetchShippingTask(id);
      setTask(taskResult);
      setSlip(taskResult.export_slip_id ? await fetchExportSlip(taskResult.export_slip_id) : null);
    } catch (error) { message.error(shippingErrorMessage(error)); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const orderRows = useMemo<TaskOrderRow[]>(() => (task?.orders || []).map((order) => {
    const packages = (slip?.packages || []).filter((item) => String(item.order_id) === String(order.id) || (!!item.order_code && item.order_code === order.order_code));
    return {
      ...order,
      trackingNumbers: Array.from(new Set(packages.map((item) => item.tracking_number).filter((value): value is string => !!value))),
      customerPhone: packages.find((item) => item.customer_phone)?.customer_phone,
      paymentStatus: slip?.payment?.status === "paid" ? "paid" : slip?.payment?.status === "unpaid" ? "unpaid" : "unknown",
    };
  }), [slip, task]);

  const history = useMemo(() => [...(slip?.history || [])].sort((a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf()), [slip]);
  const lastUpdated = history.at(-1)?.created_at || task?.created_at;
  const nextStatus = task?.status === "created" ? "preparing" : task?.status === "preparing" ? "in_transit" : task?.status === "in_transit" ? "completed" : null;
  const canCancelCurrent = !!task && ["created", "preparing"].includes(task.status) && canCancel;

  const changeStatus = async (status: string) => {
    if (!task || updating) return;
    setUpdating(true);
    try { await updateShippingTaskStatus(task.id, status); message.success("Cập nhật trạng thái nhiệm vụ thành công."); await load(); }
    catch (error) { message.error(shippingErrorMessage(error)); }
    finally { setUpdating(false); }
  };

  const confirmCancel = () => task && Modal.confirm({
    title: "Hủy nhiệm vụ xuất hàng?", content: `Nhiệm vụ ${task.task_code} sẽ chuyển sang trạng thái Đã hủy.`,
    okText: "Hủy nhiệm vụ", cancelText: "Đóng", okButtonProps: { danger: true }, onOk: () => changeStatus("cancelled"),
  });

  const copyCode = async (value: string) => {
    try { await navigator.clipboard.writeText(value); message.success("Đã sao chép mã"); }
    catch { message.warning("Không thể sao chép mã tự động"); }
  };

  const statusMenuItems: MenuProps["items"] = [];
  if (canUpdate && nextStatus) statusMenuItems.push({ key: nextStatus, label: transitionLabels[nextStatus], onClick: () => void changeStatus(nextStatus) });
  if (canCancelCurrent) statusMenuItems.push({ key: "cancel", danger: true, label: "Hủy nhiệm vụ", onClick: confirmCancel });

  const actionItems: MenuProps["items"] = [];
  if (task?.export_slip_id) {
    actionItems.push(
      { key: "slip", label: "Xem phiếu xuất", onClick: () => navigate(`/shipping/slips/${task.export_slip_id}`) },
      { key: "print-slip", label: "In phiếu xuất", onClick: () => navigate(`/shipping/slips/${task.export_slip_id}?print=1`) },
    );
    if (slip) actionItems.push({ key: "download", label: "Tải phiếu xuất", onClick: () => downloadExportSlip(slip) });
  }
  actionItems.push({ key: "print-orders", label: "In danh sách đơn", onClick: () => window.print() });
  if (statusMenuItems.length) actionItems.push({ type: "divider" }, ...statusMenuItems);

  const columns: TableColumnsType<TaskOrderRow> = [
    { title: "STT", width: 58, align: "center", render: (_, __, index) => index + 1 },
    { title: "Mã vận đơn", dataIndex: "trackingNumbers", width: 175, render: (values: string[]) => values.length ? <div className="shipping-tracking-list">{values.map((value) => <span key={value}>{value}</span>)}</div> : "—" },
    { title: "Mã đơn hàng", dataIndex: "order_code", width: 165, render: (value, row) => <Link className="shipping-table__order-link" to={`/orders/show/${row.id}`}>{value || "—"}</Link> },
    { title: "Khách hàng", width: 175, render: (_, row) => <div><strong>{row.customer_name || "—"}</strong>{row.customerPhone && <small className="shipping-table__subtext">{row.customerPhone}</small>}</div> },
    { title: "Số kiện", dataIndex: "package_count", align: "center", width: 85 },
    { title: "Khối lượng (kg)", dataIndex: "total_weight", align: "right", width: 125, render: (value) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value) },
    { title: "Giá trị (VND)", dataIndex: "total_value", align: "right", width: 135, render: (value) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value) },
    { title: "Trạng thái đơn", dataIndex: "paymentStatus", width: 135, render: (status) => status === "paid" ? <Tag color="success" bordered={false}>Đã thanh toán</Tag> : status === "unpaid" ? <Tag color="error" bordered={false}>Chưa thanh toán</Tag> : <Tag bordered={false}>Chờ xác minh</Tag> },
  ];

  if (loading) return <div className="shipping-page"><Skeleton active paragraph={{ rows: 14 }} /></div>;
  if (!task) return <div className="shipping-page"><Card className="shipping-panel"><Empty description="Không tìm thấy nhiệm vụ xuất hàng"><Button onClick={() => navigate("/shipping/tasks")}>Quay lại danh sách</Button></Empty></Card></div>;

  const financials = slip?.financials;
  const orderValue = financials?.order_value ?? task.total_value;
  const shippingFee = financials?.shipping_fee ?? task.estimated_shipping_fee;
  const codAmount = financials?.cod_amount ?? task.cod_amount ?? 0;
  const totalAmount = financials?.total_amount ?? orderValue + shippingFee + codAmount;
  const payment = slip?.payment;
  const paymentPaid = payment?.status === "paid";
  const paymentAlertType = paymentPaid ? "success" : payment?.status === "partial" ? "warning" : "error";
  const paymentTitle = paymentPaid ? "Các đơn hàng đã thanh toán" : payment?.status === "partial" ? "Thanh toán chưa hoàn tất" : "Chưa xác nhận thanh toán";
  const paymentDescription = paymentPaid ? "Tất cả đơn hàng trong nhiệm vụ đều đã thanh toán." : payment ? `${payment.paid_package_count}/${payment.total_package_count} kiện đã được xác nhận thanh toán.` : "Chưa có dữ liệu thanh toán để xác minh.";

  const progressSteps = [
    { status: "created", label: "Chờ xử lý", time: task.created_at },
    { status: "preparing", label: "Đang chuẩn bị", time: undefined as string | null | undefined },
    { status: "in_transit", label: "Đang giao hàng", time: undefined as string | null | undefined },
    { status: "completed", label: "Hoàn thành", time: undefined as string | null | undefined },
    { status: "cancelled", label: "Đã hủy", time: undefined as string | null | undefined },
  ].map((step) => ({ ...step, time: step.time || history.find((item) => item.to_status === step.status)?.created_at }));
  const normalStatuses = ["created", "preparing", "in_transit", "completed"];
  const currentIndex = normalStatuses.indexOf(task.status);

  const historyText = (action: string, toStatus?: string | null) => {
    if (action === "create_shipping_task") return { title: "Tạo nhiệm vụ xuất hàng", description: "Nhiệm vụ xuất hàng đã được tạo" };
    const status = toStatus || "created";
    return { title: status === "completed" ? "Hoàn thành nhiệm vụ" : status === "cancelled" ? "Hủy nhiệm vụ" : `Chuyển sang ${detailStatusLabels[status] || status}`, description: "Trạng thái nhiệm vụ đã được cập nhật" };
  };

  return <div className="shipping-page shipping-task-detail">
    <Breadcrumb className="shipping-detail-breadcrumb" items={[{ title: <Link to="/shipping/queue">Xuất hàng</Link> }, { title: <Link to="/shipping/tasks">Nhiệm vụ xuất hàng</Link> }, { title: "Chi tiết nhiệm vụ" }]} />
    <div className="shipping-page__header shipping-print-hidden">
      <div className="shipping-task-detail__heading"><div className="shipping-detail-title"><Typography.Title level={2} className="shipping-page__title">Chi tiết nhiệm vụ xuất hàng</Typography.Title><TaskDetailStatusTag status={task.status} /></div><span className="shipping-page__subtitle">Cập nhật lần cuối: {lastUpdated ? dayjs(lastUpdated).format("DD/MM/YYYY HH:mm") : "—"}</span></div>
      <Space wrap>
        <Tooltip title={task.export_slip_id ? "In phiếu xuất hàng" : "Nhiệm vụ chưa có phiếu xuất"}><Button icon={<PrinterOutlined />} disabled={!task.export_slip_id} onClick={() => task.export_slip_id && navigate(`/shipping/slips/${task.export_slip_id}?print=1`)}>In phiếu xuất</Button></Tooltip>
        <Button icon={<UnorderedListOutlined />} onClick={() => window.print()}>In danh sách</Button>
        <Dropdown menu={{ items: actionItems }} trigger={["click"]}><Button icon={<MoreOutlined />}>Thao tác</Button></Dropdown>
      </Space>
    </div>

    <div className="shipping-task-detail-hero-grid">
      <Card className="shipping-panel shipping-task-identity">
        <div className="shipping-task-identity__group"><Meta label="Mã nhiệm vụ"><span className="shipping-task-identity__code">{task.task_code}</span><Button type="text" size="small" icon={<CopyOutlined />} aria-label="Sao chép mã nhiệm vụ" onClick={() => void copyCode(task.task_code)} /></Meta><Meta label="Mã phiếu xuất">{task.export_slip_id && task.export_code ? <><Link to={`/shipping/slips/${task.export_slip_id}`}>{task.export_code}</Link><Button type="text" size="small" icon={<CopyOutlined />} aria-label="Sao chép mã phiếu xuất" onClick={() => void copyCode(task.export_code!)} /></> : "—"}</Meta></div>
        <div className="shipping-task-identity__group"><Meta icon={<CalendarOutlined />} label="Ngày tạo">{task.created_at ? dayjs(task.created_at).format("DD/MM/YYYY HH:mm") : "—"}</Meta><Meta icon={<UserOutlined />} label="Người tạo">{slip?.creator_name || "—"}</Meta></div>
        <div className="shipping-task-identity__group"><Meta icon={<EnvironmentOutlined />} label="Kho xuất hàng">{task.warehouse_name || "—"}</Meta><Meta icon={<EnvironmentOutlined />} label="Giao hàng từ">{task.warehouse_name || "—"}</Meta></div>
        <div className="shipping-task-identity__group"><Meta label="Trạng thái"><TaskDetailStatusTag status={task.status} /></Meta><Meta icon={<CalendarOutlined />} label="Dự kiến giao ngày">{task.scheduled_delivery_date ? dayjs(task.scheduled_delivery_date).format("DD/MM/YYYY") : "—"}</Meta></div>
      </Card>
      <Card title="Tiến trình xử lý" className="shipping-panel shipping-task-progress">
        <div className="shipping-task-progress__list">{progressSteps.map((step, index) => {
          const isCancelled = step.status === "cancelled";
          const active = task.status === step.status;
          const complete = !isCancelled && (task.status === "cancelled" ? !!step.time : index < currentIndex);
          return <div className={`shipping-task-progress__step${active ? " is-active" : ""}${complete ? " is-complete" : ""}${isCancelled && active ? " is-cancelled" : ""}`} key={step.status}><span>{complete ? <CheckCircleOutlined /> : index + 1}</span><strong>{step.label}</strong><small>{step.time ? dayjs(step.time).format("DD/MM/YYYY HH:mm") : "—"}</small></div>;
        })}</div>
      </Card>
    </div>

    <div className="shipping-task-detail-main-grid">
      <Card title={`Danh sách đơn hàng (${task.order_count})`} className="shipping-panel shipping-task-orders-card" styles={{ body: { padding: 0 } }}>
        <Table<TaskOrderRow> rowKey="id" columns={columns} dataSource={orderRows} pagination={false} scroll={{ x: 1120 }} locale={{ emptyText: "Nhiệm vụ chưa có đơn hàng." }} summary={() => <Table.Summary.Row className="shipping-detail-table__summary"><Table.Summary.Cell index={0} colSpan={4}>Tổng cộng</Table.Summary.Cell><Table.Summary.Cell index={4} align="center">{task.total_packages}</Table.Summary.Cell><Table.Summary.Cell index={5} align="right">{formatWeight(task.total_weight)}</Table.Summary.Cell><Table.Summary.Cell index={6} align="right">{formatVnd(task.total_value)}</Table.Summary.Cell><Table.Summary.Cell index={7} /></Table.Summary.Row>} />
      </Card>
      <Card title="Tổng quan" className="shipping-panel shipping-task-overview-card"><div className="shipping-create-overview">
        <OverviewItem icon={<FileTextOutlined />} label="Số đơn hàng" value={task.order_count} tone="blue" />
        <OverviewItem icon={<AppstoreOutlined />} label="Tổng kiện" value={task.total_packages} tone="green" />
        <OverviewItem icon={<ColumnHeightOutlined />} label="Tổng khối lượng" value={formatWeight(task.total_weight)} tone="purple" />
        <OverviewItem icon={<DollarCircleOutlined />} label="Tổng giá trị đơn hàng" value={formatVnd(task.total_value)} tone="orange" />
      </div></Card>
    </div>

    <div className="shipping-task-detail-bottom-grid">
      <Card title="Thông tin giao hàng & vận chuyển" className="shipping-panel shipping-task-delivery-card">
        <DetailLine icon={<UserOutlined />} label="Nhân viên giao hàng">{task.delivery_staff_name ? `${task.delivery_staff_name}${task.delivery_staff_phone ? ` - ${task.delivery_staff_phone}` : ""}` : "—"}</DetailLine>
        <DetailLine icon={<CarOutlined />} label="Đơn vị vận chuyển">{task.carrier_name || "—"}</DetailLine>
        <DetailLine icon={<RocketOutlined />} label="Dịch vụ vận chuyển">{task.service_type ? serviceLabels[task.service_type] || task.service_type : "—"}</DetailLine>
        <DetailLine icon={<SwapOutlined />} label="Hình thức giao hàng">{task.delivery_method ? deliveryLabels[task.delivery_method] || task.delivery_method : "—"}</DetailLine>
        <DetailLine icon={<EnvironmentOutlined />} label="Giao hàng từ">{task.warehouse_name || "—"}</DetailLine>
        <DetailLine icon={<DollarCircleOutlined />} label="Phí vận chuyển (dự kiến)">{formatVnd(shippingFee)}</DetailLine>
        <DetailLine icon={<WalletOutlined />} label="Thu hộ (COD)">{formatVnd(codAmount)}</DetailLine>
        <DetailLine icon={<FileTextOutlined />} label="Ghi chú giao hàng">{task.note || "Không có ghi chú"}</DetailLine>
      </Card>
      <Card title="Thông tin thanh toán" className="shipping-panel shipping-task-payment-card">
        <FinancialLine label="Tổng giá trị đơn hàng" value={formatVnd(orderValue)} />
        <FinancialLine label="Phí vận chuyển dự kiến" value={formatVnd(shippingFee)} />
        <FinancialLine label="Thu hộ COD" value={formatVnd(codAmount)} />
        <div className="shipping-task-payment-card__total"><span>Tổng cộng dự kiến</span><strong>{formatVnd(totalAmount)}</strong></div>
        <Alert className="shipping-task-payment-card__alert" type={paymentAlertType} showIcon message={paymentTitle} description={paymentDescription} />
      </Card>
      <Card title={<span><HistoryOutlined /> Lịch sử xử lý</span>} className="shipping-panel shipping-task-history-card">
        {history.length ? <Timeline items={history.map((item) => { const text = historyText(item.action, item.to_status); return { color: item.to_status === "cancelled" ? "red" : "blue", children: <div className="shipping-history-item"><strong>{text.title}</strong><p>{item.created_at ? dayjs(item.created_at).format("DD/MM/YYYY HH:mm") : "—"}</p><span>{item.actor_name ? `Người thực hiện: ${item.actor_name}` : text.description}</span></div> }; })} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có lịch sử xử lý" />}
      </Card>
    </div>

    <div className="shipping-task-detail-footer shipping-print-hidden"><Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/shipping/tasks")}>Quay lại danh sách</Button>{statusMenuItems.length > 0 && <Dropdown menu={{ items: statusMenuItems }} trigger={["click"]}><Button type="primary" loading={updating}>Cập nhật trạng thái</Button></Dropdown>}</div>
  </div>;
};

const Meta = ({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) => <div className="shipping-task-meta"><span>{icon}{label}</span><strong>{children}</strong></div>;
const OverviewItem = ({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: string }) => <div className={`shipping-create-overview__item shipping-create-overview__item--${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
const FinancialLine = ({ label, value }: { label: string; value: string }) => <div className="shipping-task-payment-line"><span>{label}</span><strong>{value}</strong></div>;
