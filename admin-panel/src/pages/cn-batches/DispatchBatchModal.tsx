import { useRef, useState } from "react";
import { Alert, Button, Checkbox, Col, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Row, Select, Space, Spin, Steps, Typography } from "antd";
import { SendOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import type { CnPackage } from "../../shared/types";
import { BatchFacts, BatchHeading, BatchPackageItems, BatchPackagesTable, BatchReviewAlerts } from "./BatchWorkspaceParts";
import type { BatchDispatchReview, BatchViewModel } from "./types";
import { useBatchWorkspace } from "./useBatchWorkspace";
import "./batch-workspace.css";

type Shipping = "fast" | "normal";
type Packaging = "bag" | "carton" | "cardboard" | "wood";

export type DispatchBatchInput = {
  reviewed_package_ids: string[];
  review_version: string;
  review_confirmed: boolean;
  destination_warehouse_id: string;
  shipping_type: Shipping;
  packaging_type: Packaging;
  transport_container_count: number;
  actual_batch_weight: number;
  package_material_weight: number;
  actual_length: number;
  actual_width: number;
  actual_height: number;
  carrier_name: string;
  transport_code?: string;
  route_name?: string;
  vehicle_plate?: string;
  driver_name?: string;
  driver_phone?: string;
  freight_cost?: number;
  departed_at: string;
  expected_arrival_at: string;
  dispatch_note?: string;
};

type Values = Pick<DispatchBatchInput, "destination_warehouse_id" | "shipping_type" | "packaging_type" | "transport_container_count"
  | "actual_batch_weight" | "package_material_weight" | "actual_length" | "actual_width" | "actual_height" | "carrier_name"
  | "transport_code" | "route_name" | "vehicle_plate" | "driver_name" | "driver_phone" | "freight_cost" | "dispatch_note"> & {
  departedAt: Dayjs; expectedArrivalAt: Dayjs; reviewedList: boolean; reviewedIssues: boolean; reviewedRoute: boolean;
};

type Props = { batch: BatchViewModel; loading?: boolean; onCancel: () => void; onSubmit: (input: DispatchBatchInput) => Promise<void> };
const toUtc = (value: Dayjs) => value.toISOString().slice(0, 19).replace("T", " ");
const packaging = [{ value: "bag", label: "Bao tải" }, { value: "carton", label: "Thùng carton" },
  { value: "cardboard", label: "Nẹp bìa" }, { value: "wood", label: "Đóng gỗ" }];
const shipping = [{ value: "normal", label: "Thường" }, { value: "fast", label: "Nhanh" }];
const packingNumbers = [
  { name: "transport_container_count", label: "Số bao/thùng vận chuyển", integer: true, min: 1 },
  { name: "actual_batch_weight", label: "Khối lượng lô thực tế (kg)", min: 0.01 },
  { name: "package_material_weight", label: "Khối lượng vật liệu đóng gói (kg)", min: 0 },
  { name: "actual_length", label: "Chiều dài (cm)", min: 0.01 },
  { name: "actual_width", label: "Chiều rộng (cm)", min: 0.01 },
  { name: "actual_height", label: "Chiều cao (cm)", min: 0.01 },
] as const;
const transportText = [
  { name: "carrier_name", label: "Đơn vị vận chuyển", required: true },
  { name: "transport_code", label: "Mã chuyến/mã vận chuyển" },
  { name: "route_name", label: "Tuyến/cửa khẩu" },
  { name: "vehicle_plate", label: "Biển số xe" },
  { name: "driver_name", label: "Tài xế/người nhận bàn giao" },
  { name: "driver_phone", label: "Số điện thoại" },
] as const;
const checks = [
  { name: "reviewedList", label: "Tôi đã kiểm tra danh sách kiện và mã vận đơn trong lô." },
  { name: "reviewedIssues", label: "Không còn kiện có ngoại lệ chưa xử lý." },
  { name: "reviewedRoute", label: "Thông tin kho nhận và vận chuyển đã chính xác." },
] as const;

export function DispatchBatchModal({ batch: summary, loading, onCancel, onSubmit }: Props) {
  const workspace = useBatchWorkspace(summary.id);
  if (workspace.batch && workspace.review) return <DispatchBatchWizard batch={workspace.batch} review={workspace.review}
    loading={loading} onCancel={onCancel} onSubmit={onSubmit} onReload={workspace.reload} />;
  return <Modal open centered width="min(94vw, 1120px)" rootClassName="cn-batch-workspace" onCancel={onCancel}
    title={<BatchHeading title={`Xuất kho Trung Quốc — ${summary.batchCode}`} code={summary.batchCode} dispatch />}
    footer={<Button onClick={onCancel}>Đóng</Button>}>
    {workspace.loading && <div className="cn-workspace-loading"><Spin /></div>}
    {workspace.error && <Alert showIcon type="error" message="Không thể tải dữ liệu rà soát lô."
      action={<Button onClick={workspace.reload} size="small">Tải lại</Button>} />}
  </Modal>;
}

function DispatchBatchWizard({ batch, review, loading, onCancel, onSubmit, onReload }: Props & {
  review: BatchDispatchReview; onReload: () => void;
}) {
  const [form] = Form.useForm<Values>();
  const [step, setStep] = useState(0);
  const [inspected, setInspected] = useState<CnPackage>();
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const destinationId = Form.useWatch("destination_warehouse_id", form);
  const carrier = Form.useWatch("carrier_name", form);
  const checkedList = Form.useWatch("reviewedList", form);
  const checkedIssues = Form.useWatch("reviewedIssues", form);
  const checkedRoute = Form.useWatch("reviewedRoute", form);
  const destination = review.destinations.find(({ id }) => id === destinationId);
  const installedDestination = review.destinations.find(({ id }) => id === batch.receivingWarehouseId);
  const blocked = review.issues.length > 0 || review.packages.some(({ issues }) => issues.length > 0);
  const reviewedAll = batch.packages.length > 0 && batch.packages.every(({ id }) => reviewed.includes(id));
  const canContinue = !blocked && reviewedAll && destination && checkedList && checkedIssues && checkedRoute;
  const inspectedReview = review.packages.find(({ id }) => id === inspected?.id);
  const close = () => { if (!lock.current && !loading) onCancel(); };
  const working = saving || Boolean(loading);

  const next = async () => {
    if (step === 0 && !canContinue) return;
    setError(undefined);
    try {
      if (step === 1) await form.validateFields(["packaging_type", ...packingNumbers.map(({ name }) => name)]);
      if (step === 2) {
        const values = await form.validateFields(["shipping_type", "carrier_name", "departedAt", "expectedArrivalAt"]);
        if (!values.expectedArrivalAt.isAfter(values.departedAt)) {
          form.setFields([{ name: "expectedArrivalAt", errors: ["Ngày đến dự kiến phải sau thời gian xuất kho."] }]);
          return;
        }
      }
      setStep((value) => Math.min(value + 1, 3));
    } catch {
      setError("Vui lòng kiểm tra các trường của bước này.");
    }
  };

  const submit = async () => {
    if (lock.current || working || !canContinue) return;
    lock.current = true;
    setSaving(true);
    setError(undefined);
    try {
      const { departedAt, expectedArrivalAt, reviewedList, reviewedIssues, reviewedRoute, ...values } = await form.validateFields();
      if (!reviewedList || !reviewedIssues || !reviewedRoute) return;
      await onSubmit({ ...values, carrier_name: values.carrier_name.trim(), package_material_weight: values.package_material_weight ?? 0, review_confirmed: true,
        reviewed_package_ids: reviewed, review_version: review.version, departed_at: toUtc(departedAt), expected_arrival_at: toUtc(expectedArrivalAt) });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Vui lòng kiểm tra dữ liệu trước khi xác nhận xuất.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  return <Modal open centered maskClosable={false} width="min(94vw, 1120px)" rootClassName="cn-batch-workspace"
    title={<BatchHeading title={`Xuất kho Trung Quốc — ${batch.batchCode}`} code={batch.batchCode} dispatch />} onCancel={close}
    footer={<div className="cn-workspace-footer">
      <Button disabled={working} onClick={close}>Hủy</Button>
      <Space wrap>{step > 0 && <Button disabled={working} onClick={() => { setError(undefined); setStep(step - 1); }}>Quay lại</Button>}
        {step < 3 ? <Button type="primary" icon={<SendOutlined />} disabled={step === 0 && !canContinue} onClick={() => void next()}>Tiếp tục</Button>
          : <Button type="primary" icon={<SendOutlined />} loading={working} onClick={() => void submit()}>Xác nhận bàn giao và xuất kho</Button>}
      </Space>
    </div>}>
    <Form<Values> form={form} name="cnDispatch" layout="vertical" disabled={working} className="cn-workspace-step-fields"
      initialValues={{ destination_warehouse_id: installedDestination?.id, shipping_type: batch.shippingType, packaging_type: batch.packagingType ?? "bag",
        transport_container_count: batch.transportContainerCount ?? 1, actual_batch_weight: batch.actualBatchWeight,
        package_material_weight: batch.packageMaterialWeight ?? 0, departedAt: dayjs(),
        expectedArrivalAt: dayjs().add(batch.shippingType === "fast" ? 3 : 7, "day") }}>
      <div className="cn-workspace-stack" style={{ marginBottom: 14 }}>
        <Steps current={step} size="small" items={["Kiểm tra lô", "Đóng gói", "Vận chuyển", "Bàn giao"].map((title) => ({ title }))} />
        <BatchFacts batch={batch} />
        {error && <Alert showIcon type="error" message={error} action={<Button size="small" disabled={working} onClick={onReload}>Tải lại lô</Button>} />}
      </div>
      <div className={step === 0 ? "cn-workspace-stack" : undefined} hidden={step !== 0}>
        <Typography.Title level={4}>Kiểm tra trước khi xuất kho</Typography.Title>
        <BatchReviewAlerts review={review} />
        <Alert type={reviewedAll ? "info" : "warning"} showIcon message={<>
          <strong>Đã xác nhận rà soát lô: {reviewed.length}/{batch.packages.length} kiện.</strong>{" "}
          {!reviewedAll && <span>Mở chi tiết từng kiện để rà soát kết quả kiểm item đã lưu.</span>}
        </>} />
        <BatchPackagesTable packages={batch.packages} review={review} onView={setInspected} reviewed={reviewed} />
        {inspected && <BatchPackageItems pkg={inspected} warnings={inspectedReview?.warnings ?? []} onClose={() => setInspected(undefined)}
          onReview={inspectedReview?.issues.length === 0 ? () => {
            setReviewed((ids) => ids.includes(inspected.id) ? ids : [...ids, inspected.id]);
            setInspected(undefined);
          } : undefined} />}
        <Form.Item label="Kho nhận Việt Nam" name="destination_warehouse_id" rules={[{ required: true, message: "Vui lòng chọn kho nhận." }]}
          extra={!installedDestination ? "Chọn kho đang hoạt động để dùng khi xác nhận xuất." : undefined}>
          <Select showSearch optionFilterProp="label" placeholder="Chọn kho nhận đang hoạt động" notFoundContent="Không có kho nhận đang hoạt động"
            onChange={() => form.setFieldValue("reviewedRoute", false)}
            options={review.destinations.map(({ id, code, name }) => ({ value: id, label: `${code} — ${name}` }))} />
        </Form.Item>
        <div className="cn-workspace-checks">
          {checks.map(({ name, label }) => <Form.Item key={name} name={name} valuePropName="checked">
            <Checkbox disabled={blocked}>{label}</Checkbox>
          </Form.Item>)}
        </div>
        <Alert type="info" showIcon message="Tiếp tục để nhập số liệu đóng gói. Lô vẫn ở trạng thái chờ xuất." />
      </div>
      <section className={step === 1 ? "cn-workspace-panel cn-workspace-stack" : undefined} hidden={step !== 1}>
        <Typography.Title level={4}>Đóng gói và cân nặng</Typography.Title>
        <Row gutter={16}>
          <Col xs={24} sm={12}><Form.Item label="Hình thức đóng gói" name="packaging_type" rules={[{ required: true }]}>
            <Select options={packaging} />
          </Form.Item></Col>
          {packingNumbers.map(({ name, label, min, ...field }) => <Col key={name} xs={24} sm={12}>
            <Form.Item name={name} label={label} rules={[{ required: min > 0, type: "number", min }]}>
              <InputNumber min={min === 0 ? 0 : undefined} precision={"integer" in field ? 0 : 2} style={{ width: "100%" }} />
            </Form.Item>
          </Col>)}
        </Row>
      </section>
      <section className={step === 2 ? "cn-workspace-panel cn-workspace-stack" : undefined} hidden={step !== 2}>
        <Typography.Title level={4}>Thông tin vận chuyển</Typography.Title>
        <Row gutter={16}>
          <Col xs={24} md={8}><Form.Item label="Kho nhận tại Việt Nam"><Input value={destination?.name} readOnly /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item label="Hình thức vận chuyển" name="shipping_type" rules={[{ required: true }]}><Select options={shipping} /></Form.Item></Col>
          {transportText.map(({ name, label, ...field }) => <Col key={name} xs={24} md={8}>
            <Form.Item name={name} label={label} rules={"required" in field ? [{ required: true, whitespace: true }] : undefined}><Input /></Form.Item>
          </Col>)}
          <Col xs={24} md={8}><Form.Item label="Chi phí vận chuyển (RMB)" name="freight_cost"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item label="Thời gian xuất kho" name="departedAt" rules={[{ required: true }]}>
            <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
          </Form.Item></Col>
          <Col xs={24} md={12}><Form.Item label="Ngày đến dự kiến" name="expectedArrivalAt" rules={[{ required: true }]}>
            <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
          </Form.Item></Col>
        </Row>
      </section>
      <section className={step === 3 ? "cn-workspace-panel cn-workspace-stack" : undefined} hidden={step !== 3}>
        <Typography.Title level={4}>Xác nhận bàn giao</Typography.Title>
        <Alert type="warning" showIcon message="Xác nhận bàn giao sẽ khóa danh sách kiện và chuyển lô sang Đang vận chuyển." />
        <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Mã lô">{batch.batchCode}</Descriptions.Item>
          <Descriptions.Item label="Đã rà soát">{reviewed.length}/{batch.packages.length} kiện</Descriptions.Item>
          <Descriptions.Item label="Kho nhận">{destination?.name}</Descriptions.Item>
          <Descriptions.Item label="Đơn vị vận chuyển">{carrier}</Descriptions.Item>
        </Descriptions>
        <Form.Item label="Ghi chú bàn giao" name="dispatch_note"><Input.TextArea rows={3} /></Form.Item>
      </section>
    </Form>
  </Modal>;
}
