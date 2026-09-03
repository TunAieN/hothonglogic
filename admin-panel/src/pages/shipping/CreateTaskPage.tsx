import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Alert, Breadcrumb, Button, Card, Col, Divider, Form, Input, Modal, Popover, Row,
  Select, Skeleton, Steps, Table, Tag, Typography, message,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  AppstoreOutlined, ArrowLeftOutlined, ArrowRightOutlined, CalendarOutlined, CarOutlined, CheckCircleFilled, CheckOutlined,
  ColumnHeightOutlined, CopyOutlined, DollarCircleOutlined, EditOutlined, EnvironmentOutlined, FileDoneOutlined, FileTextOutlined,
  InfoCircleOutlined, RocketOutlined, SwapOutlined, UnorderedListOutlined, UserOutlined, WalletOutlined, WarningOutlined,
} from "@ant-design/icons";
import { Link, useNavigate, useSearchParams } from "react-router";
import { createShippingTask, fetchShippingQueueOptions, fetchShippingTaskGhnPreview, fetchShippingTaskOptions, shippingErrorMessage } from "./api";
import { formatVnd, formatWeight, ShippingStatusTag, taskStatusLabels } from "./helpers";
import type { CreateShippingTaskInput, ShippingQueueOrder, ShippingTask, ShippingTaskGhnPreview, ShippingTaskOptions } from "./types";
import "./shipping.css";

type DeliveryForm = Pick<CreateShippingTaskInput, "delivery_staff_id" | "note" | "transport_note">;
type Totals = { orders: number; packages: number; weight: number; value: number; settledValue: number };

