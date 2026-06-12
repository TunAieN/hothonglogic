import { useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import dayjs from "dayjs";
import {
  Badge,
  Button,
  Card,
  Col,
  Form,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { BatchReceiveCard } from "./components/BatchReceiveCard";
import { BatchInfoModal } from "./components/BatchInfoModal";
import { ReceiveBatchModal } from "./components/ReceiveBatchModal";
import { VietnamWarehouseFilters } from "./components/VietnamWarehouseFilters";
import {
  confirmVietnamWarehouseReceipt,
  fetchVietnamWarehouseOverview,
  fetchVietnamWarehouseReceipt,
  getErrorMessage,
  moveVietnamWarehouseReceiptToErrorQueue,
  removeVietnamPackage,
  scanVietnamPackage,
  startVietnamWarehouseReceipt,
  buildBatchInfoDefaults,
} from "./api";
import type {
  BatchInfoFormValues,
  ReceivePackageFormValues,
  ReceivedPackageDraft,
  VietnamWarehouseBatch,
  VietnamWarehouseFilterValues,
  VietnamWarehouseReceiptData,
  VietnamWarehouseReceiptSummary,
  VietnamWarehouseStats,
  VietnamWarehouseTableItem,
} from "./types";

const { Text, Title } = Typography;

const EMPTY_BATCH: VietnamWarehouseBatch = {
  id: "",
  batchCode: "",
  destinationWarehouseName: "",
  totalPackages: 0,
  totalWeight: 0,
  status: "pending_check",
};

const EMPTY_BATCH_INFO: BatchInfoFormValues = {
  batchCode: "",
  batchWeight: 0,
  packagingWeight: 0,
  packagingType: "Dong go",
  length: 0,
  width: 0,
  height: 0,
};

const EMPTY_SUMMARY: VietnamWarehouseReceiptSummary = {
  expectedCount: 0,
  receivedCount: 0,
  inspectedCount: 0,
  extraCount: 0,
  damagedCount: 0,
  missingCount: 0,
  matched: false,
};

const EMPTY_STATS: VietnamWarehouseStats = {
  totalBatches: 0,
  importedBatches: 0,
  pendingCheckBatches: 0,
  discrepancyBatches: 0,
};

const getProcessingStatusTag = (status?: VietnamWarehouseTableItem["receiptStatus"]) => {
  switch (status) {
    case "confirmed":
      return <Tag color="blue">Da nhap kho</Tag>;
    case "mismatched":
      return <Tag color="red">Cho xu ly loi</Tag>;
    case "matched":
      return <Tag color="green">Da khop, cho xac nhan</Tag>;
    case "checking":
      return <Tag color="gold">Dang kiem</Tag>;
    default:
      return <Tag>Dang kiem</Tag>;
  }
};

const recordMatchesFilters = (
  record: VietnamWarehouseTableItem,
  filters: VietnamWarehouseFilterValues,
) => {
  const batchCode = filters.batchCode?.trim().toLowerCase();
  const trackingCode = filters.trackingCode?.trim().toLowerCase();
  const customerName = filters.customerName?.trim().toLowerCase();
  const receiverName = filters.receiverName?.trim().toLowerCase();
  const receivedDate = dayjs(record.receivedDate);

  if (batchCode && !record.batchCode.toLowerCase().includes(batchCode)) {
    return false;
  }

  if (filters.status && record.status !== filters.status) {
    return false;
  }

  if (trackingCode && !record.trackingCode.toLowerCase().includes(trackingCode)) {
    return false;
  }

  if (customerName && !record.customerName.toLowerCase().includes(customerName)) {
    return false;
  }

  if (receiverName && !record.receiverName.toLowerCase().includes(receiverName)) {
    return false;
  }

  if (filters.receivedFrom && receivedDate.isBefore(filters.receivedFrom.startOf("day"))) {
    return false;
  }

  if (filters.receivedTo && receivedDate.isAfter(filters.receivedTo.endOf("day"))) {
    return false;
  }

  return true;
};

export const VietnamWarehousePage = () => {
  const [filterForm] = Form.useForm<VietnamWarehouseFilterValues>();
  const [receiveForm] = Form.useForm<{ batchCode: string }>();
  const [filters, setFilters] = useState<VietnamWarehouseFilterValues>({});
  const [tableData, setTableData] = useState<VietnamWarehouseTableItem[]>([]);
  const [stats, setStats] = useState<VietnamWarehouseStats>(EMPTY_STATS);
  const [batch, setBatch] = useState<VietnamWarehouseBatch>(EMPTY_BATCH);
  const [batchInfoModalOpen, setBatchInfoModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [batchInfoValues, setBatchInfoValues] = useState<BatchInfoFormValues>(EMPTY_BATCH_INFO);
  const [expectedPackages, setExpectedPackages] = useState<VietnamWarehouseReceiptData["expectedPackages"]>([]);
  const [receivedPackages, setReceivedPackages] = useState<ReceivedPackageDraft[]>([]);
  const [receiptSummary, setReceiptSummary] = useState<VietnamWarehouseReceiptSummary>(EMPTY_SUMMARY);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [activeTab, setActiveTab] = useState("stored");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [receiptActionLoading, setReceiptActionLoading] = useState(false);

  const filteredData = useMemo(
    () => tableData.filter((record) => recordMatchesFilters(record, filters)),
    [filters, tableData],
  );

  const storedData = useMemo(
    () => filteredData.filter((item) => item.receiptStatus === "confirmed"),
    [filteredData],
  );

  const errorData = useMemo(
    () =>
      filteredData.filter((item) => item.receiptStatus === "mismatched"),
    [filteredData],
  );

  const customerOptions = useMemo(
    () => Array.from(new Set(tableData.map((item) => item.customerName).filter(Boolean))),
    [tableData],
  );

  const receiverOptions = useMemo(
    () => Array.from(new Set(tableData.map((item) => item.receiverName).filter(Boolean))),
    [tableData],
  );

  const applyReceiptPayload = (payload: VietnamWarehouseReceiptData) => {
    setBatch(payload.batch);
    setExpectedPackages(payload.expectedPackages);
    setReceivedPackages(payload.receivedPackages);
    setReceiptSummary(payload.summary);
    setReceiptId(payload.receipt?.id ?? null);
    setBatchInfoValues(buildBatchInfoDefaults(payload));
  };

  const loadOverview = async () => {
    const overview = await fetchVietnamWarehouseOverview();
    setTableData(overview.tableData);
    setStats(overview.stats);
  };

  useEffect(() => {
    void loadOverview().catch((error) => {
      message.error(getErrorMessage(error));
    });
  }, []);

  const refreshReceiptState = async (batchCode = batch.batchCode) => {
    if (!batchCode) {
      return;
    }

    const payload = await fetchVietnamWarehouseReceipt(batchCode);
    applyReceiptPayload(payload);
  };

  const handleSearch = (values: VietnamWarehouseFilterValues) => {
    setFilters(values);
  };

  const handleReset = () => {
    filterForm.resetFields();
    setFilters({});
  };

  const handleOpenBatchInfoModal = async (values: { batchCode: string }) => {
    const normalizedCode = values.batchCode.trim();

    if (!normalizedCode) {
      message.warning("Vui long nhap ma lo hang.");
      return;
    }

    setLookupLoading(true);

    try {
      const payload = await fetchVietnamWarehouseReceipt(normalizedCode);
      applyReceiptPayload(payload);
      setBatchInfoModalOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLookupLoading(false);
    }
  };

  const handleOpenReceiptDetail = async (batchCode: string) => {
    setLookupLoading(true);

    try {
      const payload = await fetchVietnamWarehouseReceipt(batchCode);
      applyReceiptPayload(payload);
      setReceiveModalOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLookupLoading(false);
    }
  };

  const handleStartReceiving = async (values: BatchInfoFormValues) => {
    setStartLoading(true);

    try {
      const payload = await startVietnamWarehouseReceipt(values);
      applyReceiptPayload(payload);
      setBatchInfoValues(values);
      setBatchInfoModalOpen(false);
      setReceiveModalOpen(true);
      message.success("Da tao phieu nhap kho va san sang scan kien.");
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setStartLoading(false);
    }
  };

  const handleAddPackage = async (
    values: ReceivePackageFormValues & { inspectionStatus?: "inspected" | "damaged" },
  ) => {
    if (!receiptId) {
      message.error("Phieu nhap kho chua duoc khoi tao.");
      return;
    }

    setReceiptActionLoading(true);

    try {
      const payload = await scanVietnamPackage(receiptId, values);
      applyReceiptPayload(payload);
    } catch (error) {
      message.error(getErrorMessage(error));
      throw error;
    } finally {
      setReceiptActionLoading(false);
    }
  };

  const handleRemovePackage = async (record: ReceivedPackageDraft) => {
    if (!record.receiptPackageId || !batch.batchCode) {
      return;
    }

    setReceiptActionLoading(true);

    try {
      const payload = await removeVietnamPackage(record.receiptPackageId, batch.batchCode);
      applyReceiptPayload(payload);
    } catch (error) {
      message.error(getErrorMessage(error));
      throw error;
    } finally {
      setReceiptActionLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!receiptId || !batch.batchCode) {
      message.error("Phieu nhap kho chua san sang de xac nhan.");
      return;
    }

    setReceiptActionLoading(true);

    try {
      const payload = await confirmVietnamWarehouseReceipt(receiptId, batch.batchCode);
      applyReceiptPayload(payload);
      await loadOverview();
      setReceiveModalOpen(false);
      setSelectedRowKeys([]);
      message.success("Da xac nhan nhap kho Viet Nam.");
    } catch (error) {
      message.error(getErrorMessage(error));
      throw error;
    } finally {
      setReceiptActionLoading(false);
    }
  };

  const handleMoveToErrorQueue = async () => {
    if (!receiptId || !batch.batchCode) {
      message.error("Phieu nhap kho chua san sang de chuyen xu ly loi.");
      return;
    }

    setReceiptActionLoading(true);

    try {
      await moveVietnamWarehouseReceiptToErrorQueue(receiptId, batch.batchCode);
      await loadOverview();
      setReceiveModalOpen(false);
      setSelectedRowKeys([]);
      message.success("Da chuyen phieu nhap kho sang cho xu ly loi");
    } catch (error) {
      message.error(getErrorMessage(error));
      throw error;
    } finally {
      setReceiptActionLoading(false);
    }
  };

  const columns: ColumnsType<VietnamWarehouseTableItem> = [
    {
      title: "Ngay nhan hang",
      dataIndex: "receivedDate",
      key: "receivedDate",
      width: 140,
      render: (value: string) => dayjs(value).format("DD/MM/YYYY"),
    },
    {
      title: "Nguoi xu ly",
      dataIndex: "handlerName",
      key: "handlerName",
      width: 120,
    },
    {
      title: "Ma lo hang",
      dataIndex: "batchCode",
      key: "batchCode",
      width: 160,
      render: (value: string) => (
        <Button type="link" onClick={() => void handleOpenReceiptDetail(value)}>
          {value}
        </Button>
      ),
    },
    {
      title: "Kho nhan",
      dataIndex: "warehouseName",
      key: "warehouseName",
      width: 160,
    },
    {
      title: "Tong kien",
      dataIndex: "totalPackages",
      key: "totalPackages",
      width: 110,
    },
    {
      title: "Da nhap",
      dataIndex: "receivedCount",
      key: "receivedCount",
      width: 100,
    },
    {
      title: "Thieu",
      dataIndex: "missingCount",
      key: "missingCount",
      width: 90,
    },
    {
      title: "Thua",
      dataIndex: "extraCount",
      key: "extraCount",
      width: 90,
    },
    {
      title: "Hu hong",
      dataIndex: "damagedCount",
      key: "damagedCount",
      width: 100,
    },
    {
      title: "Trang thai loi",
      dataIndex: "errorStatusLabel",
      key: "errorStatusLabel",
      width: 220,
      render: (_, record) =>
        record.status === "arrived_vn" ? <Text type="secondary">Khong co loi</Text> : <Text>{record.errorStatusLabel}</Text>,
    },
    {
      title: "Trang thai xu ly",
      dataIndex: "receiptStatus",
      key: "receiptStatus",
      width: 180,
      render: (value: VietnamWarehouseTableItem["receiptStatus"]) => getProcessingStatusTag(value),
    },
    {
      title: "Thao tac",
      key: "actions",
      width: 130,
      fixed: "right",
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Xem chi tiet">
            <Button icon={<EyeOutlined />} onClick={() => void handleOpenReceiptDetail(record.batchCode)} />
          </Tooltip>
          <Tooltip title="Sua">
            <Button icon={<EditOutlined />} />
          </Tooltip>
          <Tooltip title="Khac">
            <Button icon={<EllipsisOutlined />} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const commonTableProps = {
    columns,
    pagination: { pageSize: 5, showSizeChanger: true, pageSizeOptions: [5, 10, 20] },
    scroll: { x: 1300 },
    locale: {
      emptyText: batch.batchCode ? "Chua co du lieu nhap kho cho lo nay." : "Nhap ma lo de bat dau doi soat.",
    },
    rowSelection: {
      selectedRowKeys,
      onChange: (keys: Key[]) => setSelectedRowKeys(keys),
    },
  };

  const tabItems = [
    {
      key: "stored",
      label: "Da nhap kho",
      children: (
        <Table<VietnamWarehouseTableItem> rowKey="id" dataSource={storedData} {...commonTableProps} />
      ),
    },
    {
      key: "errors",
      label: (
        <Badge count={errorData.length} size="small" offset={[8, -1]}>
          <span>Cho xu ly loi</span>
        </Badge>
      ),
      children: (
        <Table<VietnamWarehouseTableItem> rowKey="id" dataSource={errorData} {...commonTableProps} />
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Row gutter={[16, 16]} align="middle" justify="space-between">
          <Col xs={24} xl={10}>
            <Space direction="vertical" size={4}>
              <Title level={2} style={{ margin: 0 }}>
                Kho hang Viet Nam
              </Title>
              <Text type="secondary">
                Tiep nhan lo hang tu kho Trung Quoc, nhap kho Viet Nam va doi soat kien hang theo ma lo.
              </Text>
            </Space>
          </Col>
          <Col xs={24} xl={14}>
            <Row gutter={[12, 12]}>
              <Col xs={12} md={6}>
                <Card size="small">
                  <Statistic title="Tong lo" value={stats.totalBatches} prefix={<InboxOutlined />} />
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card size="small">
                  <Statistic
                    title="Da nhap kho"
                    value={stats.importedBatches}
                    prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />}
                  />
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card size="small">
                  <Statistic
                    title="Cho doi soat"
                    value={stats.pendingCheckBatches}
                    prefix={<ClockCircleOutlined style={{ color: "#fa8c16" }} />}
                  />
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card size="small">
                  <Statistic
                    title="Loi chenh lech"
                    value={stats.discrepancyBatches}
                    prefix={<ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />}
                  />
                </Card>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <VietnamWarehouseFilters
        form={filterForm}
        customerOptions={customerOptions}
        receiverOptions={receiverOptions}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      <Spin spinning={lookupLoading}>
        <BatchReceiveCard form={receiveForm} batchPreview={batch.batchCode ? batch : undefined} onSubmit={(values) => void handleOpenBatchInfoModal(values)} />
      </Spin>

      <Card>
        <Tabs activeKey={activeTab} items={tabItems} onChange={setActiveTab} />
      </Card>

      <BatchInfoModal
        open={batchInfoModalOpen}
        initialValues={batchInfoValues}
        loading={startLoading}
        onCancel={() => setBatchInfoModalOpen(false)}
        onStart={handleStartReceiving}
      />

      <ReceiveBatchModal
        open={receiveModalOpen}
        expectedPackages={expectedPackages}
        batchInfo={batchInfoValues}
        receivedPackages={receivedPackages}
        summary={receiptSummary}
        loading={receiptActionLoading}
        onCancel={() => setReceiveModalOpen(false)}
        onRefresh={() => refreshReceiptState()}
        onAddPackage={handleAddPackage}
        onRemovePackage={handleRemovePackage}
        onMoveToErrorQueue={handleMoveToErrorQueue}
        onConfirm={handleConfirm}
      />
    </Space>
  );
};
