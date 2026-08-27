import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { CheckOutlined, EyeOutlined } from "@ant-design/icons";
import type { CnPackage } from "../../shared/types";
import { formatWeight } from "./helpers";
import type { BatchViewModel } from "./types";

const { Text, Title } = Typography;

export type DispatchBatchInput = {
  reviewed_package_ids: string[];
  destination_warehouse_name: string;
  shipping_type: "fast" | "normal";
  packaging_type: "bag" | "carton" | "cardboard" | "wood";
  transport_container_count: number;
  actual_batch_weight: number;
  package_material_weight: number;
  actual_length: number;
  actual_width: number;
  actual_height: number;
  carrier_name: string;
  transport_code?: string | null;
  route_name?: string | null;
  vehicle_plate?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  freight_cost?: number | null;
  departed_at: string;
  expected_arrival_at: string;
  dispatch_note?: string | null;
};

type DispatchFormValues = {
  confirmedPackages: boolean;
  confirmedNoIssues: boolean;
  destinationWarehouseName: string;
  shippingType: "fast" | "normal";
  packagingType: "bag" | "carton" | "cardboard" | "wood";
  transportContainerCount: number;
  actualBatchWeight: number;
  packageMaterialWeight: number;
  actualLength: number;
  actualWidth: number;
  actualHeight: number;
  carrierName: string;
  transportCode?: string;
  routeName?: string;
  vehiclePlate?: string;
  driverName?: string;
  driverPhone?: string;
  freightCost?: number;
  departedAt: Dayjs;
  expectedArrivalAt: Dayjs;
  dispatchNote?: string;
};

type Props = {
  batch: BatchViewModel | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (input: DispatchBatchInput) => Promise<void>;
};

const stepFields: Array<Array<keyof DispatchFormValues>> = [
  ["confirmedPackages", "confirmedNoIssues"],
  [
    "packagingType",
    "transportContainerCount",
    "actualBatchWeight",
    "packageMaterialWeight",
    "actualLength",
    "actualWidth",
    "actualHeight",
  ],
  ["destinationWarehouseName", "shippingType", "carrierName", "departedAt", "expectedArrivalAt"],
  [],
];

const packageIssues = (pkg: CnPackage) => {
  const issues: string[] = [];

  if (!pkg.tracking_number?.trim()) issues.push("Thiếu mã vận đơn");
  if (Number(pkg.weight ?? 0) <= 0) issues.push("Thiếu cân nặng");
  if (pkg.status !== "matched") issues.push("Chưa khớp đơn hàng");
  if (!(pkg.package_items?.length ?? 0)) issues.push("Chưa xác nhận item");

  return issues;
};

