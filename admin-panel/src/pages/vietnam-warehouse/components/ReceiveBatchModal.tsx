import { useEffect, useMemo } from "react";
import type { CSSProperties } from "react";
import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type {
  BatchInfoFormValues,
  ComparisonSummary,
  ExpectedBatchPackage,
  ReceivePackageFormValues,
  ReceivedPackageDraft,
  VietnamWarehouseReceiptSummary,
} from "../types";

const { Text, Title } = Typography;

type Props = {
  open: boolean;
  expectedPackages: ExpectedBatchPackage[];
  batchInfo: BatchInfoFormValues;
  receivedPackages: ReceivedPackageDraft[];
  summary: VietnamWarehouseReceiptSummary;
  loading?: boolean;
  onCancel: () => void;
  onRefresh: () => Promise<void> | void;
  onAddPackage: (
    values: ReceivePackageFormValues & { inspectionStatus?: "inspected" | "damaged" },
  ) => Promise<void>;
  onRemovePackage: (record: ReceivedPackageDraft) => Promise<void>;
  onMoveToErrorQueue: () => Promise<void>;
  onConfirm: () => Promise<void>;
};

const sectionStyle = {
  border: "1px solid #d9e2f1",
  borderRadius: 8,
  background: "#fff",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: 13,
  color: "#344054",
  fontWeight: 500,
};

const infoCellStyle: CSSProperties = {
  borderRight: "1px solid #e5e7eb",
  borderBottom: "1px solid #e5e7eb",
  padding: "10px 12px",
  minHeight: 52,
};

const buildSummary = (
  expectedPackages: ExpectedBatchPackage[],
  receivedPackages: ReceivedPackageDraft[],
  apiSummary: VietnamWarehouseReceiptSummary,
): ComparisonSummary => {
  const missingTrackingCodes = expectedPackages
    .filter(
      (item) =>
        !receivedPackages.some(
          (received) =>
            received.trackingCode === item.trackingCode &&
            (received.status === "checked" || received.status === "damaged"),
        ),
    )
    .map((item) => item.trackingCode);

  return {
    importedCount: apiSummary.receivedCount,
    expectedCount: apiSummary.expectedCount,
    matchedCount: apiSummary.inspectedCount,
    missingCount: apiSummary.missingCount,
    extraCount: apiSummary.extraCount,
    missingTrackingCodes,
  };
};

const getStatusTag = (status: ReceivedPackageDraft["status"]) => {
  if (status === "checked") {
    return <Tag color="green">Da kiem</Tag>;
  }

  if (status === "missing") {
    return <Tag color="orange">Thieu kien</Tag>;
  }

  if (status === "damaged") {
    return <Tag color="gold">Hu hong</Tag>;
  }

  return <Tag color="red">Thua kien</Tag>;
};

const formatWeight = (value: number) => `${value.toFixed(1)}kg`;