const formatSettledVnd = (value?: number | null) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value ?? 0)} đ`;
const formatSignedVnd = (value: number) => `${value > 0 ? "+" : ""}${formatSettledVnd(value)}`;

export const CreateShippingTaskPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedIds = useMemo(() => Array.from(new Set((searchParams.get("orders") || "").split(",").filter(Boolean))), [searchParams]);
  const [form] = Form.useForm<DeliveryForm>();
  const [step, setStep] = useState(0);
  const [orders, setOrders] = useState<ShippingQueueOrder[]>([]);
  const [options, setOptions] = useState<ShippingTaskOptions>({ deliveryStaff: [], warehouses: [], carriers: [] });
  const [delivery, setDelivery] = useState<CreateShippingTaskInput | null>(null);
  const [ghnPreview, setGhnPreview] = useState<ShippingTaskGhnPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
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
    settledValue: orders.reduce((sum, order) => sum + order.settled_value, 0),
  }), [orders]);
  const allOrdersEligible = requestedIds.length > 0 && requestedIds.length === orders.length;
  const selectedStaff = delivery ? options.deliveryStaff.find((item) => item.id === delivery.delivery_staff_id) : undefined;

  const orderColumns: TableColumnsType<ShippingQueueOrder> = [
    { title: "STT", width: 58, align: "center", render: (_, __, index) => index + 1 },
    { title: "Mã vận đơn", dataIndex: "tracking_numbers", width: 175, render: (values: string[]) => values.length ? <div className="shipping-tracking-list">{values.map((value) => <span key={value}>{value}</span>)}</div> : "—" },
    { title: "Mã đơn hàng", dataIndex: "order_code", width: 165, render: (value, row) => <Link to={`/orders/show/${row.id}`} className="shipping-table__order-link">{value}</Link> },
    { title: "Khách hàng", width: 180, render: (_, row) => <div><strong>{row.customer_name}</strong>{row.customer_phone && <small className="shipping-table__subtext">{row.customer_phone}</small>}</div> },
    { title: "Số kiện", dataIndex: "package_count", align: "center", width: 90 },
    { title: "Khối lượng (kg)", dataIndex: "total_weight", align: "right", width: 125, render: (value) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value) },
    { title: "Giá trị (VND)", dataIndex: "total_value", align: "right", width: 140, render: (value) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value) },
  ];

  const selectedOrderColumns: TableColumnsType<ShippingQueueOrder> = [
    { title: "Mã đơn hàng", dataIndex: "order_code", width: 155, render: (value, row) => <Link to={`/orders/show/${row.id}`} className="shipping-table__order-link">{value}</Link> },
    {
      title: "Mã vận đơn",
      dataIndex: "tracking_numbers",
      width: 155,
      render: (values: string[]) => {
        if (!values.length) return "—";
        if (values.length === 1) return <span className="shipping-tracking-compact">{values[0]}</span>;
        return <Popover title="Danh sách mã vận đơn" content={<div className="shipping-tracking-popover">{values.map((value) => <span key={value}>{value}</span>)}</div>} trigger={["hover", "click"]}>
          <Button type="link" className="shipping-tracking-more">{values[0]} <span>+{values.length - 1}</span></Button>
        </Popover>;
      },
    },
    { title: "Khách hàng", width: 180, render: (_, row) => <div><strong>{row.customer_name}</strong>{row.customer_phone && <small className="shipping-table__subtext">{row.customer_phone}</small>}</div> },
    { title: "Số kiện", dataIndex: "package_count", align: "center", width: 85 },
    { title: "Khối lượng", dataIndex: "total_weight", align: "right", width: 115, render: (value) => formatWeight(value) },
    { title: "Giá trị đã tất toán", dataIndex: "settled_value", align: "right", width: 155, render: (value) => formatSettledVnd(value) },
    { title: "Trạng thái", align: "center", width: 125, render: () => <Tag color="success" bordered={false}>Đã thanh toán</Tag> },
  ];

  const leaveToList = () => {
    if (!dirty) { navigate("/shipping/queue"); return; }
    Modal.confirm({ title: "Rời khỏi trang tạo nhiệm vụ?", content: "Thông tin chưa lưu sẽ bị mất.", okText: "Rời khỏi trang", cancelText: "Ở lại", onOk: () => navigate("/shipping/queue") });
  };
  const refreshGhnPreview = async (serviceId?: number) => {
    if (!allOrdersEligible || previewLoading) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      setGhnPreview(await fetchShippingTaskGhnPreview(orders.map((order) => order.id), serviceId));
    } catch (error) {
      setGhnPreview(null);
      setPreviewError(shippingErrorMessage(error));
    } finally {
      setPreviewLoading(false);
    }
  };
  const enterDeliveryStep = () => {
    setGhnPreview(null);
    setPreviewError(null);
    setStep(1);
    void refreshGhnPreview();
  };
  const nextFromDelivery = async () => {
    try {
      const values = await form.validateFields();
      if (!ghnPreview) { message.warning("Vui lòng kiểm tra thông tin GHN trước khi tiếp tục."); return; }
      setDelivery({
        ...values,
        order_ids: orders.map((order) => order.id),
        carrier_code: "ghn",
        scheduled_delivery_date: dayjs(ghnPreview.estimated_delivery_at).format("YYYY-MM-DD"),
        vn_warehouse_id: ghnPreview.warehouse.id,
        service_type: ghnPreview.service_name,
        ghn_service_id: ghnPreview.service_id,
        ghn_service_type_id: ghnPreview.service_type_id,
        delivery_method: "door_delivery",
        estimated_shipping_fee: ghnPreview.current_fee,
        cod_amount: 0,
      });
      setStep(2);
    }
    catch { message.warning("Vui lòng hoàn tất các trường bắt buộc."); }
  };
  const submit = async () => {
    if (!delivery || !allOrdersEligible || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await createShippingTask(delivery);
      setCreatedTask(result.task); setDirty(false); message.success(result.message);
    } catch (error) { const errorMessage = shippingErrorMessage(error); setSubmitError(errorMessage); message.error(errorMessage); }
    finally { setSubmitting(false); }
  };

  if (createdTask) return <ShippingTaskSuccess task={createdTask} navigate={navigate} />;

  return <div className="shipping-page shipping-create-page">
    <Breadcrumb items={[{ title: <Link to="/shipping/queue">Xuất hàng</Link> }, { title: <Link to="/shipping/tasks">Nhiệm vụ xuất hàng</Link> }, { title: "Tạo nhiệm vụ xuất hàng" }]} />
    <div className="shipping-page__header"><div><Typography.Title level={2} className="shipping-page__title">Tạo nhiệm vụ xuất hàng</Typography.Title><span className="shipping-page__subtitle">Kiểm tra đơn hàng và xác nhận dữ liệu vận chuyển GHN</span></div><Button icon={<ArrowLeftOutlined />} onClick={leaveToList}>Quay lại danh sách</Button></div>
    <Steps className="shipping-create-steps" current={step} responsive items={[
      { title: "Chọn đơn hàng", description: "Xem và kiểm tra các đơn hàng đã chọn trước khi xuất hàng" },
      { title: "Xác nhận vận chuyển", description: "Kiểm tra kho, địa chỉ và dữ liệu GHN" },
      { title: "Xác nhận", description: "Kiểm tra và tạo nhiệm vụ" },
    ]} />

    {loading ? <div className="shipping-create-skeleton"><Card className="shipping-panel"><Skeleton active paragraph={{ rows: 10 }} /></Card><Card className="shipping-panel"><Skeleton active paragraph={{ rows: 7 }} /></Card></div> : <>
      {!allOrdersEligible && <Alert type="error" showIcon message="Danh sách đơn hàng đã thay đổi" description="Một hoặc nhiều đơn không còn ở trạng thái đã thanh toán/chờ xuất. Vui lòng quay lại danh sách và chọn lại." />}

      {step === 0 && <div className="shipping-create-step-grid">
        <Card title="Tóm tắt đơn hàng đã chọn" className="shipping-panel" styles={{ body: { padding: 16 } }}>
          <Alert className="shipping-create-info" type="info" showIcon icon={<InfoCircleOutlined />} message={`Bạn đã chọn ${orders.length} đơn hàng đã thanh toán từ danh sách chờ xuất.`} description="Vui lòng kiểm tra lại thông tin đơn hàng trước khi tiếp tục." />
          <Typography.Title level={5} className="shipping-create-table-title">Danh sách đơn hàng đã chọn ({orders.length})</Typography.Title>
          <SelectedOrderTable orders={orders} columns={selectedOrderColumns} totals={totals} />
        </Card>
        <Card title="TỔNG QUAN ĐƠN HÀNG ĐÃ CHỌN" className="shipping-panel shipping-create-summary-card">
          <Overview totals={totals} />
          {allOrdersEligible ? <Alert className="shipping-create-valid" type="success" showIcon message="Tất cả đơn hàng đều đã thanh toán" description="Các đơn hàng đã chọn đều đủ điều kiện để tạo nhiệm vụ xuất hàng." /> : <Alert type="error" showIcon message="Có đơn hàng không còn hợp lệ" description="Không thể tiếp tục cho tới khi danh sách được chọn lại." />}
          <Button type="primary" icon={<ArrowRightOutlined />} disabled={!allOrdersEligible} onClick={enterDeliveryStep}>Tiếp tục</Button>
        </Card>
      </div>}

      {step === 1 && <div className="shipping-create-step-grid">
        <Card title="Xác nhận vận chuyển" className="shipping-panel">
          <Form<DeliveryForm> form={form} layout="vertical" onValuesChange={() => setDirty(true)}>
            <section className="shipping-ghn-section">
              <Typography.Title level={5}>1. THÔNG TIN XUẤT HÀNG</Typography.Title>
              <Row gutter={16}>
                <Col xs={24} md={12}><Form.Item name="delivery_staff_id" label="Nhân viên phụ trách xuất hàng" rules={[{ required: true, message: "Vui lòng chọn nhân viên phụ trách xuất hàng" }]}><Select showSearch optionFilterProp="label" placeholder="Chọn nhân viên phụ trách" options={options.deliveryStaff.map((item) => ({ value: item.id, label: `${item.name}${item.phone ? ` - ${item.phone}` : ""}` }))} /></Form.Item></Col>
                <Col xs={24} md={12}><ReadOnlyField label="Kho xuất hàng" value={ghnPreview?.warehouse.name} subtext={ghnPreview?.warehouse.address} loading={previewLoading} /></Col>
              </Row>
            </section>

            {previewLoading && <Skeleton active paragraph={{ rows: 10 }} />}
            {!previewLoading && previewError && <Alert className="shipping-ghn-error" type="error" showIcon message="Không thể kiểm tra thông tin GHN" description={previewError} action={<div className="shipping-ghn-error__actions"><Button size="small" onClick={() => void refreshGhnPreview()}>Thử lại</Button>{previewError.includes("địa chỉ") && <Button size="small" onClick={() => navigate("/payment-vouchers")}>Quay lại xử lý địa chỉ</Button>}</div>} />}
            {!previewLoading && ghnPreview && <GhnPreviewDetails preview={ghnPreview} onServiceChange={(serviceId) => void refreshGhnPreview(serviceId)} />}

            <section className="shipping-ghn-section">
              <Typography.Title level={5}>4. ĐỐI CHIẾU CƯỚC & GHI CHÚ</Typography.Title>
              {ghnPreview && <FeeComparison preview={ghnPreview} />}
              <Row gutter={16}>
                <Col xs={24} md={12}><Form.Item name="note" label="Ghi chú giao hàng"><Input.TextArea showCount maxLength={250} rows={3} placeholder="Nhập ghi chú giao hàng nếu có..." /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="transport_note" label="Ghi chú nội bộ"><Input.TextArea maxLength={1000} rows={3} placeholder="Lưu ý nội bộ cho quá trình xuất hàng..." /></Form.Item></Col>
              </Row>
            </section>
          </Form>
          <Button icon={<RocketOutlined />} loading={previewLoading} onClick={() => void refreshGhnPreview(ghnPreview?.service_id)}>Kiểm tra thông tin GHN</Button>
        </Card>
        <Card title="TÓM TẮT XUẤT HÀNG" className="shipping-panel shipping-create-summary-card">
          <GhnExportSummary totals={totals} preview={ghnPreview} />
          <Alert type={ghnPreview ? "success" : "warning"} showIcon message={ghnPreview ? "Dữ liệu GHN đã được kiểm tra" : "Chưa có dữ liệu GHN hợp lệ"} description={ghnPreview ? "Đây là dữ liệu preview; hệ thống chưa tạo vận đơn GHN." : "Bấm “Kiểm tra thông tin GHN” để thử lại."} />
        </Card>
        <WizardFooter back={() => { setGhnPreview(null); setPreviewError(null); setStep(0); }} next={() => void nextFromDelivery()} />
      </div>}

      {step === 2 && delivery && ghnPreview && <>
        <Alert
          className="shipping-confirm-notice"
          type="info"
          showIcon
          message="Vui lòng kiểm tra lại toàn bộ thông tin bên dưới. Sau khi tạo, nhiệm vụ xuất hàng sẽ ở trạng thái “Đã tạo” và chờ xử lý."
        />
        <div className="shipping-create-confirm-grid">
          <Card
            title="Thông tin xuất hàng & GHN"
            className="shipping-panel shipping-confirm-card"
            extra={<Button type="link" icon={<EditOutlined />} onClick={enterDeliveryStep}>Kiểm tra lại</Button>}
          >
            <ConfirmLine icon={<UserOutlined />} label="Nhân viên phụ trách" value={selectedStaff ? `${selectedStaff.name}${selectedStaff.phone ? ` - ${selectedStaff.phone}` : ""}` : "—"} />
            <ConfirmLine icon={<EnvironmentOutlined />} label="Kho xuất hàng" value={`${ghnPreview.warehouse.name}${ghnPreview.warehouse.address ? ` - ${ghnPreview.warehouse.address}` : ""}`} />
            <ConfirmLine icon={<EnvironmentOutlined />} label="Địa chỉ giao hàng" value={ghnPreview.address.full_address || [ghnPreview.address.address_line, ghnPreview.address.ward_name, ghnPreview.address.district_name, ghnPreview.address.province_name].filter(Boolean).join(", ")} />
            <ConfirmLine icon={<CarOutlined />} label="Đơn vị vận chuyển" value={ghnPreview.carrier_name} />
            <ConfirmLine icon={<RocketOutlined />} label="Dịch vụ GHN" value={`${ghnPreview.service_name} (#${ghnPreview.service_id})`} />
            <ConfirmLine icon={<CalendarOutlined />} label="Dự kiến giao" value={`${dayjs(ghnPreview.estimated_delivery_at).format("DD/MM/YYYY HH:mm")} - Theo dự kiến GHN`} />
            <Divider className="shipping-confirm-card__divider" />
            <ConfirmLine icon={<DollarCircleOutlined />} label="Cước GHN đã thu" value={formatSettledVnd(ghnPreview.collected_fee)} />
            <ConfirmLine icon={<DollarCircleOutlined />} label="Cước GHN hiện tại" value={formatSettledVnd(ghnPreview.current_fee)} />
            <ConfirmLine icon={<SwapOutlined />} label="Chênh lệch" value={formatSignedVnd(ghnPreview.fee_difference)} />
            <ConfirmLine icon={<WalletOutlined />} label="Thu hộ (COD)" value="0 đ — Đơn hàng đã thanh toán trước" />
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
          <Card title="TÓM TẮT XUẤT HÀNG" className="shipping-panel shipping-create-summary-card shipping-confirm-payment">
            <GhnExportSummary totals={totals} preview={ghnPreview} />
            <Alert
              className="shipping-create-valid shipping-confirm-ready"
              type="success"
              showIcon
              message="Sẵn sàng tạo nhiệm vụ"
              description={<><span>Thông tin GHN đã được preview và hợp lệ.</span><span>Thao tác xác nhận chỉ tạo dữ liệu nội bộ.</span></>}
            />
          </Card>
          {submitError && <Alert className="shipping-create-submit-error" type="error" showIcon message="Không thể tạo nhiệm vụ xuất hàng" description={submitError} action={<Button size="small" onClick={() => setSubmitError(null)}>Quay lại kiểm tra</Button>} />}
          <div className="shipping-wizard__footer shipping-create-confirm-footer"><Button icon={<ArrowLeftOutlined />} onClick={enterDeliveryStep}>Quay lại</Button><Button className="shipping-create-submit" type="primary" icon={<CheckOutlined />} loading={submitting} disabled={submitting} onClick={() => void submit()}>Xác nhận tạo nhiệm vụ xuất hàng</Button></div>
        </div>
      </>}
    </>}
  </div>;
};

