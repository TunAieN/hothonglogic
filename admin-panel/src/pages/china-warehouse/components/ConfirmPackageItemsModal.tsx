import { useRef, useState } from "react";
import { Alert, Button, Checkbox, Grid, Image, Input, InputNumber, Modal, Space, Table, Tag, Tooltip, Typography } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { MEDIA_IMAGE_FALLBACK, resolveMediaUrl } from "../../../shared/utils/mediaUrl";
import type { ChinaWarehousePackage } from "../types";
import { TrackingPurchaseVerificationSection } from "./TrackingPurchaseVerificationSection";
import { useTrackingPurchaseVerification } from "./useTrackingPurchaseVerification";
import { getInspectionChanges, mergeInspectionItems } from "./packageInspectionSave";
import type { ItemQuantity } from "./packageInspectionSave";
import "./package-inspection-modal.css";

const { Text } = Typography;

type SelectionRow = {
  orderItemId: string;
  productName: string;
  image?: string | null;
  variant: string;
  orderedQuantity: number;
  shopLabel: string;
  checked: boolean;
  quantity: number;
};

type Props = {
  packageRecord: ChinaWarehousePackage;
  canInspect: boolean;
  canVerify: boolean;
  canReadOrders: boolean;
  onCancel: () => void;
  onSubmit: (items: ItemQuantity[], expectedItems: ItemQuantity[], inspectionNote?: string) => Promise<void>;
  onVerificationSaved: () => void;
};

const buildSelectionRows = (packageRecord: ChinaWarehousePackage): SelectionRow[] =>
  packageRecord.orderItems.map((item) => {
    const confirmed = packageRecord.packageItems.find(
      (packageItem) => String(packageItem.order_item_id) === String(item.id),
    );
    return {
      orderItemId: String(item.id),
      productName: item.product_name,
      image: item.product_image,
      variant: [item.color, item.size].filter(Boolean).join(" / ") || "—",
      orderedQuantity: Number(item.quantity),
      shopLabel: item.shop_name || item.seller || "—",
      checked: Boolean(confirmed),
      quantity: Number(confirmed?.quantity ?? 1),
    };
  });

const fullLine = (value: string) => (
  <Text className="cn-inspection-ellipsis" ellipsis={{ tooltip: value }}>{value}</Text>
);

