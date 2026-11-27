import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Button, Card, Col, Collapse, DatePicker, Empty, Image, Input, InputNumber,
  Modal, Progress, Row, Select, Space, Tag, Tooltip, Typography,
} from "antd";
import { CloseOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Order, OrderItem } from "../../../shared/types";
import { allocationOutsidePurchase, availableQuantity, purchaseDraftTotals, selectableItems } from "./taobaoPurchaseDraft";
import "./taobao-purchase-confirmation-modal.css";

const { Text, Title } = Typography;

export type TaobaoPurchaseLine = { id?: string; order_item_id: string; quantity: number; order_item?: OrderItem };
export type TaobaoPurchase = {
  id?: string;
  external_order_code: string;
  shop_id?: string | null;
  shop_name?: string | null;
  purchased_at?: string | null;
  note?: string | null;
  shop_exception_reason?: string | null;
  status?: string;
  trackings?: Array<{ id: string; tracking_number: string }>;
  items: TaobaoPurchaseLine[];
};
export type TaobaoPurchaseProgress = { order_id: string; order_status: string; ordered_quantity: number; purchased_quantity: number; remaining_quantity: number; purchase_order_count: number; is_complete: boolean; purchases: TaobaoPurchase[] };

type Props = {
  open: boolean;
  order: Order;
  progress: TaobaoPurchaseProgress | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (purchases: TaobaoPurchase[], confirm: boolean) => Promise<void>;
};

type ShopOption = { value: string; label: string; shopId: string | null; shopName: string };

const newPurchase = (): TaobaoPurchase => ({ external_order_code: "", purchased_at: dayjs().format("YYYY-MM-DD HH:mm:ss"), items: [] });
const clonePurchases = (purchases: TaobaoPurchase[]) => purchases.map((purchase) => ({ ...purchase, items: purchase.items.map((line) => ({ ...line })) }));
const fingerprint = (purchases: TaobaoPurchase[]) => JSON.stringify(purchases.map((purchase) => ({
  id: purchase.id ?? null,
  external_order_code: purchase.external_order_code,
  shop_id: purchase.shop_id ?? null,
  shop_name: purchase.shop_name ?? null,
  purchased_at: purchase.purchased_at ?? null,
  note: purchase.note ?? null,
  shop_exception_reason: purchase.shop_exception_reason ?? null,
  items: purchase.items.map((line) => ({ order_item_id: String(line.order_item_id), quantity: Number(line.quantity) }))
    .sort((a, b) => a.order_item_id.localeCompare(b.order_item_id)),
})));
const itemShopKey = (item: OrderItem) => String(item.shop_id || item.shop_name || item.seller || "").trim();
const itemShopName = (item: OrderItem) => String(item.shop_name || item.seller || item.shop_id || "Chưa xác minh shop").trim();
const itemSku = (item: OrderItem) => [item.size, item.color].filter(Boolean).join(" / ") || item.note || "Chưa có phân loại";

