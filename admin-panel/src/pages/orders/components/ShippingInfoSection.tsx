import { useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
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
import type {
  SelectOption,
  ShippingEntryFormValue,
  ShippingEntryItemSelectionFormValue,
} from "../orderEditTypes";

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
  productCount: number;
  totalQuantity: number;
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

const ITEM_LIST_STYLES = `
  .shipping-items-board {
    border: 1px solid #eee6dc;
    border-radius: 18px;
    overflow: hidden;
    background: #fffdfa;
  }

  .shipping-items-board-head,
  .shipping-items-board-row {
    display: grid;
    gap: 12px;
    grid-template-columns: minmax(0, 2.4fr) 110px 90px 90px 120px;
    align-items: center;
  }

  .shipping-items-board-head {
    background: #f8f2eb;
    color: #7a6d5b;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 12px 16px;
    text-transform: uppercase;
  }

  .shipping-items-board-row {
    cursor: pointer;
    padding: 14px 16px;
  }

  .shipping-items-board-row + .shipping-items-board-row {
    border-top: 1px solid #f1e8de;
  }

  .shipping-items-board-row.is-selected {
    background: #f2fbf5;
  }

  .shipping-item-pick {
    display: flex;
    gap: 10px;
    min-width: 0;
  }

  .shipping-item-check {
    align-items: flex-start;
    display: flex;
    padding-top: 2px;
  }

  .shipping-item-title {
    color: #0f172a;
    display: block;
    font-weight: 600;
    line-height: 1.45;
  }

  .shipping-item-subline {
    color: #8b7d69;
    display: block;
    font-size: 12px;
    margin-top: 4px;
  }

  .shipping-items-board-cell {
    color: #3f3a34;
    font-size: 13px;
  }

  .shipping-items-board .ant-input-number {
    min-height: 40px;
  }

  @media (max-width: 991px) {
    .shipping-items-board-head {
      display: none;
    }

    .shipping-items-board-row {
      grid-template-columns: 1fr;
    }
  }
`;

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
  selectedItems: entry?.selectedItems?.map((item) => ({ ...item })) ?? [],
});

const isMeaningfulEntry = (entry?: ShippingEntryFormValue) =>
  Boolean(
    entry?.packageId ||
      entry?.trackingCode?.trim() ||
      entry?.packageNote?.trim() ||
      (entry?.parcelValue ?? 0) > 0 ||
      (entry?.selectedItems?.length ?? 0) > 0,
  );

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatTrackingCode = (value?: string) => value?.trim() || "Chưa có";

const getShippingCompanyLabel = (value: string | undefined, options: SelectOption[]) =>
  options.find((option) => option.value === value)?.label ?? "Chưa chọn";

const calculateParcelValue = (
  selectedItems: ShippingEntryItemSelectionFormValue[],
  orderItems: OrderItem[],
) =>
  selectedItems.reduce((sum, selectedItem) => {
    const orderItem = orderItems.find((item) => String(item.id) === String(selectedItem.orderItemId));

    if (!orderItem) {
      return sum;
    }

    return sum + Number(orderItem.price_cny) * Number(selectedItem.quantity);
  }, 0);

const buildSelectedItemsMap = (selectedItems: ShippingEntryItemSelectionFormValue[]) =>
  new Map(selectedItems.map((item) => [String(item.orderItemId), item.quantity]));

const validateShippingEntryQuantities = (
  shippingEntries: ShippingEntryFormValue[],
  orderItems: OrderItem[],
) => {
  const availableQuantityByItemId = new Map(
    orderItems.map((item) => [String(item.id), Number(item.quantity)]),
  );
  const assignedQuantityByItemId = new Map<string, number>();

  shippingEntries.forEach((entry, entryIndex) => {
    entry.selectedItems.forEach((selectedItem) => {
      const orderItemId = String(selectedItem.orderItemId);
      const availableQuantity = availableQuantityByItemId.get(orderItemId);

      if (!availableQuantity) {
        throw new Error("Có sản phẩm không còn hợp lệ trong danh sách đơn hàng.");
      }

      if (Number(selectedItem.quantity) <= 0) {
        throw new Error(`Số lượng trong mã vận đơn ${entryIndex + 1} phải lớn hơn 0.`);
      }

      const nextAssignedQuantity =
        (assignedQuantityByItemId.get(orderItemId) ?? 0) + Number(selectedItem.quantity);

      if (nextAssignedQuantity > availableQuantity) {
        throw new Error("Tổng số lượng gán vào các mã vận đơn đang vượt quá số lượng mua.");
      }

      assignedQuantityByItemId.set(orderItemId, nextAssignedQuantity);
    });
  });
};

