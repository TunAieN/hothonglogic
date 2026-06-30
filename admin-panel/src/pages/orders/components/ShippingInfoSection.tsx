import { useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined, EditOutlined, FileTextOutlined, PlusOutlined } from "@ant-design/icons";
import { OrderEditSectionCard } from "./OrderEditSectionCard";
import type { OrderItem } from "../../../types";
import type { SelectOption, ShippingEntryFormValue } from "../orderEditTypes";

const { Text } = Typography;

type ShippingInfoSectionProps = {
  shippingCompanyOptions: SelectOption[];
  packagingTypeOptions: SelectOption[];
  orderItems: OrderItem[];
  disabled?: boolean;
};

type ShippingEntryTableRow = {
  key: string;
  index: number;
  trackingCode: string;
  shippingCompanyLabel: string;
  parcelValue: number;
  packageNote: string;
};

type ModalState =
  | {
      index: number;
      isNew: boolean;
      snapshot: ShippingEntryFormValue | null;
    }
  | null;

const createDefaultShippingEntry = (): ShippingEntryFormValue => ({
  packageId: undefined,
  trackingCode: "",
  parcelValue: 0,
  shippingCompany: "vn-express",
  packagingType: "wooden-crating",
  packageNote: "",
  selectedItems: [],
});

const normalizeShippingEntry = (entry?: ShippingEntryFormValue): ShippingEntryFormValue => ({
  packageId: entry?.packageId,
  trackingCode: entry?.trackingCode ?? "",
  parcelValue: entry?.parcelValue ?? 0,
  shippingCompany: entry?.shippingCompany ?? "vn-express",
  packagingType: entry?.packagingType ?? "wooden-crating",
  packageNote: entry?.packageNote ?? "",
  selectedItems: [],
});

const isMeaningfulEntry = (entry?: ShippingEntryFormValue) =>
  Boolean(
    entry?.packageId ||
      entry?.trackingCode?.trim() ||
      entry?.packageNote?.trim() ||
      (entry?.parcelValue ?? 0) > 0,
  );

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatTrackingCode = (value?: string) => value?.trim() || "Chưa có";

const getShippingCompanyLabel = (value: string | undefined, options: SelectOption[]) =>
  options.find((option) => option.value === value)?.label ?? "Chưa chọn";