export function TaobaoPurchaseConfirmationModal({ open, order, progress, loading, onClose, onSubmit }: Props) {
  const [purchases, setPurchases] = useState<TaobaoPurchase[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const initialFingerprint = useRef("[]");

  useEffect(() => {
    if (!open || loading) return;
    const initial = clonePurchases(progress?.purchases ?? []);
    const drafts = initial.length > 0 ? initial : [newPurchase()];
    setPurchases(drafts);
    setActiveKeys(drafts.map((_, index) => String(index)));
    initialFingerprint.current = fingerprint(drafts);
    setSubmitError(null);
  }, [open, loading, progress]);

  const totals = useMemo(() => purchaseDraftTotals(order.items, purchases), [order.items, purchases]);
  const dirty = fingerprint(purchases) !== initialFingerprint.current;

  const shopOptions = useMemo<ShopOption[]>(() => {
    const values = new Map<string, ShopOption>();
    order.items.forEach((item) => {
      const key = itemShopKey(item);
      if (!key) return;
      const shopId = item.shop_id ? String(item.shop_id) : null;
      const shopName = itemShopName(item);
      const value = shopId ? `id:${shopId}` : `name:${shopName}`;
      values.set(value, { value, label: shopName, shopId, shopName });
    });
    return [...values.values()];
  }, [order.items]);

  const updatePurchase = (index: number, patch: Partial<TaobaoPurchase>) => setPurchases((current) =>
    current.map((purchase, currentIndex) => currentIndex === index ? { ...purchase, ...patch } : purchase));

  const requestClose = () => {
    if (!dirty || submitting) {
      if (!submitting) onClose();
      return;
    }
    Modal.confirm({
      title: "Bỏ các thay đổi chưa lưu?",
      content: "Thông tin đơn mua và phân bổ sản phẩm vừa chỉnh sửa sẽ không được lưu.",
      okText: "Bỏ thay đổi",
      cancelText: "Tiếp tục chỉnh sửa",
      okButtonProps: { danger: true },
      onOk: onClose,
    });
  };

  const addPurchase = () => {
    setPurchases((current) => {
      const next = [...current, newPurchase()];
      setActiveKeys((keys) => [...new Set([...keys, String(next.length - 1)])]);
      return next;
    });
  };

  const addItem = (purchaseIndex: number, itemId: string) => {
    const source = order.items.find((item) => String(item.id) === String(itemId));
    if (!source) return;
    setPurchases((current) => current.map((purchase, index) => {
      if (index !== purchaseIndex || purchase.items.some((line) => String(line.order_item_id) === String(itemId))) return purchase;
      const quantity = Math.min(1, availableQuantity(source, current));
      if (quantity < 1) return purchase;
      const patch: TaobaoPurchase = { ...purchase, items: [...purchase.items, { order_item_id: String(source.id), quantity, order_item: source }] };
      if (!purchase.shop_id && !purchase.shop_name) {
        patch.shop_id = source.shop_id ? String(source.shop_id) : null;
        patch.shop_name = itemShopName(source);
      }
      return patch;
    }));
  };

  const removeItem = (purchaseIndex: number, itemId: string) => setPurchases((current) => current.map((purchase, index) =>
    index === purchaseIndex ? { ...purchase, items: purchase.items.filter((line) => String(line.order_item_id) !== String(itemId)) } : purchase));

  const setQuantity = (purchaseIndex: number, itemId: string, quantity: number) => setPurchases((current) => current.map((purchase, index) => {
    if (index !== purchaseIndex) return purchase;
    return { ...purchase, items: purchase.items.map((line) => String(line.order_item_id) === String(itemId) ? { ...line, quantity: Math.max(1, quantity) } : line) };
  }));

  const validationError = useMemo(() => {
    if (purchases.length === 0) return "Cần ít nhất một đơn mua Taobao.";
    const codes = new Set<string>();
    for (const [index, purchase] of purchases.entries()) {
      const code = purchase.external_order_code.trim();
      if (!code) return `Đơn mua #${index + 1} chưa có mã đơn Taobao.`;
      if (codes.has(code.toLocaleLowerCase())) return `Mã đơn Taobao ${code} đang bị lặp.`;
      codes.add(code.toLocaleLowerCase());
      if (!purchase.purchased_at) return `Đơn mua ${code} chưa có thời điểm đặt mua.`;
      if (purchase.items.length === 0) return `Đơn mua ${code} chưa được gắn sản phẩm.`;
      for (const line of purchase.items) {
        const source = order.items.find((item) => String(item.id) === String(line.order_item_id));
        if (!source || line.quantity < 1) return `Đơn mua ${code} có phân bổ sản phẩm không hợp lệ.`;
        const other = allocationOutsidePurchase(purchases, index, source.id);
        if (other + line.quantity > Number(source.quantity)) return `Số lượng mua của ${source.product_name} vượt số lượng khách đặt.`;
        const sourceShop = itemShopKey(source).toLocaleLowerCase();
        const chosenShop = String(purchase.shop_id || purchase.shop_name || "").trim().toLocaleLowerCase();
        if (sourceShop && chosenShop && sourceShop !== chosenShop && !purchase.shop_exception_reason?.trim()) return `Đơn mua ${code} có sản phẩm khác shop; cần nhập lý do ngoại lệ.`;
      }
    }
    return null;
  }, [order.items, purchases]);

  const submit = async (confirm: boolean) => {
    if (validationError) { setSubmitError(validationError); return; }
    if (confirm && totals.remaining !== 0) { setSubmitError(`Còn ${totals.remaining} sản phẩm chưa được đặt.`); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(purchases, confirm);
      initialFingerprint.current = fingerprint(purchases);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Không thể lưu dữ liệu mua Taobao.");
    } finally {
      setSubmitting(false);
    }
  };

  const statItems = [["Tổng SKU", order.items.length], ["Khách đặt", totals.ordered], ["Đã mua", totals.bought], ["Còn thiếu", totals.remaining], ["Đơn Taobao", purchases.length]] as const;

  return (
    <Modal open={open} onCancel={requestClose} width={1180} centered destroyOnHidden title={null} footer={null} keyboard={false} maskClosable={false} className="taobao-purchase-modal" styles={{ body: { padding: 0 } }}>
      <div className="taobao-purchase-shell">
        <header className="taobao-purchase-header">
          <Title level={3} style={{ margin: 0 }}><ShoppingCartOutlined /> Xác nhận đã đặt hàng Taobao</Title>
          <Text className="taobao-purchase-header__subtitle">Đơn VietTrung {order.order_code} · {order.customer?.name ?? "-"}</Text>
        </header>
        <main className="taobao-purchase-body">
          <Row gutter={[12, 12]}>
            {statItems.map(([label, value]) => <Col xs={12} sm={8} md={label === "Đơn Taobao" ? 8 : 4} key={label}><Card size="small" className="taobao-purchase-stat"><Text type="secondary">{label}</Text><Title level={3} style={{ margin: 0, color: label === "Còn thiếu" && Number(value) > 0 ? "#d97706" : "#102B50" }}>{value}</Title></Card></Col>)}
          </Row>
          <Progress style={{ marginTop: 12 }} percent={totals.ordered ? Math.min(100, Math.round(totals.bought / totals.ordered * 100)) : 0} strokeColor="#1755AD" />
          {totals.remaining > 0
            ? <Alert style={{ margin: "10px 0 14px" }} type="warning" showIcon message={`Bản nháp đang phân bổ ${totals.bought}/${totals.ordered} sản phẩm. Còn ${totals.remaining} sản phẩm chưa được đặt.`} />
            : <Alert style={{ margin: "10px 0 14px" }} type="success" showIcon message="Bản nháp đã phân bổ đủ số lượng khách đặt. Dữ liệu chỉ được xác nhận sau khi backend lưu thành công." />}
          {submitError ? <Alert style={{ marginBottom: 12 }} type="error" showIcon message={submitError} closable onClose={() => setSubmitError(null)} /> : null}

          {loading ? <Card loading /> : purchases.length === 0 ? <Empty description="Chưa khai báo đơn mua Taobao" /> : purchases.map((purchase, purchaseIndex) => {
            const available = selectableItems(order.items, purchases, purchaseIndex);
            const shopValue = purchase.shop_id ? `id:${purchase.shop_id}` : purchase.shop_name ? `name:${purchase.shop_name}` : undefined;
            const cardQuantity = purchase.items.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
            const mismatch = purchase.items.some((line) => {
              const source = order.items.find((item) => String(item.id) === String(line.order_item_id));
              if (!source) return false;
              const sourceShop = itemShopKey(source).toLocaleLowerCase();
              const chosenShop = String(purchase.shop_id || purchase.shop_name || "").trim().toLocaleLowerCase();
              return Boolean(sourceShop && chosenShop && sourceShop !== chosenShop);
            });
            const locked = purchase.status === "confirmed" || Boolean(purchase.trackings?.length);
            const title = purchase.external_order_code.trim() ? `${purchase.external_order_code}${purchase.shop_name ? ` — ${purchase.shop_name}` : ""}` : "Chưa nhập mã đơn Taobao";

            return <Collapse key={purchase.id ?? `draft-${purchaseIndex}`} className="taobao-purchase-card" activeKey={activeKeys.includes(String(purchaseIndex)) ? [String(purchaseIndex)] : []} onChange={(keys) => setActiveKeys((current) => Array.isArray(keys) && keys.length > 0 ? [...new Set([...current, String(purchaseIndex)])] : current.filter((key) => key !== String(purchaseIndex)))} items={[{
              key: String(purchaseIndex),
              label: <div className="taobao-purchase-card-title"><span className="taobao-purchase-card-title__number">{purchaseIndex + 1}</span><Text strong>{title}</Text><Tag color={purchase.items.length > 0 ? "success" : "default"}>{purchase.items.length} SKU · {cardQuantity} sản phẩm</Tag>{locked ? <Tag color="blue">Đã khóa nghiệp vụ</Tag> : null}</div>,
              extra: <Tooltip title={locked ? "Đơn đã xác nhận hoặc liên kết vận đơn; backend sẽ bảo vệ dữ liệu." : "Xóa đơn mua"}><Button danger type="text" icon={<DeleteOutlined />} onClick={(event) => { event.stopPropagation(); Modal.confirm({ title: "Xóa đơn mua này?", content: purchase.id ? "Backend sẽ từ chối nếu đơn đã xác nhận hoặc đã liên kết vận đơn." : "Card nháp sẽ bị xóa.", onOk: () => setPurchases((current) => current.filter((_, index) => index !== purchaseIndex)) }); }} /></Tooltip>,
              children: <Space direction="vertical" size={14} style={{ width: "100%" }}>
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={12} lg={6}><Text>Mã đơn Taobao *</Text><Input value={purchase.external_order_code} maxLength={191} onChange={(event) => updatePurchase(purchaseIndex, { external_order_code: event.target.value })} placeholder="Nhập đúng mã đơn mua" /></Col>
                  <Col xs={24} md={12} lg={6}><Text>Shop đã mua *</Text><Select showSearch allowClear style={{ width: "100%" }} value={shopValue} options={shopOptions} optionFilterProp="label" onChange={(value) => { const option = shopOptions.find((item) => item.value === value); updatePurchase(purchaseIndex, { shop_id: option?.shopId ?? null, shop_name: option?.shopName ?? null }); }} placeholder="Chọn shop thực tế" /></Col>
                  <Col xs={24} md={12} lg={6}><Text>Thời điểm đặt mua *</Text><DatePicker showTime style={{ width: "100%" }} value={purchase.purchased_at ? dayjs(purchase.purchased_at) : null} onChange={(value) => updatePurchase(purchaseIndex, { purchased_at: value?.format("YYYY-MM-DD HH:mm:ss") ?? null })} /></Col>
                  <Col xs={24} md={12} lg={6}><Text>Ghi chú</Text><Input value={purchase.note ?? ""} onChange={(event) => updatePurchase(purchaseIndex, { note: event.target.value })} placeholder="Không bắt buộc" /></Col>
                </Row>
                {mismatch ? <Alert type="warning" showIcon message="Có sản phẩm khác shop đã chọn. Nhập lý do ngoại lệ để backend xác minh." /> : null}
                {(mismatch || purchase.shop_exception_reason) ? <Input placeholder="Lý do mua khác shop gốc *" value={purchase.shop_exception_reason ?? ""} onChange={(event) => updatePurchase(purchaseIndex, { shop_exception_reason: event.target.value })} /> : null}
                <div><Text strong>Chọn sản phẩm đã mua</Text><div><Text type="secondary">Chỉ hiển thị sản phẩm còn số lượng có thể phân bổ cho đơn mua khác.</Text></div></div>
                <Select
                  className="taobao-product-picker"
                  popupClassName="taobao-product-picker-popup"
                  showSearch value={null} style={{ width: "100%" }}
                  placeholder={available.length > 0 ? (purchase.items.length > 0 ? "+ Gắn thêm sản phẩm vào đơn mua này" : "Tìm theo tên sản phẩm, shop hoặc phân loại") : "Không còn sản phẩm có thể gắn"}
                  disabled={available.length === 0}
                  filterOption={(input, option) => String(option?.searchText ?? "").toLocaleLowerCase().includes(input.toLocaleLowerCase())}
                  onChange={(itemId) => addItem(purchaseIndex, String(itemId))}
                  options={available.map((item) => ({ value: String(item.id), searchText: `${item.product_name} ${itemShopName(item)} ${itemSku(item)}`, label: <div className="taobao-product-option"><Image preview={false} fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='42' height='42'%3E%3Crect width='42' height='42' fill='%23eef3f9'/%3E%3C/svg%3E" src={item.product_image || undefined} className="taobao-product-option__image" /><div style={{ minWidth: 0 }}><Tooltip title={item.product_name}><span className="taobao-product-option__name">{item.product_name}</span></Tooltip><Text type="secondary">{itemSku(item)} · {itemShopName(item)}</Text></div><Tag color="blue">Còn {availableQuantity(item, purchases)}</Tag></div> }))}
                  notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không còn sản phẩm phù hợp" />}
                />
                {purchase.items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa gắn sản phẩm vào đơn mua này" /> : purchase.items.map((line) => {
                  const item = order.items.find((source) => String(source.id) === String(line.order_item_id)) ?? line.order_item;
                  if (!item) return null;
                  const other = allocationOutsidePurchase(purchases, purchaseIndex, item.id);
                  const max = Math.max(0, Number(item.quantity) - other);
                  return <Card key={String(item.id)} size="small" className="taobao-selected-product"><div className="taobao-selected-product__main">
                    <Image preview={false} src={item.product_image || undefined} className="taobao-selected-product__image" />
                    <div style={{ minWidth: 0 }}><Tooltip title={item.product_name}><span className="taobao-selected-product__name">{item.product_name}</span></Tooltip><Text type="secondary">{itemSku(item)} · {itemShopName(item)}</Text></div>
                    <div className="taobao-selected-product__metric"><Text type="secondary">Khách đặt</Text><strong>{item.quantity}</strong></div>
                    <div className="taobao-selected-product__metric"><Text type="secondary">Đơn khác</Text><strong>{other}</strong></div>
                    <div className="taobao-selected-product__metric"><Text type="secondary">Còn tối đa</Text><strong>{max}</strong></div>
                    <InputNumber min={1} max={max} precision={0} value={line.quantity} onChange={(value) => setQuantity(purchaseIndex, item.id, Number(value ?? 1))} addonBefore="SL mua" />
                    <Tooltip title="Gỡ sản phẩm khỏi đơn mua"><Button danger type="text" aria-label={`Gỡ ${item.product_name}`} icon={<CloseOutlined />} onClick={() => removeItem(purchaseIndex, item.id)} /></Tooltip>
                  </div></Card>;
                })}
              </Space>,
            }]} />;
          })}
          {!loading ? <Button block type="dashed" icon={<PlusOutlined />} onClick={addPurchase}>Thêm đơn mua Taobao</Button> : null}
        </main>
        <footer className="taobao-purchase-footer">
          <Button onClick={requestClose}>Hủy</Button>
          <Space><Button icon={<SaveOutlined />} loading={submitting} disabled={!dirty || Boolean(validationError)} onClick={() => void submit(false)}>Lưu tiến độ mua</Button><Button type="primary" loading={submitting} disabled={Boolean(validationError) || totals.remaining !== 0 || totals.ordered === 0 || purchases.length === 0} onClick={() => void submit(true)} style={{ background: "#102B50" }}>Xác nhận đã đặt đủ</Button></Space>
        </footer>
      </div>
    </Modal>
  );
}