const OrderTable = ({ orders, columns, totals, compact }: { orders: ShippingQueueOrder[]; columns: TableColumnsType<ShippingQueueOrder>; totals: Totals; compact?: boolean }) => <Table<ShippingQueueOrder> rowKey="id" className="shipping-create-orders" columns={columns} dataSource={orders} pagination={false} scroll={{ x: compact ? 780 : 980 }} locale={{ emptyText: "Không có đơn hợp lệ để tạo nhiệm vụ." }} summary={() => <Table.Summary.Row className="shipping-create-orders__total"><Table.Summary.Cell index={0} colSpan={compact ? 3 : 4}>Tổng cộng</Table.Summary.Cell><Table.Summary.Cell index={compact ? 3 : 4} align="center">{totals.packages}</Table.Summary.Cell><Table.Summary.Cell index={compact ? 4 : 5} align="right">{formatWeight(totals.weight)}</Table.Summary.Cell><Table.Summary.Cell index={compact ? 5 : 6} align="right">{formatVnd(totals.value)}</Table.Summary.Cell></Table.Summary.Row>} />;

const SelectedOrderTable = ({ orders, columns, totals }: { orders: ShippingQueueOrder[]; columns: TableColumnsType<ShippingQueueOrder>; totals: Totals }) => <Table<ShippingQueueOrder> rowKey="id" className="shipping-create-orders" columns={columns} dataSource={orders} pagination={false} scroll={{ x: 970 }} locale={{ emptyText: "Không có đơn hợp lệ để tạo nhiệm vụ." }} summary={() => <Table.Summary.Row className="shipping-create-orders__total"><Table.Summary.Cell index={0} colSpan={3}>Tổng cộng</Table.Summary.Cell><Table.Summary.Cell index={3} align="center">{totals.packages}</Table.Summary.Cell><Table.Summary.Cell index={4} align="right">{formatWeight(totals.weight)}</Table.Summary.Cell><Table.Summary.Cell index={5} align="right">{formatSettledVnd(totals.settledValue)}</Table.Summary.Cell><Table.Summary.Cell index={6} /></Table.Summary.Row>} />;

