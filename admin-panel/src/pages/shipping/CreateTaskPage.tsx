import { useEffect, useMemo, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import {
  Alert, Breadcrumb, Button, Card, Col, DatePicker, Divider, Form, Input, InputNumber, Modal, Row,
  Select, Skeleton, Steps, Table, Typography, message,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  AppstoreOutlined, ArrowLeftOutlined, ArrowRightOutlined, CalendarOutlined, CarOutlined, CheckCircleFilled, CheckOutlined,
  ColumnHeightOutlined, CopyOutlined, DollarCircleOutlined, EditOutlined, EnvironmentOutlined, FileDoneOutlined, FileTextOutlined,
  InfoCircleOutlined, RocketOutlined, SwapOutlined, UnorderedListOutlined, UserOutlined, WalletOutlined, WarningOutlined,
} from "@ant-design/icons";
import { Link, useNavigate, useSearchParams } from "react-router";
import { createShippingTask, fetchShippingQueueOptions, fetchShippingTaskOptions, shippingErrorMessage } from "./api";
import { formatVnd, formatWeight, ShippingStatusTag, taskStatusLabels } from "./helpers";
import type { CreateShippingTaskInput, ShippingQueueOrder, ShippingTask, ShippingTaskOptions } from "./types";
import "./shipping.css";

type DeliveryForm = Omit<CreateShippingTaskInput, "order_ids" | "scheduled_delivery_date"> & { scheduled_delivery_date: Dayjs };
type Totals = { orders: number; packages: number; weight: number; value: number };

const serviceLabels: Record<string, string> = { standard: "Tiêu chuẩn", express: "Nhanh", same_day: "Hỏa tốc" };
const methodLabels: Record<string, string> = { door_delivery: "Giao tận nơi", warehouse_pickup: "Nhận tại kho", transshipment: "Trung chuyển" };
const moneyFormatter = (value?: string | number) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(value || 0))} VND`;

export const CreateShippingTaskPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedIds = useMemo(() => Array.from(new Set((searchParams.get("orders") || "").split(",").filter(Boolean))), [searchParams]);
  const [form] = Form.useForm<DeliveryForm>();
  const estimatedFee = Form.useWatch("estimated_shipping_fee", form) ?? 0;
  const codAmount = Form.useWatch("cod_amount", form) ?? 0;
  const [step, setStep] = useState(0);
  const [orders, setOrders] = useState<ShippingQueueOrder[]>([]);
  const [options, setOptions] = useState<ShippingTaskOptions>({ deliveryStaff: [], warehouses: [], carriers: [] });
  const [delivery, setDelivery] = useState<DeliveryForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [createdTask, setCreatedTask] = useState<ShippingTask | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetchShippingQueueOptions(requestedIds), fetchShippingTaskOptions()])
      .then(([queueOrders, taskOptions]) => {
        if (!active) return;
        setOrders(queueOrders);
        setOptions(taskOptions);
        if (taskOptions.warehouses.length === 1) form.setFieldValue("vn_warehouse_id", taskOptions.warehouses[0].id);
      })
      .catch((error) => message.error(shippingErrorMessage(error)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [form, requestedIds]);

  useEffect(() => {
    if (!dirty || createdTask) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [createdTask, dirty]);

  const totals = useMemo<Totals>(() => ({
    orders: orders.length,
    packages: orders.reduce((sum, order) => sum + order.package_count, 0),
    weight: orders.reduce((sum, order) => sum + order.total_weight, 0),
    value: orders.reduce((sum, order) => sum + order.total_value, 0),
  }), [orders]);
  const allOrdersEligible = requestedIds.length > 0 && requestedIds.length === orders.length;
  const selectedStaff = delivery ? options.deliveryStaff.find((item) => item.id === delivery.delivery_staff_id) : undefined;
  const selectedCarrier = delivery ? options.carriers.find((item) => item.code === delivery.carrier_code) : undefined;
  const selectedWarehouse = delivery ? options.warehouses.find((item) => item.id === delivery.vn_warehouse_id) : undefined;

  const orderColumns: TableColumnsType<ShippingQueueOrder> = [
    { title: "STT", width: 58, align: "center", render: (_, __, index) => index + 1 },
    { title: "Mã vận đơn", dataIndex: "tracking_numbers", width: 175, render: (values: string[]) => values.length ? <div className="shipping-tracking-list">{values.map((value) => <span key={value}>{value}</span>)}</div> : "—" },
    { title: "Mã đơn hàng", dataIndex: "order_code", width: 165, render: (value, row) => <Link to={`/orders/show/${row.id}`} className="shipping-table__order-link">{value}</Link> },
    { title: "Khách hàng", width: 180, render: (_, row) => <div><strong>{row.customer_name}</strong>{row.customer_phone && <small className="shipping-table__subtext">{row.customer_phone}</small>}</div> },
    { title: "Số kiện", dataIndex: "package_count", align: "center", width: 90 },
    { title: "Khối lượng (kg)", dataIndex: "total_weight", align: "right", width: 125, render: (value) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value) },
    { title: "Giá trị (VND)", dataIndex: "total_value", align: "right", width: 140, render: (value) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value) },
  ];

  const leaveToList = () => {
    if (!dirty) { navigate("/shipping/queue"); return; }
    Modal.confirm({ title: "Rời khỏi trang tạo nhiệm vụ?", content: "Thông tin chưa lưu sẽ bị mất.", okText: "Rời khỏi trang", cancelText: "Ở lại", onOk: () => navigate("/shipping/queue") });
  };
  const nextFromDelivery = async () => {
    try { const values = await form.validateFields(); setDelivery(values); setStep(2); }
    catch { message.warning("Vui lòng hoàn tất các trường bắt buộc."); }
  };
  const submit = async () => {
    if (!delivery || !allOrdersEligible || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await createShippingTask({ ...delivery, order_ids: orders.map((order) => order.id), scheduled_delivery_date: delivery.scheduled_delivery_date.format("YYYY-MM-DD") });
      setCreatedTask(result.task); setDirty(false); message.success(result.message);
    } catch (error) { const errorMessage = shippingErrorMessage(error); setSubmitError(errorMessage); message.error(errorMessage); }
    finally { setSubmitting(false); }
  };

  if (createdTask) return <ShippingTaskSuccess task={createdTask} navigate={navigate} />;

  return <div className="shipping-page shipping-create-page">
    <Breadcrumb items={[{ title: <Link to="/shipping/queue">Xuất hàng</Link> }, { title: <Link to="/shipping/tasks">Nhiệm vụ xuất hàng</Link> }, { title: "Tạo nhiệm vụ xuất hàng" }]} />
    <div className="shipping-page__header"><div><Typography.Title level={2} className="shipping-page__title">Tạo nhiệm vụ xuất hàng</Typography.Title><span className="shipping-page__subtitle">Kiểm tra thông tin đơn hàng và nhập thông tin giao hàng</span></div><Button icon={<ArrowLeftOutlined />} onClick={leaveToList}>Quay lại danh sách</Button></div>
    <Steps className="shipping-create-steps" current={step} responsive items={[
      { title: "Chọn đơn hàng", description: "Xem tóm tắt các đơn đã chọn" },
      { title: "Thông tin giao hàng", description: "Nhập thông tin giao hàng và vận chuyển" },
      { title: "Xác nhận", description: "Kiểm tra và tạo nhiệm vụ" },
    ]} />

    {loading ? <div className="shipping-create-skeleton"><Card className="shipping-panel"><Skeleton active paragraph={{ rows: 10 }} /></Card><Card className="shipping-panel"><Skeleton active paragraph={{ rows: 7 }} /></Card></div> : <>
      {!allOrdersEligible && <Alert type="error" showIcon message="Danh sách đơn hàng đã thay đổi" description="Một hoặc nhiều đơn không còn ở trạng thái đã thanh toán/chờ xuất. Vui lòng quay lại danh sách và chọn lại." />}

      {step === 0 && <div className="shipping-create-step-grid">
        <Card title="Tóm tắt đơn hàng đã chọn" className="shipping-panel" styles={{ body: { padding: 16 } }}>
          <Alert className="shipping-create-info" type="info" showIcon icon={<InfoCircleOutlined />} message={`Bạn đã chọn ${orders.length} đơn hàng từ danh sách chờ xuất.`} description="Vui lòng kiểm tra lại thông tin các đơn bên dưới trước khi tiếp tục." />
          <Typography.Title level={5} className="shipping-create-table-title">Danh sách vận đơn đã chọn ({orders.length})</Typography.Title>
          <OrderTable orders={orders} columns={orderColumns} totals={totals} />
        </Card>
        <Card title="Tổng quan đơn hàng đã chọn" className="shipping-panel shipping-create-summary-card">
          <Overview totals={totals} />
          {allOrdersEligible ? <Alert className="shipping-create-valid" type="success" showIcon message="Tất cả đơn hàng đều đã thanh toán" description="Các đơn hàng đã chọn đều đủ điều kiện để tạo nhiệm vụ xuất hàng." /> : <Alert type="error" showIcon message="Có đơn hàng không còn hợp lệ" description="Không thể tiếp tục cho tới khi danh sách được chọn lại." />}
          <Button type="primary" icon={<ArrowRightOutlined />} disabled={!allOrdersEligible} onClick={() => setStep(1)}>Tiếp tục</Button>
        </Card>
      </div>}

      {step === 1 && <div className="shipping-create-step-grid">
        <Card title="Thông tin giao hàng và vận chuyển" className="shipping-panel">
          <Form<DeliveryForm> form={form} layout="vertical" initialValues={{ service_type: "standard", delivery_method: "door_delivery", estimated_shipping_fee: 0, cod_amount: 0 }} onValuesChange={() => setDirty(true)}>
            <Row gutter={16}>
              <Col xs={24} md={12}><Form.Item name="delivery_staff_id" label="Nhân viên giao hàng" rules={[{ required: true, message: "Vui lòng chọn nhân viên giao hàng" }]}><Select showSearch optionFilterProp="label" placeholder="Chọn nhân viên" options={options.deliveryStaff.map((item) => ({ value: item.id, label: `${item.name}${item.phone ? ` - ${item.phone}` : ""}` }))} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="vn_warehouse_id" label="Kho xuất hàng / Giao hàng từ" rules={[{ required: true, message: "Vui lòng chọn kho xuất" }]}><Select showSearch optionFilterProp="label" placeholder="Chọn kho xuất" options={options.warehouses.map((item) => ({ value: item.id, label: `${item.name}${item.address ? ` - ${item.address}` : ""}` }))} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="carrier_code" label="Đơn vị vận chuyển" rules={[{ required: true, message: "Vui lòng chọn đơn vị vận chuyển" }]}><Select showSearch optionFilterProp="label" placeholder="Chọn đơn vị vận chuyển" options={options.carriers.map((item) => ({ value: item.code, label: `${item.code.toUpperCase()} - ${item.name}` }))} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="service_type" label="Dịch vụ vận chuyển" rules={[{ required: true, message: "Vui lòng chọn dịch vụ vận chuyển" }]}><Select options={Object.entries(serviceLabels).map(([value, label]) => ({ value, label }))} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="delivery_method" label="Hình thức giao hàng" rules={[{ required: true, message: "Vui lòng chọn hình thức giao hàng" }]}><Select options={Object.entries(methodLabels).map(([value, label]) => ({ value, label }))} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="scheduled_delivery_date" label="Dự kiến giao ngày" rules={[{ required: true, message: "Vui lòng chọn ngày giao dự kiến" }]}><DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" disabledDate={(date) => date.startOf("day").isBefore(dayjs().startOf("day"))} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="estimated_shipping_fee" label="Phí vận chuyển dự kiến" rules={[{ required: true, message: "Vui lòng nhập phí vận chuyển dự kiến" }, { type: "number", min: 0, message: "Phí vận chuyển không được âm" }]}><InputNumber min={0} precision={0} formatter={moneyFormatter} parser={(value) => Number((value || "").replace(/\D/g, ""))} style={{ width: "100%" }} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="cod_amount" label="Thu hộ COD" rules={[{ type: "number", min: 0, message: "Tiền thu hộ không được âm" }]}><InputNumber min={0} precision={0} formatter={moneyFormatter} parser={(value) => Number((value || "").replace(/\D/g, ""))} style={{ width: "100%" }} /></Form.Item></Col>
              <Col span={24}><Form.Item name="note" label="Ghi chú giao hàng"><Input.TextArea showCount maxLength={250} rows={3} placeholder="Nhập ghi chú giao hàng nếu có..." /></Form.Item></Col>
              <Col span={24}><Form.Item name="transport_note" label="Ghi chú vận chuyển"><Input.TextArea maxLength={1000} rows={3} placeholder="Lưu ý riêng cho quá trình vận chuyển..." /></Form.Item></Col>
            </Row>
          </Form>
        </Card>
        <Card title="Tóm tắt đơn hàng" className="shipping-panel shipping-create-summary-card">
          <FinancialSummary totals={totals} shippingFee={Number(estimatedFee)} cod={Number(codAmount)} />
          <Alert type="warning" showIcon message="Lưu ý" description="Vui lòng nhập đầy đủ thông tin giao hàng để tiếp tục." />
        </Card>
        <WizardFooter back={() => setStep(0)} next={() => void nextFromDelivery()} />
      </div>}

      {step === 2 && delivery && <>
        <Alert
          className="shipping-confirm-notice"
          type="info"
          showIcon
          message="Vui lòng kiểm tra lại toàn bộ thông tin bên dưới. Sau khi tạo, nhiệm vụ xuất hàng sẽ ở trạng thái “Đã tạo” và chờ xử lý."
        />
        <div className="shipping-create-confirm-grid">
          <Card
            title="Thông tin giao hàng & vận chuyển"
            className="shipping-panel shipping-confirm-card"
            extra={<Button type="link" icon={<EditOutlined />} onClick={() => setStep(1)}>Chỉnh sửa</Button>}
          >
            <ConfirmLine icon={<UserOutlined />} label="Nhân viên giao hàng" value={selectedStaff ? `${selectedStaff.name}${selectedStaff.phone ? ` - ${selectedStaff.phone}` : ""}` : "—"} />
            <ConfirmLine icon={<CarOutlined />} label="Đơn vị vận chuyển" value={selectedCarrier ? `${selectedCarrier.code.toUpperCase()} - ${selectedCarrier.name}` : delivery.carrier_name || "—"} />
            <ConfirmLine icon={<RocketOutlined />} label="Dịch vụ vận chuyển" value={serviceLabels[delivery.service_type || ""] || "—"} />
            <ConfirmLine icon={<SwapOutlined />} label="Hình thức giao hàng" value={methodLabels[delivery.delivery_method || ""] || "—"} />
            <ConfirmLine icon={<EnvironmentOutlined />} label="Giao hàng từ" value={selectedWarehouse?.name || "—"} />
            <ConfirmLine icon={<CalendarOutlined />} label="Dự kiến giao ngày" value={delivery.scheduled_delivery_date.format("DD/MM/YYYY")} />
            <Divider className="shipping-confirm-card__divider" />
            <ConfirmLine icon={<DollarCircleOutlined />} label="Phí vận chuyển (dự kiến)" value={formatVnd(delivery.estimated_shipping_fee)} />
            <ConfirmLine icon={<WalletOutlined />} label="Thu hộ (COD)" value={formatVnd(delivery.cod_amount)} />
            <ConfirmLine icon={<FileTextOutlined />} label="Ghi chú giao hàng" value={delivery.note || "Không có ghi chú"} />
          </Card>
          <Card title={`Danh sách đơn hàng (${orders.length})`} className="shipping-panel shipping-confirm-orders" styles={{ body: { padding: 0 } }}>
            <OrderTable orders={orders} columns={orderColumns} totals={totals} />
            <Alert
              className="shipping-confirm-orders__warning"
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message="Lưu ý"
              description="Sau khi tạo nhiệm vụ, các đơn hàng sẽ rời danh sách chờ xuất và sẵn sàng cho bước chuẩn bị."
            />
          </Card>
          <Card title="Thông tin thanh toán" className="shipping-panel shipping-create-summary-card shipping-confirm-payment">
            <FinancialSummary totals={totals} shippingFee={Number(delivery.estimated_shipping_fee || 0)} cod={Number(delivery.cod_amount || 0)} concise />
            <Alert
              className="shipping-create-valid shipping-confirm-ready"
              type="success"
              showIcon
              message="Sẵn sàng tạo nhiệm vụ"
              description={<><span>Thông tin đã đầy đủ và hợp lệ.</span><span>Bạn có thể tạo nhiệm vụ xuất hàng.</span></>}
            />
          </Card>
          {submitError && <Alert className="shipping-create-submit-error" type="error" showIcon message="Không thể tạo nhiệm vụ xuất hàng" description={submitError} action={<Button size="small" onClick={() => setSubmitError(null)}>Quay lại kiểm tra</Button>} />}
          <div className="shipping-wizard__footer shipping-create-confirm-footer"><Button icon={<ArrowLeftOutlined />} onClick={() => setStep(1)}>Quay lại</Button><Button className="shipping-create-submit" type="primary" icon={<CheckOutlined />} loading={submitting} disabled={submitting} onClick={() => void submit()}>Tạo nhiệm vụ xuất hàng</Button></div>
        </div>
      </>}
    </>}
  </div>;
};

const OrderTable = ({ orders, columns, totals, compact }: { orders: ShippingQueueOrder[]; columns: TableColumnsType<ShippingQueueOrder>; totals: Totals; compact?: boolean }) => <Table<ShippingQueueOrder> rowKey="id" className="shipping-create-orders" columns={columns} dataSource={orders} pagination={false} scroll={{ x: compact ? 780 : 980 }} locale={{ emptyText: "Không có đơn hợp lệ để tạo nhiệm vụ." }} summary={() => <Table.Summary.Row className="shipping-create-orders__total"><Table.Summary.Cell index={0} colSpan={compact ? 3 : 4}>Tổng cộng</Table.Summary.Cell><Table.Summary.Cell index={compact ? 3 : 4} align="center">{totals.packages}</Table.Summary.Cell><Table.Summary.Cell index={compact ? 4 : 5} align="right">{formatWeight(totals.weight)}</Table.Summary.Cell><Table.Summary.Cell index={compact ? 5 : 6} align="right">{formatVnd(totals.value)}</Table.Summary.Cell></Table.Summary.Row>} />;

const Overview = ({ totals }: { totals: Totals }) => <div className="shipping-create-overview">{[
  { label: "Số đơn hàng", value: totals.orders, icon: <FileTextOutlined />, tone: "blue" },
  { label: "Tổng kiện", value: `${totals.packages} kiện`, icon: <AppstoreOutlined />, tone: "green" },
  { label: "Tổng khối lượng", value: formatWeight(totals.weight), icon: <ColumnHeightOutlined />, tone: "purple" },
  { label: "Tổng giá trị đơn hàng", value: formatVnd(totals.value), icon: <DollarCircleOutlined />, tone: "orange" },
].map((item) => <div className={`shipping-create-overview__item shipping-create-overview__item--${item.tone}`} key={item.label}><span>{item.icon}</span><div><small>{item.label}</small><strong>{item.value}</strong></div></div>)}</div>;

const FinancialSummary = ({ totals, shippingFee, cod, concise = false }: { totals: Totals; shippingFee: number; cod: number; concise?: boolean }) => <div className="shipping-create-financial">{!concise && <><div><span>Số đơn hàng</span><strong>{totals.orders}</strong></div><div><span>Tổng kiện</span><strong>{totals.packages}</strong></div><div><span>Tổng khối lượng</span><strong>{formatWeight(totals.weight)}</strong></div></>}<div><span>Tổng giá trị đơn hàng</span><strong>{formatVnd(totals.value)}</strong></div><div><span>Phí vận chuyển (dự kiến)</span><strong>{formatVnd(shippingFee)}</strong></div><div><span>Thu hộ (COD)</span><strong>{formatVnd(cod)}</strong></div><div className="shipping-create-financial__total"><span>Tổng cộng dự kiến</span><strong>{formatVnd(totals.value + shippingFee + cod)}</strong></div></div>;
const ConfirmLine = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => <div className="shipping-confirm-line"><span className="shipping-confirm-line__icon">{icon}</span><span className="shipping-confirm-line__label">{label}</span><strong>{value}</strong></div>;
const WizardFooter = ({ back, next }: { back: () => void; next: () => void }) => <div className="shipping-wizard__footer shipping-create-step-footer"><Button icon={<ArrowLeftOutlined />} onClick={back}>Quay lại</Button><Button type="primary" icon={<ArrowRightOutlined />} onClick={next}>Tiếp tục</Button></div>;

const ShippingTaskSuccess = ({ task, navigate }: { task: ShippingTask; navigate: ReturnType<typeof useNavigate> }) => {
  const copyCode = async (value: string) => {
    try { await navigator.clipboard.writeText(value); message.success("Đã sao chép mã"); }
    catch { message.warning("Không thể sao chép mã tự động"); }
  };
  const stats = [
    { label: "Số đơn hàng", value: task.order_count, icon: <FileTextOutlined />, tone: "blue" },
    { label: "Tổng kiện", value: task.total_packages, icon: <AppstoreOutlined />, tone: "green" },
    { label: "Tổng khối lượng", value: formatWeight(task.total_weight), icon: <ColumnHeightOutlined />, tone: "purple" },
    { label: "Tổng giá trị đơn hàng", value: formatVnd(task.total_value), icon: <DollarCircleOutlined />, tone: "orange" },
    { label: "Phí vận chuyển (dự kiến)", value: formatVnd(task.estimated_shipping_fee), icon: <CarOutlined />, tone: "cyan" },
    { label: "Thu hộ (COD)", value: formatVnd(task.cod_amount), icon: <WalletOutlined />, tone: "yellow" },
  ];

  return <div className="shipping-page shipping-create-page shipping-success-page">
    <Card className="shipping-success-card" bordered={false}>
      <div className="shipping-success-hero">
        <div className="shipping-success-hero__icon"><CheckOutlined /></div>
        <Typography.Title level={2}>Tạo nhiệm vụ xuất hàng thành công!</Typography.Title>
        <Typography.Paragraph>Nhiệm vụ xuất hàng đã được tạo và chuyển sang trạng thái “{taskStatusLabels[task.status] ?? task.status}”.</Typography.Paragraph>
      </div>

      <div className="shipping-success-codes">
        <div className="shipping-success-code shipping-success-code--task">
          <span className="shipping-success-code__icon"><FileDoneOutlined /></span>
          <Link to={`/shipping/tasks/${task.id}`}><small>Mã nhiệm vụ</small><strong>{task.task_code}</strong></Link>
          <Button type="text" size="small" className="shipping-success-code__copy" icon={<CopyOutlined />} title="Sao chép mã nhiệm vụ" aria-label="Sao chép mã nhiệm vụ" onClick={() => void copyCode(task.task_code)} />
        </div>
        {task.export_slip_id && task.export_code ? <div className="shipping-success-code shipping-success-code--slip">
          <span className="shipping-success-code__icon"><FileTextOutlined /></span>
          <Link to={`/shipping/slips/${task.export_slip_id}`}><small>Phiếu xuất hàng</small><strong>{task.export_code}</strong></Link>
          <Button type="text" size="small" className="shipping-success-code__copy" icon={<CopyOutlined />} title="Sao chép mã phiếu xuất" aria-label="Sao chép mã phiếu xuất" onClick={() => void copyCode(task.export_code!)} />
        </div> : <div className="shipping-success-code shipping-success-code--empty"><span className="shipping-success-code__icon"><FileTextOutlined /></span><span><small>Phiếu xuất hàng</small><strong>Chưa tạo phiếu</strong></span></div>}
      </div>

      <Divider />
      <Typography.Title level={4} className="shipping-success-overview-title">Thông tin tổng quan</Typography.Title>
      <div className="shipping-success-stats">{stats.map((item) => <div className={`shipping-success-stat shipping-success-stat--${item.tone}`} key={item.label}><span>{item.icon}</span><div><small>{item.label}</small><strong>{item.value}</strong></div></div>)}</div>

      <Alert className="shipping-success-ready" type="success" showIcon icon={<CheckCircleFilled />} message={<div className="shipping-success-ready__content"><strong>Sẵn sàng xử lý</strong><span>Nhiệm vụ đã được tạo thành công. Bạn có thể kiểm tra chi tiết và tiến hành xử lý.</span></div>} action={<ShippingStatusTag status={task.status} />} />

      <div className="shipping-success-actions">
        <Button type="primary" size="large" icon={<FileDoneOutlined />} onClick={() => navigate(`/shipping/tasks/${task.id}`)}>Xem nhiệm vụ</Button>
        {task.export_slip_id && <Button size="large" icon={<FileTextOutlined />} onClick={() => navigate(`/shipping/slips/${task.export_slip_id}`)}>Xem phiếu xuất</Button>}
        <Button size="large" icon={<UnorderedListOutlined />} onClick={() => navigate("/shipping/tasks")}>Quay lại danh sách</Button>
      </div>
    </Card>
  </div>;
};
