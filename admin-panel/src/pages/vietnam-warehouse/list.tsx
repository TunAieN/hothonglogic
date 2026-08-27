import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Badge, Button, Card, Form, Space, Spin, Table, Tabs, Tag, Tooltip, Typography, message } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, EyeOutlined, ExclamationCircleOutlined, InboxOutlined } from "@ant-design/icons";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { BatchReceiveCard } from "./components/BatchReceiveCard";
import { BatchInfoModal } from "./components/BatchInfoModal";
import { ReceiveBatchModal } from "./components/ReceiveBatchModal";
import { StoredPackageDetailModal } from "./components/StoredPackageDetailModal";
import { PackageErrorDetailModal } from "./components/PackageErrorDetailModal";
import { VietnamWarehouseFilters } from "./components/VietnamWarehouseFilters";
import { PageHeader, StatCard, StatsGrid } from "../../components/admin-page-summary";
import {
  buildBatchInfoDefaults, confirmVietnamWarehouseReceipt, fetchVietnamWarehouseOverview,
  fetchVietnamWarehousePackage, fetchVietnamWarehousePackages, fetchVietnamWarehouseReceipt,
  deleteVietnamPackageEvidence, getErrorMessage, inspectVietnamPackageItems, moveVietnamWarehouseReceiptToErrorQueue, removeVietnamPackage, resolveVietnamPackageDiscrepancy,
  resolveVietnamReceiptDiscrepancy, scanVietnamPackage, startVietnamWarehouseReceipt, updateVietnamPackageError,
  uploadVietnamPackageEvidences,
} from "./api";
import type {
  BatchInfoFormValues, PackageEvidence, PackageItemDetail, ReceivePackageFormValues, ReceivedPackageDraft,
  VietnamWarehouseBatch, VietnamWarehouseFilterValues, VietnamWarehousePackageListItem,
  VietnamPackageErrorUpdateInput,
  VietnamWarehousePackagePage, VietnamWarehouseReceiptData, VietnamWarehouseReceiptSummary,
  VietnamWarehouseStats, VietnamWarehouseTableItem,
} from "./types";

const { Text } = Typography;
const EMPTY_BATCH: VietnamWarehouseBatch = { id: "", batchCode: "", destinationWarehouseName: "", totalPackages: 0, totalWeight: 0, originWarehouseName: "", dispatchWeight: 0, transportContainerCount: 0, packagingType: "", packageMaterialWeight: 0, dispatchLength: 0, dispatchWidth: 0, dispatchHeight: 0, carrierName: "", transportCode: "", status: "pending_check" };
const EMPTY_BATCH_INFO: BatchInfoFormValues = { batchCode: "", actualBatchWeight: 0, actualContainerCount: 1, outerCondition: "normal", receivedAt: dayjs() };
const EMPTY_SUMMARY: VietnamWarehouseReceiptSummary = { expectedCount: 0, receivedCount: 0, inspectedCount: 0, extraCount: 0, damagedCount: 0, mismatchCount: 0, weightMismatchCount: 0, itemInspectionPendingCount: 0, missingCount: 0, storedCount: 0, receivableCount: 0, errorCount: 0, batchWeightMismatch: false, containerMismatch: false, batchResolutionPending: false, hasIssues: false, matched: false };
const EMPTY_STATS: VietnamWarehouseStats = { totalBatches: 0, importedBatches: 0, pendingCheckBatches: 0, discrepancyBatches: 0 };
const EMPTY_PACKAGE_PAGE: VietnamWarehousePackagePage = { items: [], total: 0, currentPage: 1, lastPage: 1, perPage: 10 };
const conditionLabels: Record<string, string> = { normal: "Nguyên vẹn", dented: "Móp", torn: "Rách", wet: "Ướt", broken: "Vỡ/hỏng", opened: "Đã mở", other: "Khác" };

const receiptStatusTag = (status?: string) => {
  if (status === "confirmed") return <Tag color="blue">Đã nhập kho</Tag>;
  if (status === "mismatched") return <Tag color="red">Có bất thường</Tag>;
  if (status === "matched") return <Tag color="green">Đã khớp, chờ xác nhận</Tag>;
  return <Tag color="gold">Đang đối soát</Tag>;
};