const Overview = ({ totals }: { totals: Totals }) => <div className="shipping-create-overview">{[
  { label: "Số đơn hàng", value: totals.orders, icon: <FileTextOutlined />, tone: "blue" },
  { label: "Tổng số kiện", value: `${totals.packages} kiện`, icon: <AppstoreOutlined />, tone: "green" },
  { label: "Tổng khối lượng", value: formatWeight(totals.weight), icon: <ColumnHeightOutlined />, tone: "purple" },
  { label: "Tổng giá trị đã tất toán", value: formatSettledVnd(totals.settledValue), icon: <DollarCircleOutlined />, tone: "orange" },
  { label: "Trạng thái thanh toán", value: "Đã thanh toán", icon: <CheckCircleFilled />, tone: "green" },
].map((item) => <div className={`shipping-create-overview__item shipping-create-overview__item--${item.tone}`} key={item.label}><span>{item.icon}</span><div><small>{item.label}</small><strong>{item.value}</strong></div></div>)}</div>;

const ReadOnlyField = ({ label, value, subtext, loading }: { label: string; value?: string | null; subtext?: string | null; loading?: boolean }) => <div className="shipping-readonly-field"><small>{label}</small><strong>{loading ? "Đang xác định..." : value || "—"}</strong>{subtext && <span>{subtext}</span>}</div>;

