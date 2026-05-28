import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  FileTextOutlined,
  PlusOutlined,
} from "@ant-design/icons";
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
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

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

  .shipping-items-board-row,
  .shipping-items-board-row * {
    pointer-events: auto;
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

const buildSelectedItemsMap = (selectedItems: ShippingEntryItemSelectionFormValue[] | undefined) =>
  new Map((selectedItems ?? []).map((item) => [String(item.orderItemId), item.quantity]));

const calculateParcelValue = (
  selectedItems: ShippingEntryItemSelectionFormValue[],
  orderItems: OrderItem[],
) =>
  selectedItems.reduce((sum, selectedItem) => {
    const orderItem = orderItems.find(
      (item) => String(item.id) === String(selectedItem.orderItemId),
    );

    if (!orderItem) {
      return sum;
    }

    return sum + Number(orderItem.price_cny) * Number(selectedItem.quantity);
  }, 0);

const HiddenSelectedItemsField = ({ value }: { value?: ShippingEntryItemSelectionFormValue[] }) => (
  <input readOnly type="hidden" value={JSON.stringify(value ?? [])} />
);

const PackageItemsSelector = ({
  entryIndex,
  orderItems,
}: {
  entryIndex: number;
  orderItems: OrderItem[];
}) => {
  const form = Form.useFormInstance();
  const watchedSelectedItems =
    (Form.useWatch(
      ["shippingEntries", entryIndex, "selectedItems"],
      form,
    ) as ShippingEntryItemSelectionFormValue[] | undefined) ?? [];
  const selectedItems = watchedSelectedItems ?? [];
  const [localSelectedItems, setLocalSelectedItems] =
    useState<ShippingEntryItemSelectionFormValue[]>(selectedItems);

  useEffect(() => {
    setLocalSelectedItems(selectedItems);
  }, [JSON.stringify(selectedItems)]);
  const selectedItemsMap = buildSelectedItemsMap(localSelectedItems);

  const syncSelectedItems = (nextSelectedItems: ShippingEntryItemSelectionFormValue[]) => {
    const normalizedItems = nextSelectedItems.map((item) => ({
      orderItemId: String(item.orderItemId),
      quantity: Number(item.quantity),
    }));

    setLocalSelectedItems(normalizedItems);

    form.setFields([
      {
        name: ["shippingEntries", entryIndex, "selectedItems"],
        value: normalizedItems,
      },
      {
        name: ["shippingEntries", entryIndex, "parcelValue"],
        value: calculateParcelValue(normalizedItems, orderItems),
      },
    ]);

    form
      .validateFields([["shippingEntries", entryIndex, "selectedItems"]])
      .catch(() => undefined);
  };

  const toggleItemSelection = (orderItem: OrderItem) => {
    const orderItemId = String(orderItem.id);
    const isChecked = selectedItemsMap.has(orderItemId);

    console.log("CLICK ITEM", orderItem.id, orderItem.product_name);
    console.log("BEFORE", localSelectedItems);

    if (!isChecked) {
      const nextSelectedItems = [
        ...localSelectedItems.filter((item) => String(item.orderItemId) !== orderItemId),
        {
          orderItemId,
          quantity: Number(orderItem.quantity || 1),
        },
      ];

      console.log("AFTER", nextSelectedItems);
      syncSelectedItems(nextSelectedItems);
      return;
    }

    const nextSelectedItems = localSelectedItems.filter(
      (item) => String(item.orderItemId) !== orderItemId,
    );
    console.log("AFTER", nextSelectedItems);
    syncSelectedItems(nextSelectedItems);
  };

  const updateSelectedQuantity = (orderItemId: string, quantity: number | null) => {
    const normalizedQuantity = Math.max(1, Number(quantity ?? 1));
    const nextSelectedItems = localSelectedItems.map((item) =>
      String(item.orderItemId) === String(orderItemId)
        ? {
            ...item,
            quantity: normalizedQuantity,
          }
        : item,
    );

    syncSelectedItems(nextSelectedItems);
  };

  return (
    <>
      <style>{ITEM_LIST_STYLES}</style>
      <Card
        size="small"
        styles={{ body: { padding: 0 } }}
        style={{ background: "#fbfaf8", borderColor: "#eee6dc" }}
        title="San pham trong kien hang"
        extra={<Tag color="green">{localSelectedItems.length} da chon</Tag>}
      >
        <div className="shipping-items-board">
          <div className="shipping-items-board-head">
            <div>San pham</div>
            <div>Shop</div>
            <div>Don gia</div>
            <div>SL mua</div>
            <div>SL trong kien</div>
          </div>

          {orderItems.map((orderItem) => {
            const orderItemId = String(orderItem.id);
            const selectedQuantity = selectedItemsMap.get(orderItemId);
            const isChecked = selectedQuantity !== undefined;

            return (
              <div
                className={`shipping-items-board-row${isChecked ? " is-selected" : ""}`}
                key={orderItemId}
                onClick={() => toggleItemSelection(orderItem)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleItemSelection(orderItem);
                  }
                }}
              >
                <div>
                  <div className="shipping-item-pick">
                    <span
                      className="shipping-item-check"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      <Checkbox
                        checked={isChecked}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleItemSelection(orderItem)}
                      />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="shipping-item-title">{orderItem.product_name}</span>
                      <span className="shipping-item-subline">
                        {orderItem.size || orderItem.color
                          ? [orderItem.size, orderItem.color].filter(Boolean).join(" | ")
                          : "Khong co phan loai"}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="shipping-items-board-cell">
                  {orderItem.shop_name ?? orderItem.seller ?? "Chua ro"}
                </div>
                <div className="shipping-items-board-cell">{formatCurrency(orderItem.price_cny)}</div>
                <div className="shipping-items-board-cell">{orderItem.quantity}</div>
                <div>
                  <InputNumber
                    min={1}
                    max={Number(orderItem.quantity)}
                    disabled={!isChecked}
                    style={{ width: "100%" }}
                    value={selectedQuantity ?? undefined}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(value) => updateSelectedQuantity(orderItemId, value)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 16px" }}>
          {localSelectedItems.length === 0 ? (
            <Text type="danger">Vui long chon it nhat 1 san pham cho ma van don nay.</Text>
          ) : (
            <Text type="secondary">Bam vao dong san pham de chon/bo chon nhanh cho kien hang nay.</Text>
          )}
        </div>
      </Card>
    </>
  );
};

export const ShippingInfoSection = ({
  shippingCompanyOptions,
  packagingTypeOptions,
  orderItems,
}: ShippingInfoSectionProps) => {
  const shippingEntries = Form.useWatch("shippingEntries") as ShippingEntryFormValue[] | undefined;
  const hasTrackingNumber = (shippingEntries ?? []).some((entry) => entry?.trackingCode?.trim());

  return (
    <OrderEditSectionCard icon={<FileTextOutlined />} title="Order Shipping Info">
      <Space direction="vertical" size={18} style={{ width: "100%" }}>
        <div className="order-edit-tip-banner">
          Moi Tracking Number la mot kien hang hoac mot lan shop phat hang. Gia tri khai bao o day la gia
          tri cua rieng kien theo ma van don nay, khong phai tong gia tri toan bo order.
        </div>
        {!hasTrackingNumber ? (
          <Text type="secondary" className="order-edit-muted-note">
            Chua co ma van don
          </Text>
        ) : null}

        <Form.List name="shippingEntries">
          {(fields, { add, remove }) => (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              {fields.map((field) => (
                <Card key={field.key} size="small" styles={{ body: { padding: 18 } }}>
                  <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    <Form.Item {...field} hidden name={[field.name, "packageId"]}>
                      <Input />
                    </Form.Item>
                    <Form.Item
                      hidden
                      initialValue={[]}
                      name={[field.name, "selectedItems"]}
                      rules={[
                        {
                          validator: (_, value) => {
                            if (!value || value.length === 0) {
                              return Promise.reject(
                                new Error("Vui long chon it nhat 1 san pham cho ma van don nay."),
                              );
                            }

                            return Promise.resolve();
                          },
                        },
                      ]}
                    >
                      <HiddenSelectedItemsField />
                    </Form.Item>
                    <Row gutter={[20, 0]} align="middle">
                      <Col xs={24} md={10}>
                        <Form.Item
                          {...field}
                          label="Tracking Number"
                          name={[field.name, "trackingCode"]}
                        >
                          <Input placeholder="Nhap ma van don sau khi shop phat hang" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item
                          {...field}
                          label="Gia tri kien hang nay (RMB)"
        
                          name={[field.name, "parcelValue"]}
                        >
                          <InputNumber
                            disabled
                            min={0}
                            precision={2}
                            style={{ width: "100%" }}
                            addonAfter="RMB"
                            placeholder="0.00"
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          {...field}
                          label="Cong ty chuyen phat"
                          name={[field.name, "shippingCompany"]}
                          rules={[{ required: true, message: "Vui long chon cong ty chuyen phat" }]}
                        >
                          <Select options={shippingCompanyOptions} placeholder="Chon don vi" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={[20, 0]}>
                      <Col xs={24} md={10}>
                        <Form.Item
                          {...field}
                          label="Loai dong goi"
                          name={[field.name, "packagingType"]}
                          rules={[{ required: true, message: "Vui long chon loai dong goi" }]}
                        >
                          <Select options={packagingTypeOptions} placeholder="Chon loai dong goi" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={11}>
                        <Form.Item
                          {...field}
                          label="Ghi chu kien hang"
                          name={[field.name, "packageNote"]}
                        >
                          <Input placeholder="Ghi chu rieng cho kien hang / ma van don nay" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={3}>
                        <div className="order-edit-shipping-remove">
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => remove(field.name)}
                            disabled={fields.length === 1}
                          />
                        </div>
                      </Col>
                    </Row>

                    <PackageItemsSelector entryIndex={field.name} orderItems={orderItems} />
                  </Space>
                </Card>
              ))}

              <Button
                className="order-edit-add-tracking"
                icon={<PlusOutlined />}
                onClick={() =>
                  add({
                    packageId: undefined,
                    trackingCode: "",
                    parcelValue: 0,
                    shippingCompany: "vn-express",
                    packagingType: "wooden-crating",
                    packageNote: "",
                    selectedItems: [],
                  } satisfies ShippingEntryFormValue)
                }
              >
                Them ma kien hang
              </Button>
              <Text type="secondary" className="order-edit-muted-note">
                Mot order co the co nhieu tracking number. Moi tracking phai chon dung item va quantity thuoc kien do.
              </Text>
            </Space>
          )}
        </Form.List>
      </Space>
    </OrderEditSectionCard>
  );
};
