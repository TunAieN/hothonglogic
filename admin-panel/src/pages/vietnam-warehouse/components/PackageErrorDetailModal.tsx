import { useState } from "react";
import { Alert, Button, Card, Col, DatePicker, Empty, Form, Image, Input, Modal, Popconfirm, Row, Select, Skeleton, Space, Table, Tag, Timeline, Tooltip, Typography } from "antd";
import { ArrowRightOutlined, CalendarOutlined, ExclamationCircleFilled, LinkOutlined, UserOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import type { UploadFile } from "antd/es/upload/interface";
import type { VietnamPackageErrorUpdateInput, VietnamWarehousePackageListItem } from "../types";
import { PackageEvidenceUpload } from "./PackageEvidenceUpload";
import { MEDIA_IMAGE_FALLBACK } from "../../../utils/mediaUrl";
import "./package-error-detail-modal.css";

const { Text, Title } = Typography;
const conditionLabels: Record<string, string> = { normal: "Nguyên vẹn", dented: "Móp", torn: "Rách", wet: "Ướt", broken: "Vỡ/hỏng", opened: "Đã mở", other: "Khác" };
const statusMeta: Record<string, { label: string; color: string }> = {
  pending: { label: "Chờ xử lý lỗi", color: "orange" }, verifying: { label: "Chờ xác minh", color: "orange" },
  processing: { label: "Đang xử lý", color: "blue" }, resolved: { label: "Hoàn tất", color: "green" }, rejected: { label: "Từ chối", color: "red" },
};
const formatDateTime = (value?: string) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—";
const formatWeight = (value: number) => `${value.toFixed(2)} kg`;

type UpdateForm = { resolutionStatus: VietnamPackageErrorUpdateInput["resolutionStatus"]; resolutionAction?: string; resolutionResult?: string; expectedCompletionAt?: Dayjs; note?: string };
type Props = {
  open: boolean; loading?: boolean; error?: string; item: VietnamWarehousePackageListItem | null;
  onClose: () => void; onRetry: () => void; onOpenBatch?: (batchCode: string) => void;
  onUpdate: (input: VietnamPackageErrorUpdateInput) => Promise<void>; onComplete: (note: string) => Promise<void>;
  onAddEvidence: (files: File[]) => Promise<void>;
};

const SectionTitle = ({ index, children }: { index?: number; children: string }) => <div className="package-error-detail__section-title">{index ? <span>{index}. </span> : null}{children}</div>;
const InfoLine = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="package-error-detail__info-line"><Text type="secondary">{label}</Text><div>{children}</div></div>;

export const PackageErrorDetailModal = ({ open, loading, error, item, onClose, onRetry, onOpenBatch, onUpdate, onComplete, onAddEvidence }: Props) => {
  const [updateOpen, setUpdateOpen] = useState(false);
  const [evidenceFiles, setEvidenceFiles] = useState<UploadFile[]>([]);
  const [form] = Form.useForm<UpdateForm>();

  const openUpdate = () => {
    if (!item) return;
    form.setFieldsValue({
      resolutionStatus: (item.errorResolutionStatus as UpdateForm["resolutionStatus"]) || "pending",
      resolutionAction: item.resolutionAction, resolutionResult: item.resolutionResult,
      expectedCompletionAt: item.expectedCompletionAt ? dayjs(item.expectedCompletionAt) : undefined, note: item.resolutionNote,
    });
    setUpdateOpen(true);
  };
  const submitUpdate = async () => {
    const values = await form.validateFields();
    await onUpdate({ ...values, expectedCompletionAt: values.expectedCompletionAt?.format("YYYY-MM-DD HH:mm:ss") });
    setUpdateOpen(false);
  };
  const canComplete = Boolean(item && !item.requiresItemInspection && item.itemInspectionStatus !== "pending" && (item.resolutionResult?.trim() || item.resolutionNote?.trim()));
  const complete = async () => { if (item) await onComplete(item.resolutionResult || item.resolutionNote || "Đã xác nhận hoàn tất xử lý lỗi."); };
  const addEvidence = async () => {
    const files = evidenceFiles.map((file) => file.originFileObj).filter((file): file is NonNullable<typeof file> => Boolean(file));
    if (!files.length) return;
    await onAddEvidence(files);
    setEvidenceFiles([]);
  };
  const currentStatus = statusMeta[item?.errorResolutionStatus || "pending"] ?? statusMeta.pending;
  const inspectedItems = item?.items.filter((entry) => entry.receivedQuantity !== undefined) ?? [];
  const itemHasError = inspectedItems.some((entry) => entry.receivedQuantity !== entry.expectedQuantity || entry.conditionStatus !== "normal");

  return <>
    <Modal className="package-error-detail" wrapClassName="package-error-detail-wrap" title="Chi tiết mã vận đơn chờ xử lý lỗi" open={open} onCancel={onClose} centered width="82vw" style={{ maxWidth: 1450, paddingBottom: 0 }} destroyOnClose
      styles={{ body: { overflowY: "auto", padding: 20 } }}
      footer={<Space><Button onClick={onClose}>Đóng</Button><Button type="primary" ghost onClick={openUpdate} disabled={!item || Boolean(error)}>Cập nhật xử lý</Button><Popconfirm title="Xác nhận hoàn tất xử lý lỗi?" description={'Sau khi hoàn tất, mã vận đơn sẽ được chuyển khỏi danh sách "Chờ xử lý lỗi".'} okText="Xác nhận hoàn tất" cancelText="Hủy" onConfirm={() => void complete()}><Button danger type="primary" disabled={!canComplete} loading={loading}>Xác nhận hoàn tất</Button></Popconfirm></Space>}>
      {loading ? <Row gutter={[16, 16]}>{Array.from({ length: 6 }).map((_, index) => <Col xs={24} lg={index < 3 ? 8 : 12} key={index}><Card><Skeleton active paragraph={{ rows: 4 }} /></Card></Col>)}</Row> : null}
      {!loading && error ? <Alert type="error" showIcon message="Không thể tải thông tin mã vận đơn" description={error} action={<Button onClick={onRetry}>Thử lại</Button>} /> : null}
      {!loading && item && !error ? <div className="package-error-detail__layout">
        <div className="package-error-detail__top-grid">
        <Card className="package-error-detail__card" size="small"><SectionTitle index={1}>THÔNG TIN KIỆN HÀNG</SectionTitle><div className="package-error-detail__shipment-grid"><div><InfoLine label="Mã vận đơn"><Text strong copyable>{item.trackingCode}</Text></InfoLine><InfoLine label="Mã đơn hàng"><Text className="package-error-detail__link">{item.orderCode || "—"}</Text></InfoLine><InfoLine label="Mã lô hàng"><Button type="link" className="package-error-detail__inline-link" onClick={() => onOpenBatch?.(item.batchCode)}>{item.batchCode}</Button></InfoLine><InfoLine label="Khách hàng"><Text>{item.customerName || "—"}</Text></InfoLine><InfoLine label="Kho nhận"><Text strong>{item.warehouseName}</Text></InfoLine></div><div className="package-error-detail__shipment-meta"><InfoLine label="Ngày phát hiện"><Space><CalendarOutlined />{formatDateTime(item.errorDetectedAt ?? item.scannedAt)}</Space></InfoLine><InfoLine label="Người phát hiện"><Space><UserOutlined />{item.handlerName}</Space></InfoLine><InfoLine label="Người phụ trách"><Space><UserOutlined />{item.handlerName}</Space></InfoLine></div></div></Card>

        <Card className="package-error-detail__card package-error-detail__status-card" size="small"><SectionTitle>TRẠNG THÁI HIỆN TẠI</SectionTitle><Title level={4} className="package-error-detail__status"><ExclamationCircleFilled /> {currentStatus.label.toUpperCase()}</Title><InfoLine label="Loại lỗi"><Tag color="red">{item.errorType}</Tag></InfoLine><InfoLine label="Yêu cầu">{item.requiresItemInspection ? <Tag color="orange">Cần kiểm item</Tag> : <Text>Không yêu cầu</Text>}</InfoLine></Card>

        <Card className="package-error-detail__card package-error-detail__links-card" size="small"><SectionTitle>LIÊN KẾT</SectionTitle><Button type="text" block className="package-error-detail__link-row" onClick={() => onOpenBatch?.(item.batchCode)}><span><LinkOutlined /> Xem chi tiết lô hàng</span><span>{item.batchCode} <ArrowRightOutlined /></span></Button><div className="package-error-detail__static-link"><span>Xem đơn hàng</span><Text className="package-error-detail__link">{item.orderCode || "Chưa có liên kết"}</Text></div><div className="package-error-detail__static-link"><span>Xem khách hàng</span><Text className="package-error-detail__link">{item.customerName || "Chưa có liên kết"}</Text></div></Card>
        </div>

        <div className="package-error-detail__pair-grid package-error-detail__detail-grid">
        <Card className="package-error-detail__card package-error-detail__error-card" size="small"><SectionTitle index={2}>THÔNG TIN LỖI</SectionTitle><div className="package-error-detail__error-grid"><div><InfoLine label="Loại lỗi"><Text type="danger">{item.errorType}</Text></InfoLine><InfoLine label="Lý do bất thường"><Text>{item.exceptionReason || "Chưa ghi chú"}</Text></InfoLine><InfoLine label="Tình trạng bên ngoài"><Tag color={item.physicalCondition === "normal" ? "green" : "orange"}>{conditionLabels[item.physicalCondition] ?? item.physicalCondition}</Tag></InfoLine><InfoLine label="Cần kiểm item">{item.requiresItemInspection ? <Tag color="red">Có · Bắt buộc kiểm</Tag> : "Không"}</InfoLine></div><div className="package-error-detail__weight-block"><InfoLine label="KL kho TQ">{formatWeight(item.cnWeight)}</InfoLine><InfoLine label="KL kho VN">{formatWeight(item.actualWeight)}</InfoLine><InfoLine label="Chênh lệch"><Text type={Math.abs(item.weightDifference) > 0 ? "danger" : "success"} strong>{item.weightDifference > 0 ? "+" : ""}{formatWeight(item.weightDifference)}</Text></InfoLine></div></div></Card>

        <Card className="package-error-detail__card package-error-detail__item-card" size="small"><SectionTitle index={3}>KẾT QUẢ KIỂM ITEM</SectionTitle>{item.itemInspectionStatus === "completed" ? <><InfoLine label="Thời gian cập nhật">{formatDateTime(item.updatedAt)}</InfoLine><InfoLine label="Người kiểm">{item.handlerName}</InfoLine><InfoLine label="Kết quả"><Text type={itemHasError ? "danger" : "success"} strong>{itemHasError ? "Có item sai lệch/hư hỏng" : "Các item đã kiểm đều khớp"}</Text></InfoLine><Table size="small" rowKey="orderItemId" pagination={false} tableLayout="fixed" dataSource={inspectedItems} columns={[{ title: "Item", dataIndex: "productName", render: (value: string) => <Tooltip title={value}><Text className="package-error-detail__item-name">{value}</Text></Tooltip> }, { title: "Dự kiến", dataIndex: "expectedQuantity", width: 72, align: "center" }, { title: "Thực nhận", dataIndex: "receivedQuantity", width: 82, align: "center" }, { title: "Chênh lệch", width: 86, align: "center", render: (_, row) => { const difference = (row.receivedQuantity ?? 0) - row.expectedQuantity; return <Text type={difference === 0 ? "success" : "danger"} strong>{difference > 0 ? "+" : ""}{difference}</Text>; } }]} /></> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa kiểm item" />}</Card>
        </div>

        <div className="package-error-detail__pair-grid">
        <Card className="package-error-detail__card" size="small"><SectionTitle index={4}>HƯỚNG XỬ LÝ</SectionTitle><InfoLine label="Hướng xử lý"><Text>{item.resolutionAction || "Chưa cập nhật"}</Text></InfoLine><InfoLine label="Kết quả xử lý"><Text>{item.resolutionResult || "Chưa có kết quả"}</Text></InfoLine><InfoLine label="Dự kiến hoàn tất">{item.expectedCompletionAt ? dayjs(item.expectedCompletionAt).format("DD/MM/YYYY") : "—"}</InfoLine><InfoLine label="Trạng thái"><Tag color={currentStatus.color}>{currentStatus.label}</Tag></InfoLine></Card>

        <Card className="package-error-detail__card package-error-detail__evidence-card" size="small"><SectionTitle index={5}>BẰNG CHỨNG</SectionTitle>{item.evidences.length ? <Image.PreviewGroup><div className="package-error-detail__evidence-grid">{item.evidences.map((evidence) => <Tooltip key={evidence.id} title={`${evidence.originalName}${evidence.createdBy ? ` · ${evidence.createdBy}` : ""}`}><Image src={evidence.thumbnailUrl || evidence.url} fallback={MEDIA_IMAGE_FALLBACK} preview={{ src: evidence.url }} width={118} height={96} style={{ objectFit: "cover", borderRadius: 7 }} /></Tooltip>)}</div></Image.PreviewGroup> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có ảnh bằng chứng" />}<div className="package-error-detail__evidence-upload"><PackageEvidenceUpload files={evidenceFiles} onChange={setEvidenceFiles} existingCount={item.evidences.length} disabled={loading} />{evidenceFiles.length ? <Button type="primary" loading={loading} onClick={() => void addEvidence()}>Tải ảnh bổ sung</Button> : null}</div></Card>
        </div>

        <div className="package-error-detail__pair-grid package-error-detail__bottom-grid">
        <Card className="package-error-detail__card" size="small"><SectionTitle index={6}>LỊCH SỬ XỬ LÝ</SectionTitle><Timeline items={[
          { color: "blue", children: <><Text strong>Quét mã vận đơn</Text><div>{formatDateTime(item.scannedAt)} · Nhân viên: {item.handlerName}</div></> },
          { color: "red", children: <><Text strong>Phát hiện {item.errorType}</Text><div>{formatDateTime(item.errorDetectedAt ?? item.scannedAt)}</div><div>{item.exceptionReason || "Đã ghi nhận bất thường"}</div></> },
          ...(item.itemInspectionStatus === "completed" ? [{ color: "orange", children: <><Text strong>Kiểm item</Text><div>Cập nhật: {formatDateTime(item.updatedAt)}</div></> }] : []),
          ...(item.resolutionAction || item.resolutionResult ? [{ color: "blue", children: <><Text strong>Cập nhật xử lý</Text><div>{formatDateTime(item.updatedAt)} · {item.resolutionAction || item.resolutionResult}</div></> }] : []),
          { color: "gray", children: <><Text strong>{currentStatus.label}</Text><div>{item.resolutionNote || "Đang chờ bước xử lý tiếp theo"}</div></> },
        ]} /></Card>

        <Card className="package-error-detail__card" size="small"><SectionTitle index={7}>THÔNG TIN BỔ SUNG</SectionTitle><div className="package-error-detail__supplement-grid"><InfoLine label="Thời gian tạo">{formatDateTime(item.createdAt)}</InfoLine><InfoLine label="Thời gian cập nhật">{formatDateTime(item.updatedAt)}</InfoLine><InfoLine label="Ghi chú kho VN">{item.note || "Không có"}</InfoLine><InfoLine label="Người hoàn tất">{item.resolverName || "Chưa hoàn tất"}</InfoLine></div></Card>
        </div>
      </div> : null}
    </Modal>

    <Modal title={`Cập nhật xử lý · ${item?.trackingCode ?? ""}`} open={updateOpen} onCancel={() => setUpdateOpen(false)} okText="Lưu cập nhật" cancelText="Hủy" confirmLoading={loading} onOk={() => void submitUpdate()} width={680}>
      <Alert type="info" showIcon message="Cập nhật tiến trình, không hoàn tất kiện ở bước này." style={{ marginBottom: 16 }} />
      <Form form={form} layout="vertical"><Row gutter={16}><Col span={12}><Form.Item name="resolutionStatus" label="Trạng thái xử lý" rules={[{ required: true }]}><Select options={[{ label: "Chờ xử lý", value: "pending" }, { label: "Chờ xác minh", value: "verifying" }, { label: "Đang xử lý", value: "processing" }, { label: "Từ chối", value: "rejected" }]} /></Form.Item></Col><Col span={12}><Form.Item name="expectedCompletionAt" label="Dự kiến hoàn tất"><DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} /></Form.Item></Col></Row><Form.Item name="resolutionAction" label="Hướng xử lý"><Input placeholder="Ví dụ: Yêu cầu kho TQ kiểm tra/bồi thường" /></Form.Item><Form.Item name="resolutionResult" label="Kết quả xử lý"><Input.TextArea rows={3} placeholder="Tiến trình hoặc kết quả hiện tại" /></Form.Item><Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} maxLength={500} showCount /></Form.Item></Form>
    </Modal>
  </>;
};