const matchesBatchFilters = (record: VietnamWarehouseTableItem, filters: VietnamWarehouseFilterValues) => {
  const contains = (value: string, filter?: string) => !filter?.trim() || value.toLowerCase().includes(filter.trim().toLowerCase());
  const date = dayjs(record.receivedDate);
  return contains(record.batchCode, filters.batchCode)
    && contains(record.trackingCode, filters.trackingCode)
    && contains(record.customerName, filters.customerName)
    && contains(record.receiverName, filters.receiverName)
    && (!filters.receivedFrom || !date.isBefore(filters.receivedFrom.startOf("day")))
    && (!filters.receivedTo || !date.isAfter(filters.receivedTo.endOf("day")));
};

export const VietnamWarehousePage = () => {
  const [filterForm] = Form.useForm<VietnamWarehouseFilterValues>();
  const [receiveForm] = Form.useForm<{ batchCode: string }>();
  const [filters, setFilters] = useState<VietnamWarehouseFilterValues>({});
  const [batchRows, setBatchRows] = useState<VietnamWarehouseTableItem[]>([]);
  const [stats, setStats] = useState<VietnamWarehouseStats>(EMPTY_STATS);
  const [storedPage, setStoredPage] = useState(EMPTY_PACKAGE_PAGE);
  const [errorPage, setErrorPage] = useState(EMPTY_PACKAGE_PAGE);
  const [storedLoaded, setStoredLoaded] = useState(false);
  const [errorLoaded, setErrorLoaded] = useState(false);
  const [packageLoading, setPackageLoading] = useState(false);
  const [batch, setBatch] = useState(EMPTY_BATCH);
  const [batchInfoValues, setBatchInfoValues] = useState(EMPTY_BATCH_INFO);
  const [expectedPackages, setExpectedPackages] = useState<VietnamWarehouseReceiptData["expectedPackages"]>([]);
  const [receivedPackages, setReceivedPackages] = useState<ReceivedPackageDraft[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("checking");
  const [batchInfoOpen, setBatchInfoOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [storedDetail, setStoredDetail] = useState<VietnamWarehousePackageListItem | null>(null);
  const [errorDetail, setErrorDetail] = useState<VietnamWarehousePackageListItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [lookupLoading, setLookupLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const checkingRows = useMemo(() => batchRows.filter((row) => row.receiptStatus !== "confirmed" && matchesBatchFilters(row, filters)), [batchRows, filters]);
  const customerOptions = useMemo(() => Array.from(new Set([...batchRows.map((row) => row.customerName), ...storedPage.items.map((row) => row.customerName), ...errorPage.items.map((row) => row.customerName)].filter(Boolean))), [batchRows, errorPage.items, storedPage.items]);
  const receiverOptions = useMemo(() => Array.from(new Set([...batchRows.map((row) => row.receiverName), ...storedPage.items.map((row) => row.handlerName), ...errorPage.items.map((row) => row.handlerName)].filter(Boolean))), [batchRows, errorPage.items, storedPage.items]);

  const applyReceipt = (payload: VietnamWarehouseReceiptData) => {
    setBatch(payload.batch); setExpectedPackages(payload.expectedPackages); setReceivedPackages(payload.receivedPackages);
    setSummary(payload.summary); setReceiptId(payload.receipt?.id ?? null); setBatchInfoValues(buildBatchInfoDefaults(payload));
  };
  const loadOverview = async () => { const data = await fetchVietnamWarehouseOverview(); setBatchRows(data.tableData); setStats(data.stats); };
  const loadPackages = async (scope: "stored" | "error", page = 1, perPage = 10, appliedFilters = filters) => {
    setPackageLoading(true);
    try {
      const data = await fetchVietnamWarehousePackages(scope, appliedFilters, page, perPage);
      if (scope === "stored") { setStoredPage(data); setStoredLoaded(true); } else { setErrorPage(data); setErrorLoaded(true); }
    } finally { setPackageLoading(false); }
  };
  const refreshAffectedData = async () => {
    await Promise.all([loadOverview(), loadPackages("stored", storedPage.currentPage, storedPage.perPage), loadPackages("error", errorPage.currentPage, errorPage.perPage)]);
  };

  useEffect(() => { void loadOverview().catch((error) => message.error(getErrorMessage(error))); }, []);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    if (key === "stored" && !storedLoaded) void loadPackages("stored").catch((error) => message.error(getErrorMessage(error)));
    if (key === "errors" && !errorLoaded) void loadPackages("error").catch((error) => message.error(getErrorMessage(error)));
  };
  const handleSearch = (values: VietnamWarehouseFilterValues) => {
    setFilters(values);
    if (activeTab === "stored") void loadPackages("stored", 1, storedPage.perPage, values).catch((error) => message.error(getErrorMessage(error)));
    if (activeTab === "errors") void loadPackages("error", 1, errorPage.perPage, values).catch((error) => message.error(getErrorMessage(error)));
  };
  const handleReset = () => { filterForm.resetFields(); setFilters({}); if (activeTab === "stored") void loadPackages("stored", 1, storedPage.perPage, {}); if (activeTab === "errors") void loadPackages("error", 1, errorPage.perPage, {}); };

  const lookupBatch = async (batchCode: string) => { const payload = await fetchVietnamWarehouseReceipt(batchCode.trim()); applyReceipt(payload); return payload; };
  const handleOpenBatch = async ({ batchCode }: { batchCode: string }) => { if (!batchCode.trim()) return message.warning("Vui lòng nhập mã lô hàng."); setLookupLoading(true); try { await lookupBatch(batchCode); setBatchInfoOpen(true); } catch (error) { message.error(getErrorMessage(error)); } finally { setLookupLoading(false); } };
  const openBatchDetail = async (batchCode: string) => { setLookupLoading(true); try { await lookupBatch(batchCode); setReceiveOpen(true); } catch (error) { message.error(getErrorMessage(error)); } finally { setLookupLoading(false); } };
  const openPackageDetail = async (row: VietnamWarehousePackageListItem, kind: "stored" | "error") => { setDetailLoading(true); setDetailError(undefined); if (kind === "stored") setStoredDetail(row); else setErrorDetail(row); try { const fresh = await fetchVietnamWarehousePackage(row.id); if (kind === "stored") setStoredDetail(fresh); else setErrorDetail(fresh); } catch (error) { const text = getErrorMessage(error); setDetailError(text); message.error(text); } finally { setDetailLoading(false); } };

  const handleStart = async (values: BatchInfoFormValues) => { setStartLoading(true); try { const payload = await startVietnamWarehouseReceipt(values); applyReceipt(payload); setBatchInfoOpen(false); setReceiveOpen(true); await loadOverview(); message.success("Đã tạo phiếu và sẵn sàng quét kiện."); } catch (error) { message.error(getErrorMessage(error)); } finally { setStartLoading(false); } };
  const handleScan = async (values: ReceivePackageFormValues, evidenceFiles: File[]) => { if (!receiptId) throw new Error("Phiếu nhập kho chưa được khởi tạo."); setActionLoading(true); let createdPackageId: string | undefined; try { const scannedPayload = await scanVietnamPackage(receiptId, values); createdPackageId = scannedPayload.receivedPackages.find((row) => row.trackingCode.toUpperCase() === values.trackingCode.toUpperCase())?.receiptPackageId; if (evidenceFiles.length) { if (!createdPackageId) throw new Error("Không xác định được kiện để liên kết ảnh minh chứng."); try { await uploadVietnamPackageEvidences(createdPackageId, evidenceFiles, "reconciliation"); } catch (uploadError) { await removeVietnamPackage(createdPackageId, batch.batchCode).catch(() => undefined); throw uploadError; } applyReceipt(await fetchVietnamWarehouseReceipt(batch.batchCode)); } else { applyReceipt(scannedPayload); } await refreshAffectedData(); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };
  const handleAddEvidence = async (row: ReceivedPackageDraft, files: File[]) => { if (!row.receiptPackageId || !files.length) return; setActionLoading(true); try { await uploadVietnamPackageEvidences(row.receiptPackageId, files, "reconciliation"); applyReceipt(await fetchVietnamWarehouseReceipt(batch.batchCode)); await refreshAffectedData(); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };
  const handleDeleteEvidence = async (row: ReceivedPackageDraft, evidence: PackageEvidence) => { if (!row.receiptPackageId) return; setActionLoading(true); try { await deleteVietnamPackageEvidence(row.receiptPackageId, evidence.id); applyReceipt(await fetchVietnamWarehouseReceipt(batch.batchCode)); await refreshAffectedData(); message.success("Đã xóa ảnh minh chứng."); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };
  const handleInspect = async (row: ReceivedPackageDraft, items: PackageItemDetail[]) => { if (!row.receiptPackageId) return; setActionLoading(true); try { applyReceipt(await inspectVietnamPackageItems(row.receiptPackageId, items)); await refreshAffectedData(); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };
  const handleRemove = async (row: ReceivedPackageDraft) => { if (!row.receiptPackageId) return; setActionLoading(true); try { applyReceipt(await removeVietnamPackage(row.receiptPackageId, batch.batchCode)); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };
  const handleResolveBatch = async (note: string) => { if (!receiptId) return; setActionLoading(true); try { applyReceipt(await resolveVietnamReceiptDiscrepancy(receiptId, note)); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };
  const handleResolvePackage = async (row: ReceivedPackageDraft, note: string) => { if (!row.receiptPackageId) return; setActionLoading(true); try { applyReceipt(await resolveVietnamPackageDiscrepancy(row.receiptPackageId, note)); await refreshAffectedData(); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };
  const handleMoveToErrorQueue = async () => { if (!receiptId) return; setActionLoading(true); try { applyReceipt(await moveVietnamWarehouseReceiptToErrorQueue(receiptId, batch.batchCode)); await refreshAffectedData(); message.success(`Đã chuyển ${summary.errorCount} kiện bất thường sang Chờ xử lý lỗi.`); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };
  const handleResolveErrorDetail = async (note: string) => { if (!errorDetail) return; setActionLoading(true); try { await resolveVietnamPackageDiscrepancy(errorDetail.id, note); setErrorDetail(null); await refreshAffectedData(); message.success("Đã xử lý lỗi và nhập kho kiện hàng."); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };
  const handleUpdateErrorDetail = async (input: VietnamPackageErrorUpdateInput) => { if (!errorDetail) return; setActionLoading(true); try { const fresh = await updateVietnamPackageError(errorDetail.id, input); setErrorDetail(fresh); await Promise.all([loadOverview(), loadPackages("error", errorPage.currentPage, errorPage.perPage)]); message.success("Đã cập nhật tiến trình xử lý lỗi."); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };
  const handleAddErrorEvidence = async (files: File[]) => { if (!errorDetail || !files.length) return; setActionLoading(true); try { await uploadVietnamPackageEvidences(errorDetail.id, files, "resolution"); setErrorDetail(await fetchVietnamWarehousePackage(errorDetail.id)); await loadPackages("error", errorPage.currentPage, errorPage.perPage); message.success("Đã bổ sung ảnh xử lý."); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };
  const handleConfirm = async () => { if (!receiptId) return; setActionLoading(true); try { const payload = await confirmVietnamWarehouseReceipt(receiptId, batch.batchCode); applyReceipt(payload); setReceiveOpen(false); await refreshAffectedData(); message.success(`Đã nhập kho ${summary.receivableCount} kiện hợp lệ; kiện lỗi được giữ lại xử lý riêng.`); } catch (error) { message.error(getErrorMessage(error)); throw error; } finally { setActionLoading(false); } };

  const batchColumns: ColumnsType<VietnamWarehouseTableItem> = [
    { title: "Ngày nhận", dataIndex: "receivedDate", width: 120, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Mã lô hàng", dataIndex: "batchCode", width: 155, render: (value) => <Button type="link" onClick={() => void openBatchDetail(value)}>{value}</Button> },
    { title: "Kho nhận", dataIndex: "warehouseName", width: 155 }, { title: "Tổng kiện", dataIndex: "totalPackages", width: 90 },
    { title: "Đã quét", dataIndex: "receivedCount", width: 90 }, { title: "Thiếu", dataIndex: "missingCount", width: 80 },
    { title: "Ngoài lô", dataIndex: "extraCount", width: 90 }, { title: "Hư hỏng", dataIndex: "damagedCount", width: 90 },
    { title: "Trạng thái", dataIndex: "receiptStatus", width: 170, render: receiptStatusTag },
    { title: "Người xử lý", dataIndex: "handlerName", width: 120 },
    { title: "Thao tác", width: 80, fixed: "right", render: (_, row) => <Tooltip title="Chi tiết lô"><Button icon={<EyeOutlined />} onClick={() => void openBatchDetail(row.batchCode)} /></Tooltip> },
  ];
  const storedColumns: ColumnsType<VietnamWarehousePackageListItem> = [
    { title: "Ngày nhập", dataIndex: "receivedAt", width: 120, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Mã vận đơn", dataIndex: "trackingCode", width: 160, fixed: "left", render: (value) => <Text copyable>{value}</Text> },
    { title: "Mã lô hàng", dataIndex: "batchCode", width: 145, render: (value) => <Button type="link" onClick={() => void openBatchDetail(value)}>{value}</Button> },
    { title: "Khách hàng", dataIndex: "customerName", width: 150 }, { title: "Kho nhận", dataIndex: "warehouseName", width: 150 },
    { title: "KL kho TQ", dataIndex: "cnWeight", width: 100, render: (value) => `${Number(value).toFixed(2)} kg` },
    { title: "KL kho VN", dataIndex: "actualWeight", width: 100, render: (value) => `${Number(value).toFixed(2)} kg` },
    { title: "Chênh lệch", dataIndex: "weightDifference", width: 100, render: (value) => `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)} kg` },
    { title: "Tình trạng ngoài", dataIndex: "physicalCondition", width: 125, render: (value) => conditionLabels[value] ?? value },
    { title: "Kiểm item", dataIndex: "itemInspectionStatus", width: 100, render: (value) => value === "completed" ? "Đã kiểm" : "Không kiểm" },
    { title: "Đối soát", width: 95, render: () => <Tag color="green">Đã khớp</Tag> }, { title: "Trạng thái", width: 105, render: () => <Tag color="blue">Đã nhập kho</Tag> },
    { title: "Người xử lý", dataIndex: "handlerName", width: 120 },
    { title: "Thao tác", width: 75, fixed: "right", render: (_, row) => <Tooltip title="Chi tiết kiện"><Button icon={<EyeOutlined />} onClick={() => void openPackageDetail(row, "stored")} /></Tooltip> },
  ];
  const errorColumns: ColumnsType<VietnamWarehousePackageListItem> = [
    { title: "Ngày phát hiện", dataIndex: "errorDetectedAt", width: 125, render: (value, row) => dayjs(value ?? row.scannedAt).format("DD/MM/YYYY") },
    { title: "Mã vận đơn", dataIndex: "trackingCode", width: 160, fixed: "left" }, { title: "Mã lô", dataIndex: "batchCode", width: 140 },
    { title: "Khách hàng", dataIndex: "customerName", width: 145 }, { title: "Kho nhận", dataIndex: "warehouseName", width: 145 },
    { title: "Loại lỗi", dataIndex: "errorType", width: 145, render: (value) => <Tag color="red">{value}</Tag> },
    { title: "KL kho TQ", dataIndex: "cnWeight", width: 100, render: (value) => `${Number(value).toFixed(2)} kg` },
    { title: "KL kho VN", dataIndex: "actualWeight", width: 100, render: (value) => `${Number(value).toFixed(2)} kg` },
    { title: "Chênh lệch", dataIndex: "weightDifference", width: 100, render: (value) => <Text type="danger">{Number(value) > 0 ? "+" : ""}{Number(value).toFixed(2)} kg</Text> },
    { title: "Tình trạng ngoài", dataIndex: "physicalCondition", width: 120, render: (value) => conditionLabels[value] ?? value },
    { title: "Kiểm item", width: 110, render: (_, row) => row.requiresItemInspection ? "Bắt buộc kiểm" : row.itemInspectionStatus === "completed" ? "Đã kiểm" : "Không kiểm" },
    { title: "Trạng thái xử lý", width: 120, render: () => <Tag color="gold">Chờ xử lý</Tag> }, { title: "Người phụ trách", dataIndex: "handlerName", width: 120 },
    { title: "Thao tác", width: 75, fixed: "right", render: (_, row) => <Tooltip title="Chi tiết xử lý lỗi"><Button icon={<EyeOutlined />} onClick={() => void openPackageDetail(row, "error")} /></Tooltip> },
  ];

  const packagePagination = (scope: "stored" | "error", data: VietnamWarehousePackagePage): TablePaginationConfig => ({ current: data.currentPage, pageSize: data.perPage, total: data.total, showSizeChanger: true, pageSizeOptions: [10, 20, 50], onChange: (page, size) => void loadPackages(scope, page, size).catch((error) => message.error(getErrorMessage(error))) });
  const tabs = [
    { key: "checking", label: <Badge count={checkingRows.length} size="small" offset={[8, -1]}>Đang đối soát</Badge>, children: <Table rowKey="id" columns={batchColumns} dataSource={checkingRows} pagination={{ pageSize: 10 }} scroll={{ x: 1250 }} loading={lookupLoading} /> },
    { key: "stored", label: <Badge count={storedPage.total} size="small" offset={[8, -1]}>Đã nhập kho</Badge>, children: <Table rowKey="id" columns={storedColumns} dataSource={storedPage.items} pagination={packagePagination("stored", storedPage)} scroll={{ x: 1750 }} loading={packageLoading} /> },
    { key: "errors", label: <Badge count={errorPage.total} size="small" offset={[8, -1]}>Chờ xử lý lỗi</Badge>, children: <Table rowKey="id" columns={errorColumns} dataSource={errorPage.items} pagination={packagePagination("error", errorPage)} scroll={{ x: 1750 }} loading={packageLoading} /> },
  ];

  return <Space orientation="vertical" size="large" style={{ width: "100%" }}>
    <PageHeader title="Kho hàng Việt Nam" description="Tiếp nhận lô từ Trung Quốc; đối soát theo lô và quản lý nhập kho, lỗi theo từng mã vận đơn." />
    <StatsGrid columns={4}><StatCard label="Tổng lô" value={stats.totalBatches} unit="lô" icon={<InboxOutlined />} tone="blue"/><StatCard label="Lô hoàn tất" value={stats.importedBatches} unit="lô" icon={<CheckCircleOutlined />} tone="green"/><StatCard label="Đang đối soát" value={stats.pendingCheckBatches} unit="lô" icon={<ClockCircleOutlined />} tone="orange"/><StatCard label="Lô có bất thường" value={stats.discrepancyBatches} unit="lô" icon={<ExclamationCircleOutlined />} tone="red"/></StatsGrid>
    <VietnamWarehouseFilters form={filterForm} customerOptions={customerOptions} receiverOptions={receiverOptions} activeTab={activeTab} onSearch={handleSearch} onReset={handleReset}/>
    <Spin spinning={lookupLoading}><BatchReceiveCard form={receiveForm} batchPreview={batch.batchCode ? batch : undefined} onSubmit={(values) => void handleOpenBatch(values)}/></Spin>
    <Card><Tabs activeKey={activeTab} items={tabs} onChange={handleTabChange}/></Card>
    <BatchInfoModal open={batchInfoOpen} batch={batch} initialValues={batchInfoValues} loading={startLoading} onCancel={() => setBatchInfoOpen(false)} onStart={handleStart}/>
    <ReceiveBatchModal open={receiveOpen} batch={batch} expectedPackages={expectedPackages} receivedPackages={receivedPackages} summary={summary} loading={actionLoading} onCancel={() => setReceiveOpen(false)} onRefresh={async () => { await lookupBatch(batch.batchCode); }} onAddPackage={handleScan} onRemovePackage={handleRemove} onInspectItems={handleInspect} onAddEvidence={handleAddEvidence} onDeleteEvidence={handleDeleteEvidence} onResolveBatchDiscrepancy={handleResolveBatch} onResolvePackageDiscrepancy={handleResolvePackage} onMoveToErrorQueue={handleMoveToErrorQueue} onConfirm={handleConfirm}/>
    <StoredPackageDetailModal open={Boolean(storedDetail)} loading={detailLoading} item={storedDetail} onClose={() => setStoredDetail(null)}/>
    <PackageErrorDetailModal open={Boolean(errorDetail)} loading={detailLoading || actionLoading} error={detailError} item={errorDetail} onClose={() => { setErrorDetail(null); setDetailError(undefined); }} onRetry={() => { if (errorDetail) void openPackageDetail(errorDetail, "error"); }} onOpenBatch={(batchCode) => { setErrorDetail(null); void openBatchDetail(batchCode); }} onUpdate={handleUpdateErrorDetail} onComplete={handleResolveErrorDetail} onAddEvidence={handleAddErrorEvidence}/>
  </Space>;
};