export const ConfirmPackageItemsModal = ({
  packageRecord, canInspect, canVerify, canReadOrders, onCancel, onSubmit, onVerificationSaved,
}: Props) => {
  const [rows, setRows] = useState(() => buildSelectionRows(packageRecord));
  const [savedItems, setSavedItems] = useState<ItemQuantity[]>(() => packageRecord.packageItems.map(
    ({ order_item_id, quantity }) => ({ order_item_id: String(order_item_id), quantity: Number(quantity) }),
  ));
  const [inspectionNote, setInspectionNote] = useState("");
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string }>();
  const [saving, setSaving] = useState<"inspection" | "verification">();
  const [discardRequested, setDiscardRequested] = useState(false);
  const saveLock = useRef(false);
  const { md } = Grid.useBreakpoint();
  const savedQuantities = new Map(savedItems.map((item) => [item.order_item_id, item.quantity]));
  const items = rows.filter((row) => row.checked).map((row) => ({ order_item_id: row.orderItemId, quantity: row.quantity }));
  const changedItems = getInspectionChanges(items, savedQuantities);
  const verification = useTrackingPurchaseVerification(packageRecord, changedItems.length ? items : null, canVerify);
  const quantities = new Map(verification.quantities?.map((item) => [item.order_item_id, item]));
  const canSaveInspection = canInspect && Boolean(changedItems.length || inspectionNote.trim())
    && changedItems.every((item) => Number.isInteger(item.quantity) && item.quantity > 0
      && item.quantity <= (quantities.get(item.order_item_id)?.remaining ?? Infinity));

  const requestClose = () => {
    if (saveLock.current) return;
    if ((canInspect && (changedItems.length || inspectionNote.trim())) || verification.selected.length || verification.reason.trim()) {
      setDiscardRequested(true);
      return;
    }
    onCancel();
  };

  const counts = (row: SelectionRow) => {
    const summary = quantities.get(row.orderItemId);
    return {
      ordered: row.orderedQuantity,
      elsewhere: summary?.checked_elsewhere ?? "—",
      remaining: summary ? Math.max(0, summary.remaining - (savedQuantities.get(row.orderItemId) ?? 0)) : "—",
    };
  };

  const columns: ColumnsType<SelectionRow> = [
    {
      title: "Chọn", key: "checked", width: md ? "8%" : "16%",
      render: (_, row) => {
        const saved = savedQuantities.has(row.orderItemId);
        return <Checkbox checked={row.checked} aria-label={`Chọn ${row.productName}`}
          title={saved ? "Dòng đã xác nhận. Có thể chỉnh số lượng." : undefined}
          disabled={!canInspect || Boolean(saving) || saved || (!row.checked && quantities.get(row.orderItemId)?.remaining === 0)}
          onChange={(event) => setRows((current) => current.map((item) =>
            item.orderItemId === row.orderItemId ? { ...item, checked: event.target.checked } : item))} />;
      },
    },
    {
      title: "Sản phẩm", key: "product",
      render: (_, row) => {
        const quantity = counts(row);
        return <div className="cn-inspection-product">
          <Image width={34} height={34} preview={false} alt="" className="cn-inspection-thumbnail"
            src={resolveMediaUrl(row.image) || MEDIA_IMAGE_FALLBACK} fallback={MEDIA_IMAGE_FALLBACK} />
          <div className="cn-inspection-line">
            {fullLine(row.productName)}
            {!md && <>
              <Tooltip title={row.shopLabel}>
                <Text type="secondary" className="cn-inspection-ellipsis cn-inspection-mobile-meta">
                  {row.shopLabel}
                </Text>
              </Tooltip>
              {row.variant !== "—" && <Tooltip title={row.variant}>
                <Text type="secondary" className="cn-inspection-ellipsis cn-inspection-mobile-meta">{row.variant}</Text>
              </Tooltip>}
              <Text type="secondary" className="cn-inspection-mobile-counts">
                Đặt {quantity.ordered} · Kiện khác {quantity.elsewhere} · Còn {quantity.remaining}
              </Text>
            </>}
          </div>
        </div>;
      },
    },
    { title: "Shop", key: "shop", width: "16%", responsive: ["md"], render: (_, row) => fullLine(row.shopLabel) },
    { title: "Phân loại", key: "variant", width: "12%", responsive: ["md"], render: (_, row) => fullLine(row.variant) },
    { title: "SL đặt", key: "ordered", width: "8%", align: "center", responsive: ["md"], render: (_, row) => counts(row).ordered },
    { title: "Kiện khác", key: "elsewhere", width: "9%", align: "center", responsive: ["md"], render: (_, row) => counts(row).elsewhere },
    { title: "Còn kiểm", key: "remaining", width: "9%", align: "center", responsive: ["md"], render: (_, row) => counts(row).remaining },
    {
      title: "SL trong kiện", key: "quantity", width: md ? "12%" : "26%",
      render: (_, row) => {
        const limit = quantities.get(row.orderItemId)?.remaining ?? row.orderedQuantity;
        return <InputNumber min={1} max={Math.max(1, limit)} precision={0} style={{ width: "100%" }}
          aria-label={`Số lượng trong kiện của ${row.productName}`}
          value={row.checked ? row.quantity : null}
          status={row.checked && row.quantity > limit ? "error" : undefined}
          disabled={!row.checked || !canInspect || Boolean(saving)}
          onChange={(value) => setRows((current) => current.map((item) =>
            item.orderItemId === row.orderItemId ? { ...item, quantity: value ?? 1 } : item))} />;
      },
    },
  ];

  const handleSubmit = async (mode: "inspection" | "verification") => {
    if (saveLock.current || (mode === "inspection" ? !canSaveInspection : (!verification.canSave || changedItems.length > 0))) return;
    saveLock.current = true;
    setSaving(mode);
    setNotice(undefined);
    setDiscardRequested(false);
    try {
      if (mode === "inspection") {
        await onSubmit(changedItems, savedItems, inspectionNote.trim() || undefined);
        setSavedItems(mergeInspectionItems(savedQuantities, changedItems));
        setInspectionNote("");
        verification.retry();
        setNotice({ type: "success", text: changedItems.length ? "Đã lưu xác nhận item." : "Đã lưu ghi chú ngoại lệ." });
      } else {
        await verification.save();
        onVerificationSaved();
        setNotice({ type: "success", text: "Đã bổ sung liên kết Taobao." });
      }
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Vui lòng thử lại." });
    } finally {
      saveLock.current = false;
      setSaving(undefined);
    }
  };

  return (
    <Modal
      title={<div className="cn-inspection-header">
        <div>Xác nhận item trong kiện — {packageRecord.trackingCode}</div>
        <Space size={[6, 4]} wrap>
          <Tag color="blue">Đơn {packageRecord.invoiceCode ?? "—"}</Tag>
          {canReadOrders && packageRecord.customerName && <Tag>{packageRecord.customerName}</Tag>}
          <Tag>Khớp tracking</Tag>
          <Tag>{savedItems.length ? `Đã kiểm ${savedItems.length} SKU` : "Chưa kiểm item"}</Tag>
        </Space>
      </div>}
      open centered maskClosable={false} onCancel={requestClose} width={980} rootClassName="cn-inspection-modal"
      footer={<div className="cn-inspection-stack">
        {notice && <Alert role="status" showIcon type={notice.type} message={notice.text} />}
        {discardRequested && <Alert showIcon type="warning" message="Bạn có thay đổi chưa lưu."
          action={<Button size="small" danger onClick={onCancel}>Bỏ thay đổi và đóng</Button>} />}
        <Space wrap style={{ width: "100%", justifyContent: "flex-end" }}>
          <Button disabled={Boolean(saving)} onClick={requestClose}>Đóng</Button>
          {canInspect && <Button type="primary" loading={saving === "inspection"}
            disabled={!canSaveInspection || Boolean(saving)} onClick={() => void handleSubmit("inspection")}>Lưu xác nhận item</Button>}
        </Space>
      </div>}
    >
      <div className="cn-inspection-stack">
        <section className="cn-inspection-stack">
          <h3>Sản phẩm thực tế trong kiện</h3>
          {!canInspect && <Alert showIcon type="info" message={packageRecord.batchId
            ? "Kiện đã vào lô. Kết quả kiểm chỉ đọc." : "Khu vực kiểm hàng chỉ đọc."} />}
          <Table<SelectionRow> rowKey="orderItemId" columns={columns} dataSource={rows}
            pagination={false} size="small" tableLayout="fixed" />
          {canInspect && <Input.TextArea aria-label="Ghi chú ngoại lệ kiểm hàng" maxLength={1000} rows={2}
            disabled={Boolean(saving)} value={inspectionNote} onChange={(event) => setInspectionNote(event.target.value)}
            placeholder="Ghi số lượng thiếu/thừa, sai hàng hoặc SKU chưa xác định." />}
        </section>
        <section className="cn-inspection-stack">
          <h3><LinkOutlined /> Kết quả đối chiếu tự động</h3>
          <TrackingPurchaseVerificationSection verification={verification} canInspect={canInspect} canVerify={canVerify}
            unsavedItems={changedItems.length > 0} disabled={Boolean(saving)} saving={saving === "verification"}
            onVerify={() => void handleSubmit("verification")} />
        </section>
      </div>
    </Modal>
  );
};