const GhnPreviewDetails = ({ preview, onServiceChange }: { preview: ShippingTaskGhnPreview; onServiceChange: (serviceId: number) => void }) => <>
  <section className="shipping-ghn-section">
    <Typography.Title level={5}>2. ĐỊA CHỈ GIAO HÀNG</Typography.Title>
    <div className="shipping-ghn-address">
      <strong>{preview.address.receiver_name}</strong>
      <span>{preview.address.receiver_phone}</span>
      <p>{preview.address.address_line}<br />{[preview.address.ward_name, preview.address.district_name, preview.address.province_name].filter(Boolean).join(", ")}</p>
      <div><Tag>GHN District ID: {preview.address.district_code}</Tag><Tag>GHN Ward Code: {preview.address.ward_code}</Tag></div>
    </div>
  </section>
  <section className="shipping-ghn-section">
    <Typography.Title level={5}>3. VẬN CHUYỂN GHN</Typography.Title>
    <div className="shipping-ghn-info-grid">
      <ReadOnlyField label="Đơn vị vận chuyển" value={preview.carrier_name} />
      {preview.services.length > 1 ? <div className="shipping-readonly-field"><small>Dịch vụ GHN</small><Select value={preview.service_id} options={preview.services.map((service) => ({ value: service.service_id, label: service.service_name }))} onChange={onServiceChange} /></div> : <ReadOnlyField label="Dịch vụ GHN" value={preview.service_name} subtext={`Service ID: ${preview.service_id}`} />}
      <ReadOnlyField label="Số kiện" value={`${preview.package_count} kiện`} />
      <ReadOnlyField label="Khối lượng thực tế" value={formatWeight(preview.total_weight)} />
      <ReadOnlyField label="Kích thước tính cước" value={`${preview.length} × ${preview.width} × ${preview.height} cm`} />
      <ReadOnlyField label="Thời gian giao dự kiến" value={dayjs(preview.estimated_delivery_at).format("DD/MM/YYYY HH:mm")} subtext="Theo dự kiến của GHN" />
    </div>
  </section>