const PackageItemsSelector = ({
  disabled,
  onChange,
  orderItems,
  selectedItems,
}: {
  disabled: boolean;
  onChange: (nextSelectedItems: ShippingEntryItemSelectionFormValue[]) => void;
  orderItems: OrderItem[];
  selectedItems: ShippingEntryItemSelectionFormValue[];
}) => {
  const selectedItemsMap = buildSelectedItemsMap(selectedItems);

  const syncSelectedItems = (nextSelectedItems: ShippingEntryItemSelectionFormValue[]) => {
    onChange(
      nextSelectedItems.map((item) => ({
        orderItemId: String(item.orderItemId),
        quantity: Number(item.quantity),
      })),
    );
  };

  const toggleItemSelection = (orderItem: OrderItem) => {
    const orderItemId = String(orderItem.id);
    const isChecked = selectedItemsMap.has(orderItemId);

    if (!isChecked) {
      syncSelectedItems([
        ...selectedItems.filter((item) => String(item.orderItemId) !== orderItemId),
        {
          orderItemId,
          quantity: Number(orderItem.quantity || 1),
        },
      ]);
      return;
    }

    syncSelectedItems(selectedItems.filter((item) => String(item.orderItemId) !== orderItemId));
  };

  const updateSelectedQuantity = (orderItemId: string, quantity: number | null) => {
    syncSelectedItems(
      selectedItems.map((item) =>
        String(item.orderItemId) === String(orderItemId)
          ? { ...item, quantity: Math.max(1, Number(quantity ?? 1)) }
          : item,
      ),
    );
  };

  return (
    <>
      <style>{ITEM_LIST_STYLES}</style>
      <Card
        size="small"
        styles={{ body: { padding: 0 } }}
        style={{ background: "#fbfaf8", borderColor: "#eee6dc" }}
        title="Sản phẩm trong kiện hàng"
        extra={<Tag color="green">{selectedItems.length} đã chọn</Tag>}
      >
        <div className="shipping-items-board">
          <div className="shipping-items-board-head">
            <div>Sản phẩm</div>
            <div>Shop</div>
            <div>Đơn giá</div>
            <div>SL mua</div>
            <div>SL trong kiện</div>
          </div>

          {orderItems.map((orderItem) => {
            const orderItemId = String(orderItem.id);
            const selectedQuantity = selectedItemsMap.get(orderItemId);
            const isChecked = selectedQuantity !== undefined;

            return (
              <div
                className={`shipping-items-board-row${isChecked ? " is-selected" : ""}`}
                key={orderItemId}
                onClick={() => {
                  if (!disabled) {
                    toggleItemSelection(orderItem);
                  }
                }}
                onKeyDown={(event) => {
                  if (!disabled && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    toggleItemSelection(orderItem);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="shipping-item-pick">
                  <span
                    className="shipping-item-check"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <Checkbox
                      checked={isChecked}
                      disabled={disabled}
                      onChange={() => toggleItemSelection(orderItem)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="shipping-item-title">{orderItem.product_name}</span>
                    <span className="shipping-item-subline">
                      {orderItem.size || orderItem.color
                        ? [orderItem.size, orderItem.color].filter(Boolean).join(" | ")
                        : "Không có phân loại"}
                    </span>
                  </span>
                </div>
                <div className="shipping-items-board-cell">
                  {orderItem.shop_name ?? orderItem.seller ?? "Chưa rõ"}
                </div>
                <div className="shipping-items-board-cell">{formatCurrency(orderItem.price_cny)}</div>
                <div className="shipping-items-board-cell">{orderItem.quantity}</div>
                <div>
                  <InputNumber
                    disabled={disabled || !isChecked}
                    max={Number(orderItem.quantity)}
                    min={1}
                    onChange={(value) => updateSelectedQuantity(orderItemId, value)}
                    onClick={(event) => event.stopPropagation()}
                    style={{ width: "100%" }}
                    value={selectedQuantity ?? undefined}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
};

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
  const shippingEntries = Array.isArray(watchedShippingEntries)
    ? watchedShippingEntries
    : ((form.getFieldValue("shippingEntries") as ShippingEntryFormValue[] | undefined) ?? []);
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
          productCount: entry.selectedItems.length,
          totalQuantity: entry.selectedItems.reduce((sum, item) => sum + Number(item.quantity), 0),
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

      if (modalEntry.selectedItems.length === 0) {
        throw new Error("Vui lòng chọn ít nhất 1 sản phẩm cho mã vận đơn này.");
      }

      const normalizedEntry = normalizeShippingEntry({
        ...modalEntry,
        parcelValue: calculateParcelValue(modalEntry.selectedItems, orderItems),
      });

      const nextEntries = [...getCurrentShippingEntries()];
      nextEntries[currentEntryIndex] = normalizedEntry;
      validateShippingEntryQuantities(nextEntries, orderItems);
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
      dataIndex: "productCount",
      key: "productCount",
      title: "Số sản phẩm",
      width: 120,
    },
    {
      dataIndex: "totalQuantity",
      key: "totalQuantity",
      title: "Tổng số lượng",
      width: 130,
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
              description="Mỗi tracking number tương ứng một lần shop phát hàng. Bấm Thêm mã vận đơn để khai báo hoặc Sửa để cập nhật chi tiết kiện hàng."
              showIcon
              title="Quản lý mã vận đơn gọn hơn bằng bảng và modal."
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
                Một order có thể có nhiều tracking number. Mỗi tracking phải gắn đúng sản phẩm và số lượng thuộc kiện đó.
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
              width={1000}
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
                            disabled
                            min={0}
                            placeholder="0.00"
                            precision={2}
                            style={{ width: "100%" }}
                            value={calculateParcelValue(modalEntry.selectedItems, orderItems)}
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

                  <PackageItemsSelector
                    disabled={disabled}
                    onChange={(nextSelectedItems) =>
                      setModalEntry((prev) =>
                        prev
                          ? {
                              ...prev,
                              parcelValue: calculateParcelValue(nextSelectedItems, orderItems),
                              selectedItems: nextSelectedItems,
                            }
                          : prev,
                      )
                    }
                    orderItems={orderItems}
                    selectedItems={modalEntry.selectedItems}
                  />
                  {modalEntry.selectedItems.length === 0 ? (
                    <Text type="danger">Vui lòng chọn ít nhất 1 sản phẩm cho mã vận đơn này.</Text>
                  ) : null}
                </Space>
              ) : null}
            </Modal>
          </Space>
        )}
      </Form.List>
    </OrderEditSectionCard>
  );
};