export const ShippingInfoSection = ({
  shippingCompanyOptions,
  packagingTypeOptions,
  orderItems,
  disabled = false,
}: ShippingInfoSectionProps) => {
  const { message } = App.useApp();
  const form = Form.useFormInstance();
  const watchedShippingEntries = Form.useWatch("shippingEntries", form) as
    | ShippingEntryFormValue[]
    | undefined;
  const shippingEntries = useMemo(
    () =>
      Array.isArray(watchedShippingEntries)
        ? watchedShippingEntries
        : ((form.getFieldValue("shippingEntries") as ShippingEntryFormValue[] | undefined) ?? []),
    [form, watchedShippingEntries],
  );
  const [modalState, setModalState] = useState<ModalState>(null);
  const [modalEntry, setModalEntry] = useState<ShippingEntryFormValue | null>(null);

  const currentEntryIndex = modalState?.index ?? null;

  const tableRows = useMemo<ShippingEntryTableRow[]>(
    () =>
      shippingEntries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => isMeaningfulEntry(entry))
        .map(({ entry, index }) => ({
          key: entry.packageId ?? `shipping-entry-${index}`,
          index,
          trackingCode: entry.trackingCode,
          shippingCompanyLabel: getShippingCompanyLabel(entry.shippingCompany, shippingCompanyOptions),
          parcelValue: Number(entry.parcelValue ?? 0),
          packageNote: entry.packageNote?.trim() ?? "",
        })),
    [shippingCompanyOptions, shippingEntries],
  );

  const getCurrentShippingEntries = () => {
    const currentValue = form.getFieldValue("shippingEntries") as
      | ShippingEntryFormValue[]
      | undefined;

    return Array.isArray(currentValue) ? currentValue : [];
  };

  const isDuplicateTrackingCode = (trackingCode: string, entryIndex: number) => {
    const normalized = trackingCode.trim().toLowerCase();

    if (!normalized) {
      return false;
    }

    return getCurrentShippingEntries().some((entry, index) => {
      if (index === entryIndex) {
        return false;
      }

      return entry.trackingCode.trim().toLowerCase() === normalized;
    });
  };

  const openCreateModal = (add: (defaultValue?: ShippingEntryFormValue, insertIndex?: number) => void) => {
    const nextEntry = createDefaultShippingEntry();
    const reusableIndex = getCurrentShippingEntries().findIndex((entry) => !isMeaningfulEntry(entry));

    if (reusableIndex >= 0) {
      form.setFieldValue(["shippingEntries", reusableIndex], nextEntry);
      setModalEntry(nextEntry);
      setModalState({ index: reusableIndex, isNew: true, snapshot: null });
      return;
    }

    add(nextEntry);
    setModalEntry(nextEntry);
    setModalState({ index: getCurrentShippingEntries().length, isNew: true, snapshot: null });
  };

  const openEditModal = (entryIndex: number) => {
    const entry = getCurrentShippingEntries()[entryIndex];

    if (!entry) {
      return;
    }

    const snapshot = normalizeShippingEntry(entry);
    setModalEntry(snapshot);
    setModalState({
      index: entryIndex,
      isNew: false,
      snapshot,
    });
  };

  const closeModal = () => {
    setModalState(null);
    setModalEntry(null);
  };

  const handleModalCancel = (remove: (index: number | number[]) => void) => {
    if (!modalState) {
      return;
    }

    if (modalState.isNew) {
      remove(modalState.index);
    } else if (modalState.snapshot) {
      form.setFieldValue(["shippingEntries", modalState.index], modalState.snapshot);
    }

    closeModal();
  };

  const handleModalSave = async () => {
    if (currentEntryIndex === null || !modalEntry) {
      return;
    }

    try {
      if (isDuplicateTrackingCode(modalEntry.trackingCode, currentEntryIndex)) {
        throw new Error("Tracking number đã tồn tại trong đơn hàng này.");
      }

      if (!modalEntry.shippingCompany) {
        throw new Error("Vui lòng chọn công ty chuyển phát.");
      }

      if (!modalEntry.packagingType) {
        throw new Error("Vui lòng chọn loại đóng gói.");
      }

      const normalizedEntry = normalizeShippingEntry(modalEntry);
      form.setFieldValue(["shippingEntries", currentEntryIndex], normalizedEntry);
      closeModal();
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    }
  };

  const columns: ColumnsType<ShippingEntryTableRow> = [
    {
      dataIndex: "trackingCode",
      key: "trackingCode",
      title: "Mã vận đơn",
      render: (value: string) => <Text strong>{formatTrackingCode(value)}</Text>,
    },
    {
      dataIndex: "shippingCompanyLabel",
      key: "shippingCompanyLabel",
      title: "Công ty chuyển phát",
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      dataIndex: "parcelValue",
      key: "parcelValue",
      title: "Giá trị kiện hàng RMB",
      width: 170,
      render: (value: number) => formatCurrency(value),
    },
    {
      dataIndex: "packageNote",
      key: "packageNote",
      title: "Ghi chú",
      render: (value: string) =>
        value ? <Text ellipsis={{ tooltip: value }}>{value}</Text> : <Text type="secondary">--</Text>,
    },
    {
      key: "actions",
      title: "Thao tác",
      width: 140,
      render: (_, record) => (
        <Space size="small">
          <Button
            disabled={disabled}
            icon={<EditOutlined />}
            onClick={() => openEditModal(record.index)}
            size="small"
            type="link"
          >
            Sửa
          </Button>
          <Popconfirm
            cancelText="Hủy"
            disabled={disabled}
            okText="Xóa"
            onConfirm={() => {
              const nextEntries = [...getCurrentShippingEntries()];
              nextEntries.splice(record.index, 1);
              form.setFieldValue("shippingEntries", nextEntries);
            }}
            title="Xóa mã vận đơn này?"
          >
            <Button danger disabled={disabled} icon={<DeleteOutlined />} size="small" type="link">
              Xóa
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <OrderEditSectionCard icon={<FileTextOutlined />} title="Thông tin kiện hàng / mã vận đơn">
      <Form.List name="shippingEntries">
        {(fields, { add, remove }) => (
          <Space orientation="vertical" size={18} style={{ width: "100%" }}>
            {fields.map(({ name }) => (
              <Form.Item hidden key={`shipping-entry-hidden-${name}`} name={["shippingEntries", name]}>
                <Input />
              </Form.Item>
            ))}

            <Alert
              description={`Mỗi tracking number tương ứng một lần shop phát hàng. Ở bước này chỉ khai báo tracking thuộc đơn hàng, chưa xác định item bên trong ${orderItems.length} sản phẩm của đơn.`}
              showIcon
              title="Quản lý mã vận đơn bằng bảng và modal."
              type="info"
            />

            {tableRows.length === 0 ? (
              <Card size="small">
                <Empty
                  description="Chưa có mã vận đơn nào. Bấm Thêm mã vận đơn để khai báo."
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              </Card>
            ) : (
              <Table<ShippingEntryTableRow>
                columns={columns}
                dataSource={tableRows}
                pagination={false}
                rowKey="key"
                size="small"
              />
            )}

            <Space align="center" style={{ justifyContent: "space-between", width: "100%" }} wrap>
              <Text type="secondary">
                Một order có thể có nhiều tracking number. Việc xác nhận item nào nằm trong tracking
                sẽ do kho Trung Quốc xử lý khi nhận hàng.
              </Text>
              <Button
                className="order-edit-add-tracking"
                disabled={disabled}
                icon={<PlusOutlined />}
                onClick={() => openCreateModal(add)}
              >
                Thêm mã vận đơn
              </Button>
            </Space>

            <Modal
              destroyOnHidden
              forceRender
              onCancel={() => handleModalCancel(remove)}
              onOk={handleModalSave}
              okText="Lưu mã vận đơn"
              open={currentEntryIndex !== null}
              title={modalState?.isNew ? "Thêm mã vận đơn" : "Sửa mã vận đơn"}
              width={860}
              cancelText="Hủy"
            >
              {modalEntry ? (
                <Space orientation="vertical" size={20} style={{ width: "100%" }}>
                  <Row align="middle" gutter={[20, 0]}>
                    <Col md={10} xs={24}>
                      <Form.Item
                        help={
                          currentEntryIndex !== null &&
                          isDuplicateTrackingCode(modalEntry.trackingCode, currentEntryIndex)
                            ? "Tracking number đã tồn tại trong đơn hàng này."
                            : undefined
                        }
                        label="Tracking Number"
                        validateStatus={
                          currentEntryIndex !== null &&
                          isDuplicateTrackingCode(modalEntry.trackingCode, currentEntryIndex)
                            ? "error"
                            : undefined
                        }
                      >
                        <Input
                          disabled={disabled}
                          onChange={(event) =>
                            setModalEntry((prev) =>
                              prev ? { ...prev, trackingCode: event.target.value } : prev,
                            )
                          }
                          placeholder="Nhập mã vận đơn sau khi shop phát hàng"
                          value={modalEntry.trackingCode}
                        />
                      </Form.Item>
                    </Col>
                    <Col md={8} xs={24}>
                      <Form.Item label="Giá trị kiện hàng RMB">
                        <Space.Compact style={{ width: "100%" }}>
                          <InputNumber
                            disabled={disabled}
                            min={0}
                            placeholder="0.00"
                            precision={2}
                            style={{ width: "100%" }}
                            value={modalEntry.parcelValue ?? 0}
                            onChange={(value) =>
                              setModalEntry((prev) =>
                                prev ? { ...prev, parcelValue: Number(value ?? 0) } : prev,
                              )
                            }
                          />
                          <Input disabled style={{ width: 72 }} value="RMB" />
                        </Space.Compact>
                      </Form.Item>
                    </Col>
                    <Col md={6} xs={24}>
                      <Form.Item
                        help={!modalEntry.shippingCompany ? "Vui lòng chọn công ty chuyển phát" : undefined}
                        label="Công ty chuyển phát"
                        validateStatus={!modalEntry.shippingCompany ? "error" : undefined}
                      >
                        <Select
                          disabled={disabled}
                          onChange={(value) =>
                            setModalEntry((prev) => (prev ? { ...prev, shippingCompany: value } : prev))
                          }
                          options={shippingCompanyOptions}
                          placeholder="Chọn đơn vị"
                          value={modalEntry.shippingCompany}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={[20, 0]}>
                    <Col md={10} xs={24}>
                      <Form.Item
                        help={!modalEntry.packagingType ? "Vui lòng chọn loại đóng gói" : undefined}
                        label="Loại đóng gói"
                        validateStatus={!modalEntry.packagingType ? "error" : undefined}
                      >
                        <Select
                          disabled={disabled}
                          onChange={(value) =>
                            setModalEntry((prev) => (prev ? { ...prev, packagingType: value } : prev))
                          }
                          options={packagingTypeOptions}
                          placeholder="Chọn loại đóng gói"
                          value={modalEntry.packagingType}
                        />
                      </Form.Item>
                    </Col>
                    <Col md={14} xs={24}>
                      <Form.Item label="Ghi chú kiện hàng">
                        <Input
                          disabled={disabled}
                          onChange={(event) =>
                            setModalEntry((prev) =>
                              prev ? { ...prev, packageNote: event.target.value } : prev,
                            )
                          }
                          placeholder="Ghi chú riêng cho kiện hàng hoặc mã vận đơn này"
                          value={modalEntry.packageNote}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Alert
                    type="info"
                    showIcon
                    message="Item trong tracking này chưa được khai báo ở bước đặt hàng. Kho Trung Quốc sẽ xác nhận khi nhận hàng thực tế."
                  />
                </Space>
              ) : null}
            </Modal>
          </Space>
        )}
      </Form.List>
    </OrderEditSectionCard>
  );
};