</>;

const FeeComparison = ({ preview }: { preview: ShippingTaskGhnPreview }) => <>
  <div className="shipping-ghn-fee-grid">
    <ReadOnlyField label="Cước GHN đã thu khách" value={formatSettledVnd(preview.collected_fee)} />
    <ReadOnlyField label="Cước GHN hiện tại" value={formatSettledVnd(preview.current_fee)} />
    <ReadOnlyField label="Chênh lệch" value={formatSignedVnd(preview.fee_difference)} />
    <ReadOnlyField label="Thu hộ COD" value="0 đ" subtext="Đơn hàng đã thanh toán trước" />
  </div>
  <Alert className="shipping-ghn-fee-status" type={preview.fee_status === "increased" ? "warning" : preview.fee_status === "decreased" ? "info" : "success"} showIcon message={preview.fee_status === "matched" ? "Cước vận chuyển khớp" : preview.fee_status === "increased" ? `Cước GHN tăng ${formatSignedVnd(preview.fee_difference)}` : `Cước GHN giảm ${formatSignedVnd(preview.fee_difference)}`} description="Phiếu thanh toán đã tất toán không bị thay đổi." />
</>;

const GhnExportSummary = ({ totals, preview }: { totals: Totals; preview: ShippingTaskGhnPreview | null }) => <div className="shipping-create-financial">
  <div><span>Số đơn hàng</span><strong>{totals.orders}</strong></div>
  <div><span>Tổng kiện</span><strong>{preview?.package_count ?? totals.packages}</strong></div>
  <div><span>Tổng khối lượng</span><strong>{formatWeight(preview?.total_weight ?? totals.weight)}</strong></div>
  <div><span>Giá trị đã tất toán</span><strong>{formatSettledVnd(preview?.settled_value ?? totals.settledValue)}</strong></div>
  <div><span>Cước GHN đã thu</span><strong>{preview ? formatSettledVnd(preview.collected_fee) : "—"}</strong></div>
  <div><span>Cước GHN hiện tại</span><strong>{preview ? formatSettledVnd(preview.current_fee) : "—"}</strong></div>
  <div><span>Chênh lệch</span><strong>{preview ? formatSignedVnd(preview.fee_difference) : "—"}</strong></div>
  <div><span>COD</span><strong>0 đ</strong></div>
  <div><span>Trạng thái thanh toán</span><strong>Đã thanh toán</strong></div>
  <div><span>Trạng thái GHN</span><strong>{preview ? `Đã kiểm tra / ${preview.mode === "preview" ? "Preview" : preview.mode}` : "Chưa kiểm tra"}</strong></div>
</div>;
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
        <Tag color="blue">GHN Preview — Chưa tạo vận đơn GHN</Tag>
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