export const DispatchBatchModal = ({ batch, loading, onCancel, onSubmit }: Props) => {
  const [form] = Form.useForm<DispatchFormValues>();
  const [currentStep, setCurrentStep] = useState(0);
  const [itemDetailPackage, setItemDetailPackage] = useState<CnPackage | null>(null);
  const [reviewedPackageIds, setReviewedPackageIds] = useState<string[]>([]);
  const watchedDestination = Form.useWatch("destinationWarehouseName", form);
  const watchedCarrierName = Form.useWatch("carrierName", form);

  const invalidPackages = useMemo(
    () => batch?.packages.filter((pkg) => packageIssues(pkg).length > 0) ?? [],
    [batch],
  );

  useEffect(() => {
    if (!batch) return;

    setCurrentStep(0);
    setItemDetailPackage(null);
    setReviewedPackageIds([]);
    form.setFieldsValue({
      confirmedPackages: false,
      confirmedNoIssues: false,
      destinationWarehouseName: batch.receivingWarehouseName,
      shippingType: batch.shippingType,
      packagingType: "bag",
      transportContainerCount: 1,
      actualBatchWeight: batch.totalWeight,
      packageMaterialWeight: 0,
      carrierName: "",
      departedAt: dayjs(),
      expectedArrivalAt: dayjs().add(batch.shippingType === "fast" ? 3 : 7, "day"),
    });
  }, [batch, form]);

  const columns: ColumnsType<CnPackage> = [
    { title: "Mã vận đơn", dataIndex: "tracking_number", key: "tracking_number", width: 170 },
    {
      title: "Đơn hàng",
      key: "order",
      width: 150,
      render: (_, pkg) => pkg.order?.order_code ?? "Chưa liên kết",
    },
    {
      title: "Item đã xác nhận",
      key: "items",
      width: 140,
      render: (_, pkg) => {
        const quantity = (pkg.package_items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
        return `${pkg.package_items?.length ?? 0} dòng / ${quantity} SP`;
      },
    },
    {
      title: "Kiểm tra item",
      key: "item_review",
      width: 150,
      render: (_, pkg) => {
        const reviewed = reviewedPackageIds.includes(String(pkg.id));
        const hasItems = (pkg.package_items?.length ?? 0) > 0;

        return (
          <Button
            type={reviewed ? "default" : "link"}
            size="small"
            icon={reviewed ? <CheckOutlined /> : <EyeOutlined />}
            disabled={!hasItems}
            onClick={() => setItemDetailPackage(pkg)}
          >
            {reviewed ? "Đã kiểm" : hasItems ? "Kiểm tra" : "Chưa có item"}
          </Button>
        );
      },
    },
    {
      title: "Cân nặng",
      dataIndex: "weight",
      key: "weight",
      width: 110,
      render: (value) => formatWeight(value),
    },
    {
      title: "Kết quả kiểm tra",
      key: "readiness",
      render: (_, pkg) => {
        const issues = packageIssues(pkg);
        return issues.length ? (
          <Space wrap size={[4, 4]}>{issues.map((issue) => <Tag color="error" key={issue}>{issue}</Tag>)}</Space>
        ) : <Tag color="success">Sẵn sàng</Tag>;
      },
    },
  ];

  const allPackagesReviewed = Boolean(
    batch?.packages.length && batch.packages.every((pkg) => reviewedPackageIds.includes(String(pkg.id))),
  );

  const confirmPackageItemReview = () => {
    if (!itemDetailPackage) return;

    setReviewedPackageIds((current) =>
      current.includes(String(itemDetailPackage.id))
        ? current
        : [...current, String(itemDetailPackage.id)],
    );
    setItemDetailPackage(null);
  };

  const itemColumns: ColumnsType<NonNullable<CnPackage["package_items"]>[number]> = [
    {
      title: "STT",
      key: "index",
      width: 60,
      render: (_, __, index) => index + 1,
    },
    {
      title: "Sản phẩm",
      key: "product_name",
      render: (_, item) => item.order_item?.product_name ?? `Item #${item.order_item_id}`,
    },
    {
      title: "Phân loại",
      key: "variant",
      width: 200,
      render: (_, item) => {
        const variant = [item.order_item?.color, item.order_item?.size].filter(Boolean).join(" / ");
        return variant || "Không có phân loại";
      },
    },
    {
      title: "Số lượng trong kiện",
      dataIndex: "quantity",
      key: "quantity",
      width: 160,
      align: "center",
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 180,
      render: () => <Tag color="success">Đã xác nhận tại kho TQ</Tag>,
    },
  ];

  const handleNext = async () => {
    try {
      await form.validateFields(stepFields[currentStep]);
      setCurrentStep((step) => Math.min(step + 1, 3));
    } catch {
      // Ant Design renders the field-level validation messages.
    }
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();

    if (values.expectedArrivalAt.isSame(values.departedAt) || values.expectedArrivalAt.isBefore(values.departedAt)) {
      form.setFields([{ name: "expectedArrivalAt", errors: ["Ngày đến dự kiến phải sau thời gian xuất kho."] }]);
      setCurrentStep(2);
      return;
    }

    await onSubmit({
      reviewed_package_ids: reviewedPackageIds,
      destination_warehouse_name: values.destinationWarehouseName.trim(),
      shipping_type: values.shippingType,
      packaging_type: values.packagingType,
      transport_container_count: values.transportContainerCount,
      actual_batch_weight: values.actualBatchWeight,
      package_material_weight: values.packageMaterialWeight ?? 0,
      actual_length: values.actualLength,
      actual_width: values.actualWidth,
      actual_height: values.actualHeight,
      carrier_name: values.carrierName.trim(),
      transport_code: values.transportCode?.trim() || null,
      route_name: values.routeName?.trim() || null,
      vehicle_plate: values.vehiclePlate?.trim() || null,
      driver_name: values.driverName?.trim() || null,
      driver_phone: values.driverPhone?.trim() || null,
      freight_cost: values.freightCost ?? null,
      departed_at: values.departedAt.format("YYYY-MM-DD HH:mm:ss"),
      expected_arrival_at: values.expectedArrivalAt.format("YYYY-MM-DD HH:mm:ss"),
      dispatch_note: values.dispatchNote?.trim() || null,
    });
  };

  const positiveRule = (label: string) => ({
    validator: (_: unknown, value?: number) =>
      Number(value ?? 0) > 0 ? Promise.resolve() : Promise.reject(new Error(`${label} phải lớn hơn 0.`)),
  });

  return (
    <Modal
      title={batch ? `Xuất kho Trung Quốc — ${batch.batchCode}` : "Xuất kho Trung Quốc"}
      open={Boolean(batch)}
      onCancel={onCancel}
      width={1050}
      destroyOnClose
      maskClosable={false}
      footer={
        <Space>
          <Button onClick={onCancel}>Hủy</Button>
          {currentStep > 0 ? <Button onClick={() => setCurrentStep((step) => step - 1)}>Quay lại</Button> : null}
          {currentStep < 3 ? (
            <Button
              type="primary"
              disabled={currentStep === 0 && (invalidPackages.length > 0 || !allPackagesReviewed)}
              onClick={() => void handleNext()}
            >
              Tiếp tục
            </Button>
          ) : (
            <Button type="primary" danger loading={loading} onClick={() => void handleSubmit()}>
              Xác nhận bàn giao và xuất kho
            </Button>
          )}
        </Space>
      }
    >
      {batch ? (
        <Form<DispatchFormValues> form={form} layout="vertical">
          <Steps
            current={currentStep}
            size="small"
            items={[
              { title: "Kiểm tra lô" },
              { title: "Đóng gói" },
              { title: "Vận chuyển" },
              { title: "Bàn giao" },
            ]}
            style={{ marginBottom: 24 }}
          />

          <div style={{ display: currentStep === 0 ? "block" : "none" }}>
            <Descriptions bordered size="small" column={4} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Kho xuất">{batch.originWarehouseName}</Descriptions.Item>
              <Descriptions.Item label="Kho nhận">{batch.receivingWarehouseName}</Descriptions.Item>
              <Descriptions.Item label="Số kiện">{batch.totalPackages}</Descriptions.Item>
              <Descriptions.Item label="Tổng cân nặng">{formatWeight(batch.totalWeight)}</Descriptions.Item>
            </Descriptions>
            {invalidPackages.length ? (
              <Alert
                type="error"
                showIcon
                message={`${invalidPackages.length} kiện chưa đủ điều kiện xuất kho`}
                description="Hãy quay lại kho Trung Quốc để bổ sung mã vận đơn, cân nặng, đối soát đơn hàng và chi tiết item."
                style={{ marginBottom: 16 }}
              />
            ) : (
              <Alert type="success" showIcon message="Tất cả kiện và item đã đủ điều kiện xuất kho." style={{ marginBottom: 16 }} />
            )}
            <Alert
              type={allPackagesReviewed ? "success" : "warning"}
              showIcon
              message={`Đã kiểm item ${reviewedPackageIds.length}/${batch.packages.length} mã vận đơn`}
              description={
                allPackagesReviewed
                  ? "Đã mở và xác nhận item của tất cả mã vận đơn."
                  : "Mở nút Kiểm tra trên từng mã vận đơn và xác nhận danh sách item trước khi tiếp tục."
              }
              style={{ marginBottom: 16 }}
            />
            <Table rowKey="id" columns={columns} dataSource={batch.packages} pagination={false} size="small" scroll={{ x: 980 }} />
            <Space direction="vertical" style={{ marginTop: 16 }}>
              <Form.Item name="confirmedPackages" valuePropName="checked" noStyle rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("Cần xác nhận danh sách kiện.")) }]}>
                <Checkbox disabled={invalidPackages.length > 0}>Tôi đã kiểm tra đủ mã vận đơn và số kiện trong lô.</Checkbox>
              </Form.Item>
              <Form.Item name="confirmedNoIssues" valuePropName="checked" noStyle rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("Cần xác nhận tình trạng kiện.")) }]}>
                <Checkbox disabled={invalidPackages.length > 0}>Không còn kiện đang chờ xử lý sai lệch hoặc hư hỏng.</Checkbox>
              </Form.Item>
            </Space>
          </div>

          <div style={{ display: currentStep === 1 ? "block" : "none" }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div>
                <Title level={5} style={{ margin: "0 0 6px" }}>Thông tin đóng lô</Title>
                <Text type="secondary">Nhập số liệu sau khi đã gom và đóng gói hoàn chỉnh.</Text>
              </div>

              <Alert
                type="info"
                showIcon
                message={`Lô có ${batch.totalPackages} kiện — tổng cân nặng kiện ${formatWeight(batch.totalWeight)}`}
              />

              <Card size="small" title="Đóng gói và cân nặng" styles={{ body: { paddingBottom: 0 } }}>
                <Row gutter={[20, 0]}>
                  <Col xs={24} md={12}>
                    <Form.Item label="Hình thức đóng gói" name="packagingType" rules={[{ required: true }]}>
                      <Select options={[{ label: "Bao tải", value: "bag" }, { label: "Thùng carton", value: "carton" }, { label: "Nẹp bìa", value: "cardboard" }, { label: "Đóng gỗ", value: "wood" }]} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Số bao/thùng vận chuyển" name="transportContainerCount" rules={[positiveRule("Số bao/thùng")] }>
                      <InputNumber min={1} precision={0} placeholder="Nhập số bao hoặc thùng" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Khối lượng lô thực tế (kg)" name="actualBatchWeight" rules={[positiveRule("Khối lượng lô")] }>
                      <InputNumber min={0} precision={2} placeholder="Nhập khối lượng lô" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Khối lượng vật liệu đóng gói (kg)" name="packageMaterialWeight" rules={[{ type: "number", min: 0 }]}>
                      <InputNumber min={0} precision={2} placeholder="Nhập khối lượng bao, thùng hoặc gỗ" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card size="small" title="Kích thước lô sau đóng gói" styles={{ body: { paddingBottom: 0 } }}>
                <Row gutter={[20, 0]}>
                  <Col xs={24} md={8}>
                    <Form.Item label="Chiều dài (cm)" name="actualLength" rules={[positiveRule("Chiều dài")] }>
                      <InputNumber min={0} precision={2} placeholder="Chiều dài" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="Chiều rộng (cm)" name="actualWidth" rules={[positiveRule("Chiều rộng")] }>
                      <InputNumber min={0} precision={2} placeholder="Chiều rộng" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="Chiều cao (cm)" name="actualHeight" rules={[positiveRule("Chiều cao")] }>
                      <InputNumber min={0} precision={2} placeholder="Chiều cao" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Space>
          </div>

          <div style={{ display: currentStep === 2 ? "block" : "none" }}>
            <Title level={5}>Thông tin đơn vị và hành trình vận chuyển</Title>
            <Row gutter={[16, 0]}>
              <Col xs={24} md={8}><Form.Item label="Kho nhận tại Việt Nam" name="destinationWarehouseName" rules={[{ required: true, message: "Vui lòng nhập kho nhận." }]}><Input /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="Loại vận chuyển" name="shippingType" rules={[{ required: true }]}><Select options={[{ label: "Nhanh", value: "fast" }, { label: "Thường", value: "normal" }]} /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="Đơn vị vận chuyển" name="carrierName" rules={[{ required: true, message: "Vui lòng nhập đơn vị vận chuyển." }]}><Input /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="Mã chuyến/mã vận chuyển" name="transportCode"><Input /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="Tuyến/cửa khẩu" name="routeName"><Input /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="Biển số xe" name="vehiclePlate"><Input /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="Tài xế/người nhận bàn giao" name="driverName"><Input /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="Số điện thoại" name="driverPhone"><Input /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item label="Chi phí vận chuyển (RMB)" name="freightCost"><InputNumber min={0} precision={2} placeholder="Nhập chi phí" style={{ width: "100%" }} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Thời gian xuất kho" name="departedAt" rules={[{ required: true }]}><DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Ngày đến dự kiến" name="expectedArrivalAt" rules={[{ required: true }]}><DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} /></Form.Item></Col>
            </Row>
          </div>

          <div style={{ display: currentStep === 3 ? "block" : "none" }}>
            <Alert
              type="warning"
              showIcon
              message="Sau khi bàn giao, danh sách kiện sẽ bị khóa và lô chuyển sang Đang vận chuyển."
              description="Hệ thống sẽ lưu snapshot toàn bộ mã vận đơn và item để kho Việt Nam đối chiếu khi nhận hàng."
              style={{ marginBottom: 16 }}
            />
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Mã lô">{batch.batchCode}</Descriptions.Item>
              <Descriptions.Item label="Số kiện/item">{batch.totalPackages} kiện / {batch.packages.reduce((sum, pkg) => sum + (pkg.package_items?.reduce((qty, item) => qty + item.quantity, 0) ?? 0), 0)} sản phẩm</Descriptions.Item>
              <Descriptions.Item label="Kho xuất">{batch.originWarehouseName}</Descriptions.Item>
              <Descriptions.Item label="Kho nhận">{watchedDestination}</Descriptions.Item>
              <Descriptions.Item label="Đơn vị vận chuyển">{watchedCarrierName}</Descriptions.Item>
            </Descriptions>
            <Form.Item label="Ghi chú bàn giao" name="dispatchNote"><Input.TextArea rows={4} placeholder="Ghi chú tình trạng lô, chứng từ hoặc yêu cầu vận chuyển..." /></Form.Item>
            <Text type="secondary">Người thao tác và thời gian bàn giao được hệ thống ghi tự động.</Text>
          </div>
        </Form>
      ) : null}

      <Modal
        title={itemDetailPackage ? `Kiểm tra item — ${itemDetailPackage.tracking_number}` : "Kiểm tra item"}
        open={Boolean(itemDetailPackage)}
        onCancel={() => setItemDetailPackage(null)}
        width={820}
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={() => setItemDetailPackage(null)}>Đóng</Button>,
          <Button key="confirm" type="primary" icon={<CheckOutlined />} onClick={confirmPackageItemReview}>
            Xác nhận đã kiểm item
          </Button>,
        ]}
      >
        {itemDetailPackage ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions bordered size="small" column={3}>
              <Descriptions.Item label="Mã vận đơn">{itemDetailPackage.tracking_number}</Descriptions.Item>
              <Descriptions.Item label="Mã đơn hàng">{itemDetailPackage.order?.order_code ?? "Chưa liên kết"}</Descriptions.Item>
              <Descriptions.Item label="Khách hàng">{itemDetailPackage.order?.customer?.name ?? "Chưa xác định"}</Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="id"
              columns={itemColumns}
              dataSource={itemDetailPackage.package_items ?? []}
              pagination={false}
              bordered
              size="small"
              scroll={{ x: 720 }}
            />
            <Alert
              type="info"
              showIcon
              message="Đối chiếu tên sản phẩm, màu/size và số lượng trước khi xác nhận."
            />
          </Space>
        ) : null}
      </Modal>
    </Modal>
  );
};
