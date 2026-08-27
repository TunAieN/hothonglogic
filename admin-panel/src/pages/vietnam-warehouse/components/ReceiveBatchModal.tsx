import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Col, Descriptions, Form, Image, Input, InputNumber, Modal, Popconfirm, Progress, Row, Select, Space, Statistic, Table, Tag, Typography, message } from "antd";
import { CameraOutlined, CheckCircleOutlined, CloseOutlined, DeleteOutlined, OrderedListOutlined, ScanOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import type { ExpectedBatchPackage, PackageEvidence, PackageItemDetail, ReceivePackageFormValues, ReceivedPackageDraft, VietnamWarehouseBatch, VietnamWarehouseReceiptSummary } from "../types";
import { PackageEvidenceUpload } from "./PackageEvidenceUpload";
import { MEDIA_IMAGE_FALLBACK } from "../../../shared/utils/mediaUrl";

const { Text, Title } = Typography;
type Props = {
  open: boolean; batch: VietnamWarehouseBatch; expectedPackages: ExpectedBatchPackage[];
  receivedPackages: ReceivedPackageDraft[]; summary: VietnamWarehouseReceiptSummary; loading?: boolean;
  onCancel: () => void; onRefresh: () => Promise<void> | void; onAddPackage: (values: ReceivePackageFormValues, evidenceFiles: File[]) => Promise<void>;
  onRemovePackage: (record: ReceivedPackageDraft) => Promise<void>; onInspectItems: (record: ReceivedPackageDraft, items: PackageItemDetail[]) => Promise<void>;
  onAddEvidence: (record: ReceivedPackageDraft, files: File[]) => Promise<void>;
  onDeleteEvidence: (record: ReceivedPackageDraft, evidence: PackageEvidence) => Promise<void>;
  onResolveBatchDiscrepancy: (resolutionNote: string) => Promise<void>;
  onResolvePackageDiscrepancy: (record: ReceivedPackageDraft, resolutionNote: string) => Promise<void>;
  onMoveToErrorQueue: () => Promise<void>;
  onConfirm: () => Promise<void>;
};
const conditionOptions = [
  { label: "Nguyên vẹn", value: "normal" }, { label: "Móp méo", value: "dented" }, { label: "Rách", value: "torn" },
  { label: "Ướt", value: "wet" }, { label: "Vỡ/hỏng", value: "broken" }, { label: "Đã mở", value: "opened" }, { label: "Khác", value: "other" },
];
const conditionLabel: Record<string, string> = { normal: "Nguyên vẹn", dented: "Móp", torn: "Rách", wet: "Ướt", broken: "Vỡ/hỏng", opened: "Đã mở", other: "Khác" };
const evidenceRules = { requiredPhysicalConditions: new Set<string>() };

const statusTag = (record: ReceivedPackageDraft) => {
  if (record.status === "missing") return <Tag color="orange">Chưa quét</Tag>;
  if (record.status === "extra") return <Tag color="red">Ngoài lô</Tag>;
  if (record.status === "damaged") return <Tag color="volcano">Hư hỏng</Tag>;
  if (record.status === "mismatched") return <Tag color="gold">Sai lệch</Tag>;
  if (record.requiresItemInspection) return <Tag color="purple">Chờ kiểm item</Tag>;
  return <Tag color="green">Đã khớp</Tag>;
};

export const ReceiveBatchModal = ({ open, batch, expectedPackages, receivedPackages, summary, loading, onCancel, onRefresh, onAddPackage, onRemovePackage, onInspectItems, onAddEvidence, onDeleteEvidence, onResolveBatchDiscrepancy, onResolvePackageDiscrepancy, onMoveToErrorQueue, onConfirm }: Props) => {
  const [form] = Form.useForm<ReceivePackageFormValues>();
  const [itemForm] = Form.useForm<{ items: PackageItemDetail[] }>();
  const [inspectionRecord, setInspectionRecord] = useState<ReceivedPackageDraft | null>(null);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [packageResolutionRecord, setPackageResolutionRecord] = useState<ReceivedPackageDraft | null>(null);
  const [packageResolutionNote, setPackageResolutionNote] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<UploadFile[]>([]);
  const [evidenceRecord, setEvidenceRecord] = useState<ReceivedPackageDraft | null>(null);
  const [additionalEvidenceFiles, setAdditionalEvidenceFiles] = useState<UploadFile[]>([]);
  const trackingCode = Form.useWatch("trackingCode", form)?.trim().toUpperCase() ?? "";
  const physicalCondition = Form.useWatch("physicalCondition", form) ?? "normal";
  const requiresItemInspection = Form.useWatch("requiresItemInspection", form);
  const actualWeight = Form.useWatch("weight", form);
  const matchedExpected = useMemo(() => expectedPackages.find((item) => item.trackingCode.toUpperCase() === trackingCode), [expectedPackages, trackingCode]);
  const scannedCodes = useMemo(() => new Set(receivedPackages.map((item) => item.trackingCode.toUpperCase())), [receivedPackages]);
  const progress = summary.expectedCount ? Math.min(100, Math.round((summary.receivedCount / summary.expectedCount) * 100)) : 0;
  const weightTolerance = matchedExpected?.cnWeight ? Math.max(0.5, matchedExpected.cnWeight * 0.02) : Number.POSITIVE_INFINITY;
  const hasWeightMismatch = Boolean(matchedExpected && actualWeight && Math.abs(actualWeight - matchedExpected.cnWeight) > weightTolerance);
  const showEvidence = physicalCondition !== "normal" || Boolean(requiresItemInspection) || hasWeightMismatch;

  useEffect(() => {
    if (open) form.setFieldsValue({ trackingCode: "", weight: undefined, length: undefined, width: undefined, height: undefined, physicalCondition: "normal", requiresItemInspection: false, exceptionReason: "", note: "" });
  }, [form, open]);

  useEffect(() => {
    if (!matchedExpected) return;
    form.setFieldsValue({
      weight: matchedExpected.cnWeight || undefined,
      length: matchedExpected.length || undefined,
      width: matchedExpected.width || undefined,
      height: matchedExpected.height || undefined,
    });
  }, [form, matchedExpected]);

  const activeEvidenceRecord = evidenceRecord?.receiptPackageId
    ? receivedPackages.find((record) => record.receiptPackageId === evidenceRecord.receiptPackageId) ?? evidenceRecord
    : evidenceRecord;

  const missingRows = useMemo<ReceivedPackageDraft[]>(() => expectedPackages.filter((item) => !scannedCodes.has(item.trackingCode.toUpperCase())).map((item) => ({
    id: `missing-${item.id}`, trackingCode: item.trackingCode, orderCode: item.orderCode, customerName: item.customerName,
    volumetricWeight: 0, status: "missing", weight: 0, cnWeight: item.cnWeight, weightDifference: 0,
    length: item.length, width: item.width, height: item.height, physicalCondition: "normal", requiresItemInspection: false,
    itemInspectionStatus: "not_required", items: item.items, evidences: [],
  })), [expectedPackages, scannedCodes]);
  const tableData = [...receivedPackages, ...missingRows];

  const handleScan = async () => {
    const values = await form.validateFields();
    if (evidenceRules.requiredPhysicalConditions.has(values.physicalCondition) && evidenceFiles.length === 0) {
      message.error("Vui lòng thêm ít nhất 1 ảnh minh chứng.");
      return;
    }
    const files = evidenceFiles.map((file) => file.originFileObj).filter((file): file is NonNullable<typeof file> => Boolean(file));
    await onAddPackage({ ...values, trackingCode: values.trackingCode.trim().toUpperCase() }, files);
    form.resetFields();
    form.setFieldsValue({ physicalCondition: "normal", requiresItemInspection: false });
    setEvidenceFiles([]);
    message.success(matchedExpected ? "Đã quét và đối chiếu kiện trong lô." : "Đã ghi nhận kiện ngoài lô để xử lý.");
  };

  const openItemInspection = (record: ReceivedPackageDraft) => {
    setInspectionRecord(record);
    itemForm.setFieldsValue({ items: record.items.map((item) => ({ ...item, receivedQuantity: item.receivedQuantity ?? item.expectedQuantity, conditionStatus: item.conditionStatus ?? "normal" })) });
  };

  const submitItemInspection = async () => {
    if (!inspectionRecord) return;
    const values = await itemForm.validateFields();
    await onInspectItems(inspectionRecord, values.items);
    setInspectionRecord(null);
    message.success("Đã lưu kết quả kiểm chi tiết item.");
  };

  const saveAdditionalEvidence = async () => {
    if (!activeEvidenceRecord) return;
    const files = additionalEvidenceFiles.map((file) => file.originFileObj).filter((file): file is NonNullable<typeof file> => Boolean(file));
    if (files.length) await onAddEvidence(activeEvidenceRecord, files);
    setAdditionalEvidenceFiles([]);
    setEvidenceRecord(null);
    message.success("Đã cập nhật ảnh minh chứng.");
  };

  const columns: ColumnsType<ReceivedPackageDraft> = [
    { title: "Mã vận đơn", dataIndex: "trackingCode", width: 165, fixed: "left", render: (value, record) => <Space orientation="vertical" size={0}><Text strong>{value}</Text><Text type="secondary" style={{ fontSize: 12 }}>{record.orderCode}</Text></Space> },
    { title: "Khách hàng", dataIndex: "customerName", width: 150 },
    { title: "KL kho TQ", dataIndex: "cnWeight", width: 100, align: "right", render: (value) => `${Number(value).toFixed(2)} kg` },
    { title: "KL kho VN", dataIndex: "weight", width: 100, align: "right", render: (value, record) => record.status === "missing" ? "—" : `${Number(value).toFixed(2)} kg` },
    { title: "Chênh lệch", dataIndex: "weightDifference", width: 100, align: "right", render: (value, record) => record.status === "missing" ? "—" : <Text type={Math.abs(Number(value)) > 0.5 ? "danger" : undefined}>{Number(value) > 0 ? "+" : ""}{Number(value).toFixed(2)} kg</Text> },
    { title: "Tình trạng ngoài", dataIndex: "physicalCondition", width: 125, render: (value) => conditionLabel[value] ?? value },
    { title: "Kiểm item", width: 115, render: (_, record) => record.items.length ? <Button size="small" icon={<OrderedListOutlined />} disabled={record.status === "missing" || !record.receiptPackageId} onClick={() => openItemInspection(record)}>{record.itemInspectionStatus === "completed" ? "Xem/Sửa" : "Kiểm item"}</Button> : <Text type="secondary">Chưa có item</Text> },
    { title: "Đối soát", width: 140, render: (_, record) => <Space orientation="vertical" size={4}>{statusTag(record)}{record.status !== "missing" ? <Button size="small" type="text" icon={<CameraOutlined />} onClick={() => { setEvidenceRecord(record); setAdditionalEvidenceFiles([]); }}>Ảnh {record.evidences.length ? `(${record.evidences.length})` : ""}</Button> : null}{["mismatched", "damaged"].includes(record.status) && !record.requiresItemInspection ? <Button size="small" type="link" onClick={() => setPackageResolutionRecord(record)}>Ghi nhận xử lý</Button> : null}</Space> },
    { title: "", width: 55, fixed: "right", render: (_, record) => <Popconfirm title="Xóa lượt quét kiện này?" onConfirm={() => onRemovePackage(record)} disabled={record.status === "missing"}><Button type="text" danger icon={<DeleteOutlined />} disabled={record.status === "missing" || !record.receiptPackageId} /></Popconfirm> },
  ];

  const hasIssues = summary.hasIssues;
  const closeReceiveModal = () => { setEvidenceFiles([]); setEvidenceRecord(null); setAdditionalEvidenceFiles([]); onCancel(); };
  return (
    <>
      <Modal
        title={<Space orientation="vertical" size={0}><span>Đối soát lô {batch.batchCode}</span><Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>Bước 2/2 · Quét từng kiện và kiểm item khi có bất thường</Text></Space>}
        open={open} onCancel={closeReceiveModal} width={1380} destroyOnClose
        footer={<Space><Button icon={<CloseOutlined />} onClick={closeReceiveModal}>Đóng</Button><Button loading={loading} onClick={() => void onRefresh()}>Làm mới</Button>{summary.errorCount > 0 ? <Button danger loading={loading} onClick={() => void onMoveToErrorQueue()}>Chuyển {summary.errorCount} kiện sang xử lý lỗi</Button> : null}<Button type="primary" icon={<CheckCircleOutlined />} disabled={summary.receivableCount === 0 || summary.batchResolutionPending} loading={loading} onClick={() => void onConfirm()}>Xác nhận {summary.receivableCount} kiện hợp lệ</Button></Space>}
      >
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Card size="small">
            <Row gutter={[16, 12]} align="middle">
              <Col xs={24} lg={7}><Text strong>Tiến độ quét kiện</Text><Progress percent={progress} status={hasIssues ? "exception" : "active"} format={() => `${summary.receivedCount}/${summary.expectedCount} kiện`} /></Col>
              <Col xs={12} sm={6} lg={3}><Statistic title="Thiếu" value={summary.missingCount} valueStyle={{ fontSize: 21, color: summary.missingCount ? "#d48806" : undefined }} /></Col>
              <Col xs={12} sm={6} lg={3}><Statistic title="Ngoài lô" value={summary.extraCount} valueStyle={{ fontSize: 21, color: summary.extraCount ? "#cf1322" : undefined }} /></Col>
              <Col xs={12} sm={6} lg={3}><Statistic title="Hư hỏng" value={summary.damagedCount} valueStyle={{ fontSize: 21, color: summary.damagedCount ? "#cf1322" : undefined }} /></Col>
              <Col xs={12} sm={6} lg={3}><Statistic title="Sai lệch" value={summary.mismatchCount} valueStyle={{ fontSize: 21, color: summary.mismatchCount ? "#d48806" : undefined }} /></Col>
              <Col xs={12} sm={6} lg={3}><Statistic title="Chờ kiểm item" value={summary.itemInspectionPendingCount} valueStyle={{ fontSize: 21, color: summary.itemInspectionPendingCount ? "#722ed1" : undefined }} /></Col>
            </Row>
          </Card>

          {summary.batchWeightMismatch || summary.containerMismatch ? <Alert type={summary.batchResolutionPending ? "warning" : "success"} showIcon message={summary.batchResolutionPending ? "Lô có chênh lệch ở bước tiếp nhận" : "Chênh lệch lô đã được xử lý"} description={<Space><span>{summary.batchWeightMismatch ? "Khối lượng lô không khớp. " : ""}{summary.containerMismatch ? "Số bao/thùng không khớp. " : ""}</span>{summary.batchResolutionPending ? <Button size="small" type="primary" ghost onClick={() => setResolutionOpen(true)}>Ghi nhận kết quả xử lý</Button> : null}</Space>} /> : null}

          <Card size="small" title={<Space><ScanOutlined /> Quét mã vận đơn</Space>}>
            <Form<ReceivePackageFormValues> form={form} layout="vertical">
              <Row gutter={[12, 0]}>
                <Col xs={24} lg={8}><Form.Item label="Mã vận đơn" name="trackingCode" rules={[{ required: true, message: "Quét hoặc nhập mã vận đơn." }]}><Input autoFocus size="large" placeholder="Quét barcode / nhập mã rồi Enter" onPressEnter={() => void handleScan()} /></Form.Item></Col>
                <Col xs={12} sm={6} lg={4}><Form.Item label="Khối lượng VN" name="weight" rules={[{ required: true, message: "Nhập khối lượng." }]}><InputNumber min={0.01} precision={2} addonAfter="kg" style={{ width: "100%" }} /></Form.Item></Col>
                <Col xs={12} sm={6} lg={4}><Form.Item label="Dài" name="length" rules={[{ required: true }]}><InputNumber min={0.01} addonAfter="cm" style={{ width: "100%" }} /></Form.Item></Col>
                <Col xs={12} sm={6} lg={4}><Form.Item label="Rộng" name="width" rules={[{ required: true }]}><InputNumber min={0.01} addonAfter="cm" style={{ width: "100%" }} /></Form.Item></Col>
                <Col xs={12} sm={6} lg={4}><Form.Item label="Cao" name="height" rules={[{ required: true }]}><InputNumber min={0.01} addonAfter="cm" style={{ width: "100%" }} /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item label="Tình trạng bên ngoài" name="physicalCondition" rules={[{ required: true }]}><Select options={conditionOptions} /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item label="Kiểm chi tiết item" name="requiresItemInspection" valuePropName="checked"><Checkbox>Bắt buộc kiểm item trong kiện</Checkbox></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item label="Lý do bất thường" name="exceptionReason" rules={[{ validator: (_, value) => (physicalCondition !== "normal" || requiresItemInspection) && !String(value ?? "").trim() ? Promise.reject(new Error("Nhập lý do cần kiểm.")) : Promise.resolve() }]}><Input placeholder="Móp, lệch cân, nghi thiếu..." /></Form.Item></Col>
                {showEvidence ? <Col span={24}><Form.Item label="Ảnh minh chứng" extra="JPG, PNG hoặc WEBP · tối đa 5 ảnh · 5 MB/ảnh"><PackageEvidenceUpload files={evidenceFiles} onChange={setEvidenceFiles} disabled={loading} /></Form.Item></Col> : null}
                <Col xs={24} lg={19}><Form.Item label="Ghi chú kho VN" name="note" style={{ marginBottom: 0 }}><Input placeholder="Ghi chú bổ sung" /></Form.Item></Col>
                <Col xs={24} lg={5} style={{ display: "flex", alignItems: "end" }}><Button type="primary" block size="large" icon={<ScanOutlined />} loading={loading} onClick={() => void handleScan()}>Ghi nhận kiện</Button></Col>
              </Row>
            </Form>
            {trackingCode ? <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: matchedExpected ? "#f6ffed" : "#fff2f0" }}>
              {matchedExpected ? <Descriptions size="small" column={4}><Descriptions.Item label="Kết quả"><Tag color="green">Có trong lô TQ</Tag></Descriptions.Item><Descriptions.Item label="Đơn hàng">{matchedExpected.orderCode}</Descriptions.Item><Descriptions.Item label="Khách hàng">{matchedExpected.customerName}</Descriptions.Item><Descriptions.Item label="Item">{matchedExpected.items.length} dòng / {matchedExpected.items.reduce((sum, item) => sum + item.expectedQuantity, 0)} sản phẩm</Descriptions.Item></Descriptions> : <Text type="danger">Mã này không thuộc lô {batch.batchCode}; nếu ghi nhận sẽ được đánh dấu “ngoài lô”.</Text>}
            </div> : null}
          </Card>

          {summary.receivableCount > 0 ? <Alert type="success" showIcon message={`Có ${summary.receivableCount} kiện hợp lệ có thể nhập kho`} description={summary.errorCount ? `${summary.errorCount} kiện lỗi sẽ được giữ lại ở Chờ xử lý lỗi.` : "Tất cả kiện đã đối soát đều hợp lệ."} /> : <Alert type="info" showIcon message="Không có kiện hợp lệ mới để xác nhận" description="Các kiện lỗi vẫn được xử lý độc lập và không ảnh hưởng kiện đã nhập kho." />}

          <div><Title level={5}>Danh sách đối soát kiện</Title><Table rowKey="id" columns={columns} dataSource={tableData} pagination={false} scroll={{ x: 1220, y: 360 }} size="small" loading={loading} /></div>
        </Space>
      </Modal>
      <Modal title={`Ảnh minh chứng · ${activeEvidenceRecord?.trackingCode ?? ""}`} open={Boolean(activeEvidenceRecord)} onCancel={() => { setEvidenceRecord(null); setAdditionalEvidenceFiles([]); }} okText="Lưu ảnh" cancelText="Đóng" confirmLoading={loading} okButtonProps={{ disabled: additionalEvidenceFiles.length === 0 }} onOk={() => void saveAdditionalEvidence()}>
        {activeEvidenceRecord?.evidences.length ? <Image.PreviewGroup><Space wrap size={12} style={{ marginBottom: 16 }}>{activeEvidenceRecord.evidences.map((evidence) => <div key={evidence.id} style={{ position: "relative" }}><Image src={evidence.thumbnailUrl || evidence.url} fallback={MEDIA_IMAGE_FALLBACK} preview={{ src: evidence.url }} width={96} height={82} style={{ objectFit: "cover", borderRadius: 6 }} /><Popconfirm title="Xóa ảnh minh chứng này?" onConfirm={() => void onDeleteEvidence(activeEvidenceRecord, evidence)}><Button danger size="small" shape="circle" icon={<DeleteOutlined />} style={{ position: "absolute", right: -7, top: -7 }} /></Popconfirm></div>)}</Space></Image.PreviewGroup> : <Text type="secondary">Chưa có ảnh minh chứng.</Text>}
        <div style={{ marginTop: 12 }}><PackageEvidenceUpload files={additionalEvidenceFiles} onChange={setAdditionalEvidenceFiles} existingCount={activeEvidenceRecord?.evidences.length ?? 0} disabled={loading} /></div>
      </Modal>

      <Modal title={`Kiểm chi tiết item · ${inspectionRecord?.trackingCode ?? ""}`} open={Boolean(inspectionRecord)} onCancel={() => setInspectionRecord(null)} width={900} footer={<Space><Button onClick={() => setInspectionRecord(null)}>Hủy</Button><Button type="primary" loading={loading} onClick={() => void submitItemInspection()}>Lưu kết quả kiểm</Button></Space>}>
        <Alert type="info" showIcon message="Đối chiếu từng item theo danh sách kho Trung Quốc" description="Nhân viên phải nhập số lượng thực nhận và tình trạng cho tất cả item. Hệ thống tự phát hiện thiếu/thừa hoặc hư hỏng." style={{ marginBottom: 16 }} />
        <Form form={itemForm} component={false}>
          <Form.List name="items">{(fields) => <Table pagination={false} rowKey="key" dataSource={fields} columns={[
            { title: "Sản phẩm", width: 260, render: (_, field) => <><Form.Item noStyle name={[field.name, "productName"]}><Input variant="borderless" readOnly /></Form.Item><Form.Item noStyle name={[field.name, "orderItemId"]}><Input type="hidden" /></Form.Item></> },
            { title: "Phân loại", width: 130, render: (_, field) => <Form.Item noStyle name={[field.name, "variant"]}><Input variant="borderless" readOnly /></Form.Item> },
            { title: "SL dự kiến", width: 100, render: (_, field) => <Form.Item noStyle name={[field.name, "expectedQuantity"]}><InputNumber variant="borderless" readOnly /></Form.Item> },
            { title: "SL thực nhận", width: 120, render: (_, field) => <Form.Item name={[field.name, "receivedQuantity"]} rules={[{ required: true }]} style={{ margin: 0 }}><InputNumber min={0} precision={0} /></Form.Item> },
            { title: "Tình trạng", width: 150, render: (_, field) => <Form.Item name={[field.name, "conditionStatus"]} rules={[{ required: true }]} style={{ margin: 0 }}><Select options={conditionOptions} /></Form.Item> },
            { title: "Ghi chú", render: (_, field) => <Form.Item name={[field.name, "note"]} style={{ margin: 0 }}><Input /></Form.Item> },
          ]} />}</Form.List>
        </Form>
      </Modal>
      <Modal title="Ghi nhận xử lý chênh lệch lô" open={resolutionOpen} onCancel={() => setResolutionOpen(false)} okText="Xác nhận đã xử lý" cancelText="Hủy" confirmLoading={loading} okButtonProps={{ disabled: !resolutionNote.trim() }} onOk={() => void onResolveBatchDiscrepancy(resolutionNote).then(() => { setResolutionOpen(false); setResolutionNote(""); message.success("Đã ghi nhận kết quả xử lý chênh lệch lô."); })}>
        <Alert type="warning" showIcon message="Thao tác này xác nhận nhân viên đã kiểm tra chứng từ/biên bản và chấp nhận kết quả thực nhận." style={{ marginBottom: 16 }} />
        <Input.TextArea rows={4} maxLength={500} showCount value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Nêu nguyên nhân chênh lệch và cách xử lý..." />
      </Modal>
      <Modal title={`Xử lý sai lệch kiện · ${packageResolutionRecord?.trackingCode ?? ""}`} open={Boolean(packageResolutionRecord)} onCancel={() => setPackageResolutionRecord(null)} okText="Xác nhận đã xử lý" cancelText="Hủy" confirmLoading={loading} okButtonProps={{ disabled: !packageResolutionNote.trim() }} onOk={() => packageResolutionRecord && void onResolvePackageDiscrepancy(packageResolutionRecord, packageResolutionNote).then(() => { setPackageResolutionRecord(null); setPackageResolutionNote(""); message.success("Đã ghi nhận xử lý sai lệch kiện."); })}>
        <Alert type="warning" showIcon message="Chỉ xác nhận sau khi đã cân/kiểm tra thực tế hoặc có biên bản xử lý." style={{ marginBottom: 16 }} />
        <Input.TextArea rows={4} maxLength={500} showCount value={packageResolutionNote} onChange={(event) => setPackageResolutionNote(event.target.value)} placeholder="Nguyên nhân sai lệch và kết quả xử lý..." />
      </Modal>
    </>
  );
};