export const ReceiveBatchModal = ({
  open,
  expectedPackages,
  batchInfo,
  receivedPackages,
  summary: apiSummary,
  loading,
  onCancel,
  onRefresh,
  onAddPackage,
  onRemovePackage,
  onMoveToErrorQueue,
  onConfirm,
}: Props) => {
  const [packageForm] = Form.useForm<ReceivePackageFormValues & { inspectionStatus?: "inspected" | "damaged" }>();

  const watchedWeight = Form.useWatch("weight", packageForm) ?? 0;
  const watchedLength = Form.useWatch("length", packageForm) ?? 0;
  const watchedWidth = Form.useWatch("width", packageForm) ?? 0;
  const watchedHeight = Form.useWatch("height", packageForm) ?? 0;

  const volumetricWeight = useMemo(() => {
    if (!watchedLength || !watchedWidth || !watchedHeight) {
      return 0;
    }

    return Math.max(watchedWeight, (watchedLength * watchedWidth * watchedHeight) / 6000);
  }, [watchedHeight, watchedLength, watchedWeight, watchedWidth]);

  useEffect(() => {
    if (!open) {
      return;
    }

    packageForm.setFieldsValue({
      trackingCode: "",
      weight: undefined,
      length: undefined,
      width: undefined,
      height: undefined,
      orderCode: "",
      customerName: "",
      extraFeeRmb: 0,
      declaredValue: 0,
      surcharge: 0,
      note: "",
      inspectionStatus: "inspected",
    });
  }, [open, packageForm]);

  const summary = useMemo(
    () => buildSummary(expectedPackages, receivedPackages, apiSummary),
    [apiSummary, expectedPackages, receivedPackages],
  );
  const hasIssues =
    summary.missingCount > 0 || summary.extraCount > 0 || apiSummary.damagedCount > 0;

  const checkedPackages = useMemo(
    () => receivedPackages.filter((item) => item.status === "checked" || item.status === "damaged"),
    [receivedPackages],
  );

  const checkedWeight = useMemo(
    () => checkedPackages.reduce((total, item) => total + item.weight, 0),
    [checkedPackages],
  );

  const chargeablePackages = useMemo(
    () => receivedPackages.filter((item) => item.extraFeeRmb > 0),
    [receivedPackages],
  );

  const totalExtraFee = useMemo(
    () => chargeablePackages.reduce((total, item) => total + item.extraFeeRmb, 0),
    [chargeablePackages],
  );

  const woodPackagingCount = batchInfo.packagingType === "Dong go" ? checkedPackages.length : 0;
  const cardboardPackagingCount = batchInfo.packagingType === "Nep bia" ? checkedPackages.length : 0;

  const tableData = useMemo(() => {
    const missingRows: ReceivedPackageDraft[] = summary.missingTrackingCodes.map((trackingCode, index) => {
      const matchedExpected = expectedPackages.find((item) => item.trackingCode === trackingCode);

      return {
        id: `missing-${trackingCode}-${index}`,
        trackingCode,
        orderCode: matchedExpected?.orderCode ?? "Chưa xác định",
        customerName: matchedExpected?.customerName ?? "Chưa xác định",
        volumetricWeight: 0,
        status: "missing",
        weight: 0,
        length: 0,
        width: 0,
        height: 0,
        extraFeeRmb: 0,
        declaredValue: 0,
        surcharge: 0,
        note: "Chưa nhập tại kho Việt Nam",
      };
    });

    return [...receivedPackages, ...missingRows];
  }, [expectedPackages, receivedPackages, summary.missingTrackingCodes]);

  const handleAddPackage = async () => {
    try {
      const values = await packageForm.validateFields();
      await onAddPackage(values);
      const matchedExpected = expectedPackages.find(
        (item) => item.trackingCode === values.trackingCode.trim(),
      );

      packageForm.resetFields();
      packageForm.setFieldsValue({
        extraFeeRmb: 0,
        declaredValue: 0,
        surcharge: 0,
        inspectionStatus: "inspected",
        orderCode: matchedExpected?.orderCode ?? "",
        customerName: matchedExpected?.customerName ?? "",
      });
      message.success(
        matchedExpected
          ? "Da them kien va so khop voi lo Trung Quoc."
          : "Da them kien thua khong nam trong lo Trung Quoc.",
      );
    } catch (error) {
      if (error instanceof Error && "errorFields" in error) {
        message.error("Vui lòng nhập đủ thông tin kiện hàng trước khi tiếp tục.");
      }
    }
  };

  const handleRemove = async (record: ReceivedPackageDraft) => {
    if (record.status === "missing") {
      return;
    }

    await onRemovePackage(record);
    message.success("Da xoa kien khoi danh sach nhap kho.");
  };

  const handleConfirm = async () => {
    await onConfirm();
  };

  const columns: ColumnsType<ReceivedPackageDraft> = [
    {
      title: "STT",
      key: "index",
      width: 70,
      render: (_, __, index) => index + 1,
    },
    {
      title: "Mã vận đơn",
      dataIndex: "trackingCode",
      key: "trackingCode",
      width: 180,
    },
    {
      title: "Ma don hang",
      dataIndex: "orderCode",
      key: "orderCode",
      width: 160,
    },
    {
      title: "Ten KH",
      dataIndex: "customerName",
      key: "customerName",
      width: 170,
    },
    {
      title: "KLQD",
      dataIndex: "volumetricWeight",
      key: "volumetricWeight",
      width: 110,
      render: (value: number) => value.toFixed(1),
    },
    {
      title: "Tinh trang",
      dataIndex: "status",
      key: "status",
      width: 130,
      render: (value: ReceivedPackageDraft["status"]) => getStatusTag(value),
    },
    {
      title: "Thao tac",
      key: "actions",
      width: 110,
      render: (_, record) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          disabled={record.status === "missing" || !record.receiptPackageId}
          loading={loading}
          onClick={() => void handleRemove(record)}
        />
      ),
    },
  ];

  const headerInfoItems = [
    { label: "KL lo hang (kg)", value: String(batchInfo.batchWeight) },
    { label: "KL go/bao tai (kg)", value: String(batchInfo.packagingWeight) },
    { label: "Chieu dai (cm)", value: String(batchInfo.length) },
    { label: "Chieu rong (cm)", value: String(batchInfo.width) },
    { label: "Chieu cao (cm)", value: String(batchInfo.height) },
    { label: "Dong goi", value: batchInfo.packagingType },
  ];

  return (
    <Modal
      title="Nhập kho Việt Nam"
      open={open}
      onCancel={onCancel}
      width={1230}
      destroyOnClose
      styles={{
        body: { padding: "12px 22px 20px" },
        footer: { padding: "14px 22px 18px", borderTop: "1px solid #f0f0f0" },
        header: { padding: "16px 22px", borderBottom: "1px solid #f0f0f0" },
      }}
      footer={
        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
          <Button icon={<CloseOutlined />} onClick={onCancel}>
            Hủy
          </Button>
          <Button loading={loading} onClick={() => void onRefresh()}>
            Lam moi du lieu
          </Button>
          {hasIssues ? (
            <Button
              danger
              icon={<ExclamationCircleOutlined />}
              loading={loading}
              onClick={() => void onMoveToErrorQueue()}
            >
              Chuyen cho xu ly loi
            </Button>
          ) : null}
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={hasIssues}
            loading={loading}
            onClick={() => void handleConfirm()}
          >
            Xác nhận nhập kho
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={18} style={{ width: "100%" }}>
        <div>
          <Title level={5} style={{ margin: 0, fontSize: 16 }}>
            Thông tin lô hàng: {batchInfo.batchCode}
          </Title>
        </div>

        <div style={{ ...sectionStyle, padding: 16 }}>
          <Row gutter={[14, 14]}>
            {headerInfoItems.map((item) => (
              <Col xs={24} md={12} xl={4} key={item.label}>
                <div>
                  <Text style={labelStyle}>{item.label}</Text>
                  <Input value={item.value} readOnly />
                </div>
              </Col>
            ))}
          </Row>
        </div>

        <div style={{ ...sectionStyle, padding: 0 }}>
          <div style={{ padding: "14px 16px 0" }}>
            <Title level={5} style={{ margin: 0, fontSize: 16 }}>
              Nhập thông số kiện hàng
            </Title>
          </div>

          <div style={{ padding: 16 }}>
            <Form<ReceivePackageFormValues & { inspectionStatus?: "inspected" | "damaged" }>
              form={packageForm}
              layout="vertical"
            >
              <Row gutter={[12, 12]}>
                <Col xs={24} lg={5}>
                  <div
                    style={{
                      height: 46,
                      border: "1px solid #d9e2f1",
                      borderRadius: 6,
                      display: "grid",
                      placeItems: "center",
                      color: "#344054",
                      fontWeight: 600,
                      background: "#f8fbff",
                      textAlign: "center",
                      padding: "0 12px",
                    }}
                  >
                    NHAP
                    <br />
                    MA VAN DON <span style={{ color: "#ff4d4f" }}>*</span>
                  </div>
                </Col>
                <Col xs={24} lg={19}>
                  <Form.Item
                    name="trackingCode"
                    style={{ marginBottom: 0 }}
                    rules={[{ required: true, message: "Vui lòng nhập mã vận đơn." }]}
                  >
                    <Input placeholder="Nhập mã vận đơn" style={{ height: 46 }} />
                  </Form.Item>
                </Col>

                <Col xs={24} md={8} xl={5}>
                  <Form.Item
                    label="Khoi luong (kg)"
                    name="weight"
                    rules={[{ required: true, message: "Vui lòng nhập khối lượng." }]}
                  >
                    <InputNumber style={{ width: "100%" }} min={0} placeholder="Nhập khối lượng" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8} xl={5}>
                  <Form.Item
                    label="Chieu dai (cm)"
                    name="length"
                    rules={[{ required: true, message: "Vui lòng nhập chiều dài." }]}
                  >
                    <InputNumber style={{ width: "100%" }} min={0} placeholder="Nhập chiều dài" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8} xl={5}>
                  <Form.Item
                    label="Chieu rong (cm)"
                    name="width"
                    rules={[{ required: true, message: "Vui lòng nhập chiều rộng." }]}
                  >
                    <InputNumber style={{ width: "100%" }} min={0} placeholder="Nhập chiều rộng" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8} xl={5}>
                  <Form.Item
                    label="Chieu cao (cm)"
                    name="height"
                    rules={[{ required: true, message: "Vui lòng nhập chiều cao." }]}
                  >
                    <InputNumber style={{ width: "100%" }} min={0} placeholder="Nhập chiều cao" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8} xl={4}>
                  <div>
                    <Text style={labelStyle}>KL quy doi</Text>
                    <Input value={volumetricWeight.toFixed(1)} readOnly />
                  </div>
                </Col>

                <Col xs={24} md={8} xl={5}>
                  <Form.Item label="Ma don hang" name="orderCode">
                    <Input placeholder="Nhập mã đơn hàng" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8} xl={5}>
                  <Form.Item label="Ten khach hang" name="customerName">
                    <Input placeholder="Nhập tên khách hàng" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8} xl={5}>
                  <Form.Item label="Chi phi phat sinh (RMB)" name="extraFeeRmb">
                    <InputNumber style={{ width: "100%" }} min={0} placeholder="Nhập chi phí" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8} xl={5}>
                  <Form.Item label="Gia co" name="declaredValue">
                    <InputNumber style={{ width: "100%" }} min={0} placeholder="Nhập phí gia cố" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8} xl={4}>
                  <Form.Item label="Tinh trang kien" name="inspectionStatus">
                    <Select
                      options={[
                        { label: "Da kiem", value: "inspected" },
                        { label: "Hu hong", value: "damaged" },
                      ]}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} xl={19}>
                  <Form.Item label="Ghi chú kho VN" name="note" style={{ marginBottom: 0 }}>
                    <Input placeholder="Nhập ghi chú (nếu có)" />
                  </Form.Item>
                </Col>
                <Col xs={24} xl={5} style={{ display: "flex", alignItems: "end" }}>
                  <Button type="primary" block style={{ height: 38 }} loading={loading} onClick={() => void handleAddPackage()}>
                    Tiep tuc
                  </Button>
                </Col>
              </Row>
            </Form>
          </div>
        </div>

        {summary.missingCount > 0 ? (
          <Alert type="warning" showIcon message={`Thieu ${summary.missingCount} kien so voi lo Trung Quoc`} />
        ) : null}

        {summary.extraCount > 0 ? (
          <Alert type="error" showIcon message="Co kien thua khong nam trong lo Trung Quoc" />
        ) : null}

        {apiSummary.damagedCount > 0 ? (
          <Alert type="info" showIcon message={`Co ${apiSummary.damagedCount} kien duoc danh dau hu hong`} />
        ) : null}

        {summary.missingCount === 0 && summary.extraCount === 0 ? (
          <Alert type="success" showIcon message="Thông tin lô hàng da khop, co the xac nhan nhap kho" />
        ) : null}

        <div style={{ ...sectionStyle, overflow: "hidden" }}>
          <Row gutter={0}>
            <Col xs={24} md={8}>
              <div style={infoCellStyle}>
                <Text strong>{`Da nhap kho: ${checkedPackages.length} kiện/${formatWeight(checkedWeight)}`}</Text>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div style={infoCellStyle}>
                <Text strong>{`Luu tam: ${Math.max(receivedPackages.length - checkedPackages.length, 0)} kiện/0kg`}</Text>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div style={{ ...infoCellStyle, borderRight: "none" }}>
                <Text strong>{`That lac: ${summary.missingCount} kien`}</Text>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div style={{ ...infoCellStyle, borderBottom: "none" }}>
                <Text strong>{`Tổng kiện có CPPS: ${chargeablePackages.length} kiện/${totalExtraFee.toFixed(2)} RMB`}</Text>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div style={{ ...infoCellStyle, borderBottom: "none" }}>
                <Text strong>{`Gia co nep bia: ${cardboardPackagingCount} kien`}</Text>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div style={{ ...infoCellStyle, borderRight: "none", borderBottom: "none" }}>
                <Text strong>{`Gia co dong go: ${woodPackagingCount} kien`}</Text>
              </div>
            </Col>
          </Row>
        </div>

        <div>
          <Title level={5} style={{ margin: "0 0 12px", fontSize: 16 }}>
            Danh sach kien hang da nhap kho
          </Title>
          <Table<ReceivedPackageDraft>
            rowKey="id"
            columns={columns}
            dataSource={tableData}
            pagination={false}
            bordered
            scroll={{ x: 860 }}
            size="middle"
            loading={loading}
          />
        </div>
      </Space>
    </Modal>
  );
};
