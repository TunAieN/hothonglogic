import { useState, type ReactNode } from "react";
import {
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DollarCircleOutlined,
  FileTextOutlined,
  HistoryOutlined,
  HomeOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  MailOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  ShoppingOutlined,
  TruckOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { DeleteButton } from "@refinedev/antd";
import {
  Breadcrumb,
  Button,
  Empty,
  Input,
  Popover,
  Steps,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from "antd";
import { Link } from "react-router";

import type { Order } from "../../../shared/types";
import { formatCny, formatVnd } from "../../../shared/utils/currency";
import type { OrderPrimaryAction } from "../orderDetailState";
import "./order-detail-workspace.css";

const { Text, Title } = Typography;

type ProductRow = {
  key: string;
  image: string | null | undefined;
  productLink?: string | null;
  productName: string;
  sku: string;
  shop: string;
  variant: string;
  orderedQuantity: number;
  assignedQuantity: number;
  remainingQuantity: number;
  unitPrice: number;
  subtotal: number;
};

type TrackingRow = {
  key: string;
  trackingNumber: string;
  carrier: string;
  productCount: number;
  totalQuantity: number;
  declaredValue: number;
  note: string;
  products: string;
  createdAt?: string | null;
};

type HistoryEntry = {
  key: string;
  createdAt: string;
  title: string;
  description: string;
};

type StatusMeta = { color: string; label: string };

type Props = {
  order: Order;
  statusMeta: StatusMeta;
  currentStep: number;
  journeySteps: ReadonlyArray<{ key: string; title: string; icon: ReactNode }>;
  primaryAction: OrderPrimaryAction;
  updating: boolean;
  productRows: ProductRow[];
  trackingRows: TrackingRow[];
  historyEntries: HistoryEntry[];
  itemsSubtotal: number;
  depositPercent: number;
  depositAmount: number;
  depositRemainingAmount: number;
  hasDepositRequest: boolean;
  hasPaidDeposit: boolean;
  sourceLabel: string;
  creatorLabel: string;
  formatDateTime: (value?: string) => string;
  onPrimaryAction: () => void;
  onManageTracking: () => void;
  onRefresh: () => void;
  onOpenDeposit: () => void;
  taobaoProgress?: {
    purchased_quantity: number;
    ordered_quantity: number;
    remaining_quantity: number;
    purchases: Array<{ id?: string; external_order_code: string; shop_name?: string | null; purchased_at?: string | null; status?: string; items: Array<{ quantity: number }> }>;
  } | null;
  onOpenTaobaoPurchases: () => void;
};

const paymentStatusLabel = (order: Order) => {
  const voucher = order.depositVoucher;
  const reconciliation = voucher?.paymentAutomation?.intent?.display_status;

  if (voucher?.status === "paid") return "Đã thanh toán";
  if (reconciliation === "reconciliation_needed") return "Cần xử lý đối soát";
  if (reconciliation === "confirmation_delayed") return "Đang chờ xác nhận";
  if (voucher?.status === "partial_paid") return "Thanh toán một phần";
  if (voucher) return "Chờ thanh toán";
  return "Chưa phát hành yêu cầu cọc";
};

const paymentStatusColor = (order: Order) => {
  const label = paymentStatusLabel(order);
  if (label === "Đã thanh toán") return "blue";
  if (label.includes("đối soát")) return "red";
  return "gold";
};

const paymentMethodLabel = (value?: string | null) => {
  const labels: Record<string, string> = {
    bank_transfer: "Chuyển khoản ngân hàng",
    wallet: "Ví VietTrung",
    cash: "Tiền mặt",
  };

  return value ? (labels[value] ?? value) : "Chưa ghi nhận";
};

const reconciliationStatusLabel = (value?: string | null) => {
  const labels: Record<string, string> = {
    completed: "Đã đối soát",
    pending: "Chờ đối soát",
    reconciliation_needed: "Cần xử lý đối soát",
    confirmation_delayed: "Chờ xác nhận",
  };

  return value ? (labels[value] ?? value) : "Chưa có intent";
};

const ProductCell = ({ item }: { item: ProductRow }) => {
  const detailContent = (
    <div className="order-workspace__product-detail">
      <Text strong>{item.productName}</Text>
      <dl>
        <div><dt>Shop</dt><dd>{item.shop || "-"}</dd></div>
        <div><dt>Phân loại</dt><dd>{item.variant || "-"}</dd></div>
        <div><dt>SKU</dt><dd>{item.sku || "-"}</dd></div>
      </dl>
      {item.productLink ? <a href={item.productLink} target="_blank" rel="noreferrer">Mở trang sản phẩm</a> : null}
    </div>
  );

  const productImage = item.image ? (
    <img src={item.image} alt="" className="order-workspace__product-image" />
  ) : (
    <div className="order-workspace__product-placeholder" aria-label="Sản phẩm chưa có ảnh"><ShoppingOutlined /></div>
  );

  return (
    <div className="order-workspace__product-cell">
      {item.productLink ? <a className="order-workspace__product-image-link" href={item.productLink} target="_blank" rel="noreferrer" aria-label={`Mở sản phẩm ${item.productName}`}>{productImage}</a> : productImage}
      <div className="order-workspace__product-copy">
        {item.productLink ? <a className="order-workspace__product-name" href={item.productLink} target="_blank" rel="noreferrer">{item.productName}</a> : <Text strong className="order-workspace__product-name">{item.productName}</Text>}
        <div className="order-workspace__product-meta">
          <Text type="secondary" className="order-workspace__product-sku">{item.sku || "Chưa có SKU"}</Text>
          <Popover content={detailContent} title="Chi tiết sản phẩm" trigger={["click", "hover"]} placement="bottomLeft">
            <Button type="link" size="small" icon={<InfoCircleOutlined />} aria-label={`Xem chi tiết ${item.productName}`}>Chi tiết</Button>
          </Popover>
        </div>
      </div>
    </div>
  );
};

export const OrderDetailWorkspace = ({
  order,
  statusMeta,
  currentStep,
  journeySteps,
  primaryAction,
  updating,
  productRows,
  trackingRows,
  historyEntries,
  itemsSubtotal,
  depositPercent,
  depositAmount,
  depositRemainingAmount,
  hasDepositRequest,
  hasPaidDeposit,
  sourceLabel,
  creatorLabel,
  formatDateTime,
  onPrimaryAction,
  onManageTracking,
  onRefresh,
  onOpenDeposit,
  taobaoProgress,
  onOpenTaobaoPurchases,
}: Props) => {
  const voucher = order.depositVoucher;
  const paidAmount = Number(voucher?.paid_amount ?? order.deposit_paid_amount_vnd ?? 0);
  const productTotalCny = Number(order.product_total_cny || itemsSubtotal || 0);
  const productTotalVnd = Number(order.product_total_vnd || 0);
  const confirmedTransaction = voucher?.transactions?.find((item) => item.status === "confirmed");
  const paymentIntent = voucher?.paymentAutomation?.intent;
  const displayNote = (order.note ?? "")
    .replace(/^\[VT-CUSTOMER-REQUEST:[0-9a-f-]{36}:[0-9a-f]{64}\]\s*/i, "")
    .trim();
  const shippingAddress = order.deliveryRequest?.address ?? null;
  const shippingEvents = historyEntries.filter((entry) =>
    /vận đơn|kiện|kho/i.test(`${entry.title} ${entry.description}`),
  );
  const hasPrimaryTrackingAction = /mã vận đơn/i.test(primaryAction.label);
  const [activeTab, setActiveTab] = useState("payment");

  const compactProductColumns = [
    { title: "#", key: "index", width: 38, align: "center" as const, render: (_value: unknown, _row: ProductRow, index: number) => index + 1 },
    { title: "Sản phẩm", key: "productName", className: "order-workspace__product-column", render: (_value: unknown, row: ProductRow) => <ProductCell item={row} /> },
    { title: "SL", dataIndex: "orderedQuantity", key: "orderedQuantity", width: 54, align: "right" as const },
    { title: "Đơn giá", dataIndex: "unitPrice", key: "unitPrice", width: 92, align: "right" as const, render: (value: number) => formatCny(value) },
    { title: "Thành tiền", dataIndex: "subtotal", key: "subtotal", width: 104, align: "right" as const, render: (value: number) => formatCny(value) },
  ];

  const paymentTab = (
    <div className="order-workspace__tab-layout">
      <section className="order-workspace__tab-main">
        <div className="order-workspace__section-heading">
          <DollarCircleOutlined />
          <div>
            <Title level={4}>Thanh toán và đặt cọc</Title>
            <Text type="secondary">Dữ liệu từ voucher và snapshot đã phát hành.</Text>
          </div>
          <Tag color={paymentStatusColor(order)}>{paymentStatusLabel(order)}</Tag>
        </div>

        <div className="order-workspace__metrics">
          <div><Text type="secondary">Tỷ lệ đặt cọc</Text><strong>{hasDepositRequest ? `${depositPercent}%` : "-"}</strong></div>
          <div><Text type="secondary">Số tiền đặt cọc</Text><strong>{hasDepositRequest ? formatVnd(depositAmount) : "-"}</strong></div>
          <div><Text type="secondary">Đã thanh toán</Text><strong>{formatVnd(paidAmount)}</strong></div>
          <div><Text type="secondary">Còn phải thanh toán</Text><strong>{hasDepositRequest ? formatVnd(depositRemainingAmount) : "-"}</strong></div>
        </div>

        <div className="order-workspace__payment-body">
          <div className="order-workspace__payment-facts">
            <div><span>Hạng VIP hiệu lực</span><strong>{order.customer?.vipTier?.name ?? order.customer?.vip_group ?? "Chưa có"}</strong></div>
            <div>
              <span>Mã phiếu</span>
              <strong>{voucher ? <Link to={`/payment-vouchers/${voucher.id}`}>{voucher.voucher_code}</Link> : "Chưa phát hành"}</strong>
            </div>
            <div><span>Phương thức thanh toán</span><strong>{paymentMethodLabel(confirmedTransaction?.payment_method)}</strong></div>
            <div><span>Đối soát SePay</span><strong>{reconciliationStatusLabel(paymentIntent?.display_status)}</strong></div>
            <div>
              <span>Nội dung chuyển khoản</span>
              <strong className="order-workspace__copy-value">
                {voucher?.transfer_content ?? order.deposit_transfer_content ?? "-"}
                {(voucher?.transfer_content ?? order.deposit_transfer_content) ? (
                  <Button
                    type="text"
                    size="small"
                    aria-label="Sao chép nội dung chuyển khoản"
                    icon={<CopyOutlined />}
                    onClick={() => void navigator.clipboard?.writeText(voucher?.transfer_content ?? order.deposit_transfer_content ?? "")}
                  />
                ) : null}
              </strong>
            </div>
            <div><span>Thời gian thanh toán</span><strong>{formatDateTime(order.deposit_paid_at ?? undefined)}</strong></div>
          </div>

          <aside className="order-workspace__payment-action">
            <div className="order-workspace__payment-action-copy">
              <QrcodeOutlined />
              <div><Title level={5}>Theo dõi thanh toán (VietQR)</Title><Text type="secondary">Trạng thái và mã thanh toán do backend cung cấp.</Text></div>
            </div>
            {paymentIntent?.qr_url && paymentIntent.status !== "completed" ? (
              <img className="order-workspace__payment-qr" src={paymentIntent.qr_url} alt="Mã VietQR thanh toán" />
            ) : (
              <div className="order-workspace__payment-settled"><CheckCircleOutlined /><span>{paymentStatusLabel(order)}</span></div>
            )}
            {voucher ? <Button type="primary" ghost icon={<DollarCircleOutlined />} onClick={onOpenDeposit}>Theo dõi thanh toán / VietQR</Button> : null}
          </aside>
        </div>
        {taobaoProgress ? (
          <div style={{ marginTop: 18, padding: 16, border: "1px solid #cfe0fb", borderRadius: 14, background: "#f5f9ff" }}>
            <div className="order-workspace__section-heading">
              <ShoppingOutlined />
              <div><Title level={5}>Các đơn mua Taobao</Title><Text type="secondary">Đã mua {taobaoProgress.purchased_quantity}/{taobaoProgress.ordered_quantity}, còn {taobaoProgress.remaining_quantity} sản phẩm.</Text></div>
              <Button onClick={onOpenTaobaoPurchases}>Xem / chỉnh sửa</Button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {taobaoProgress.purchases.slice(0, 10).map((purchase) => (
                <div key={purchase.id ?? purchase.external_order_code} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 10px", background: "white", borderRadius: 8 }}>
                  <strong>{purchase.external_order_code}</strong><span>{purchase.shop_name || "Chưa xác minh shop"}</span><span>{purchase.items.reduce((sum, line) => sum + Number(line.quantity), 0)} sản phẩm</span><Tag>{purchase.status || "recorded"}</Tag>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );

  const shippingTab = (
    <div className="order-workspace__shipping-grid">
      <section>
        <div className="order-workspace__section-heading">
          <TruckOutlined />
          <div><Title level={4}>Thông tin vận chuyển</Title><Text type="secondary">Tracking thực tế thuộc đơn hàng.</Text></div>
        </div>
        {shippingAddress ? (
          <div className="order-workspace__delivery-address">
            <div><span>Người nhận</span><strong>{shippingAddress.receiver_name}</strong></div>
            <div><span>Số điện thoại</span><strong>{shippingAddress.receiver_phone}</strong></div>
            <div className="order-workspace__delivery-address-full"><span>Địa chỉ nhận hàng</span><strong>{shippingAddress.full_address ?? [shippingAddress.address_line, shippingAddress.ward_name, shippingAddress.district_name, shippingAddress.province_name].filter(Boolean).join(", ")}</strong></div>
            {order.deliveryRequest?.delivery_note ? <div className="order-workspace__delivery-address-full"><span>Ghi chú giao hàng</span><strong>{order.deliveryRequest.delivery_note}</strong></div> : null}
          </div>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đơn lịch sử chưa có snapshot địa chỉ nhận hàng." />}
        {trackingRows.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đơn hàng chưa có thông tin vận chuyển." />
        ) : (
          <>
            <div className="order-workspace__shipping-facts">
              <div><span>Đơn vị vận chuyển</span><strong>{trackingRows[0].carrier}</strong></div>
              <div>
                <span>Mã vận đơn</span>
                <strong>
                  {trackingRows[0].trackingNumber}
                  <Button
                    type="text"
                    size="small"
                    aria-label="Sao chép mã vận đơn"
                    icon={<CopyOutlined />}
                    onClick={() => void navigator.clipboard?.writeText(trackingRows[0].trackingNumber)}
                  />
                </strong>
              </div>
              <div><span>Sản phẩm</span><strong>{trackingRows[0].products}</strong></div>
              <div><span>Trạng thái giao hàng</span><Tag color="blue">{statusMeta.label}</Tag></div>
              <div><span>Ngày gửi</span><strong>{formatDateTime(trackingRows[0].createdAt ?? undefined)}</strong></div>
            </div>
            {trackingRows.length > 1 ? (
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                scroll={{ x: 620 }}
                dataSource={trackingRows}
                columns={[
                  { title: "Mã vận đơn", dataIndex: "trackingNumber", key: "trackingNumber", width: 180 },
                  { title: "Đơn vị", dataIndex: "carrier", key: "carrier", width: 140 },
                  { title: "Sản phẩm", dataIndex: "products", key: "products" },
                ]}
              />
            ) : null}
          </>
        )}
        <Button icon={<InboxOutlined />} onClick={onManageTracking}>Quản lý mã vận đơn</Button>
      </section>
      <section className="order-workspace__shipping-timeline">
        <div className="order-workspace__section-heading">
          <HistoryOutlined />
          <div><Title level={4}>Lộ trình vận chuyển</Title><Text type="secondary">Không tạo sự kiện giả khi chưa có tracking.</Text></div>
        </div>
        {shippingEvents.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có sự kiện vận chuyển." />
        ) : (
          <Timeline items={shippingEvents.map((entry) => ({
            color: "#1764c0",
            children: <div className="order-workspace__timeline-entry"><div><Text strong>{entry.title}</Text><p>{entry.description}</p></div><Text type="secondary" className="order-workspace__timeline-date">{formatDateTime(entry.createdAt)}</Text></div>,
          }))} />
        )}
      </section>
    </div>
  );

  const notesTab = (
    <div className="order-workspace__notes-grid">
      <section className="order-workspace__notes">
        <div className="order-workspace__section-heading">
          <FileTextOutlined />
          <div><Title level={4}>Ghi chú & yêu cầu</Title><Text type="secondary">Nội dung ghi chú hiện có của đơn hàng.</Text></div>
        </div>
        <Input.TextArea value={displayNote} readOnly rows={7} maxLength={500} placeholder="Chưa có ghi chú." />
        <div className="order-workspace__note-footer"><Text type="secondary">Chế độ chỉ đọc theo API hiện tại.</Text><Text type="secondary">{displayNote.length} / 500</Text></div>
      </section>
      <section className="order-workspace__note-history">
        <div className="order-workspace__section-heading">
          <HistoryOutlined />
          <div><Title level={4}>Lịch sử ghi chú</Title><Text type="secondary">Chỉ hiển thị khi backend có nguồn lịch sử riêng.</Text></div>
        </div>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có lịch sử ghi chú riêng." />
      </section>
    </div>
  );

  const historyTab = (
    <section>
      <div className="order-workspace__section-heading">
        <HistoryOutlined />
        <div><Title level={4}>Lịch sử đơn hàng</Title><Text type="secondary">Chỉ gồm những sự kiện có dữ liệu thực tế.</Text></div>
      </div>
      {historyEntries.length === 0 ? <Empty description="Chưa có lịch sử đơn hàng." /> : (
        <Timeline className="order-workspace__history" items={historyEntries.map((entry) => ({
          color: "#1764c0",
          dot: <CheckCircleOutlined />,
          children: <div className="order-workspace__history-entry"><div><Text strong>{entry.title}</Text><p>{entry.description}</p></div><Text type="secondary">{formatDateTime(entry.createdAt)}</Text></div>,
        }))} />
      )}
    </section>
  );

  return (
    <div className="order-workspace">
      <header className="order-workspace__header">
        <Breadcrumb items={[{ title: <Link to="/orders"><HomeOutlined /> Đơn hàng</Link> }, { title: "Chi tiết đơn hàng" }]} />
        <div className="order-workspace__headline">
          <div className="order-workspace__identity">
            <div className="order-workspace__identity-icon"><ShoppingOutlined /></div>
            <div>
              <div className="order-workspace__title-row">
                <Title level={1}>{order.order_code}</Title>
                <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
              </div>
              <Text type="secondary">Ngày tạo: {formatDateTime(order.created_at)} · Nguồn: {sourceLabel} · Tạo bởi: {creatorLabel}</Text>
            </div>
          </div>
          <div className="order-workspace__actions">
            <Button type="primary" icon={<CheckCircleOutlined />} loading={updating} disabled={!primaryAction.enabled} onClick={onPrimaryAction}>{primaryAction.label}</Button>
            {!hasPrimaryTrackingAction ? <Button icon={<InboxOutlined />} onClick={onManageTracking}>Quản lý mã vận đơn</Button> : null}
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>Làm mới</Button>
            <DeleteButton resource="orders" recordItemId={order.id} icon={<DeleteOutlined />}>Hủy đơn</DeleteButton>
          </div>
        </div>
        <Steps className="order-workspace__steps" current={currentStep} responsive={false} items={journeySteps.map((step) => ({ title: step.title, icon: step.icon }))} />
      </header>

      <main className="order-workspace__overview">
        <section className="order-workspace__customer-strip">
            <div className="order-workspace__section-heading"><UserOutlined /><Title level={4}>Thông tin khách hàng</Title></div>
            <div className="order-workspace__customer-grid">
              <div><UserOutlined /><strong>{order.customer?.name ?? "-"}</strong></div>
              <div><MailOutlined /><strong>{order.customer?.email ?? "-"}</strong></div>
              <div><PhoneOutlined /><strong>{order.customer?.phone ?? "-"}</strong></div>
              <div><EnvironmentOutlined /><strong>{shippingAddress?.full_address ?? "Đơn lịch sử chưa có snapshot địa chỉ"}</strong></div>
            </div>
        </section>

        <section className="order-workspace__products">
            <div className="order-workspace__section-heading"><ShoppingOutlined /><Title level={4}>Danh sách sản phẩm ({productRows.length})</Title></div>
            <Table
              className="order-products-scroll"
              rowKey="key"
              dataSource={productRows}
              columns={compactProductColumns}
              pagination={false}
              tableLayout="fixed"
              scroll={productRows.length > 2 ? { y: 156 } : undefined}
              locale={{ emptyText: "Chưa có sản phẩm trong đơn hàng." }}
            />
        </section>

        <aside className="order-workspace__summary">
          <div className="order-workspace__section-heading"><DollarCircleOutlined /><Title level={4}>Tổng quan đơn hàng</Title></div>
          <div className="order-workspace__summary-row"><span>Tiền hàng ({productRows.length} sản phẩm)</span><strong>{productTotalVnd > 0 ? formatVnd(productTotalVnd) : formatCny(productTotalCny)}</strong></div>
          <div className="order-workspace__summary-row"><span>Tổng tiền CNY</span><strong>{formatCny(productTotalCny)}</strong></div>
          <div className="order-workspace__summary-deposit"><span>Đặt cọc {hasDepositRequest ? `(${depositPercent}%)` : ""}</span><strong>{hasDepositRequest ? formatVnd(depositAmount) : "Chưa phát hành"}</strong></div>
          <div className="order-workspace__summary-row"><span>Trạng thái</span><Tag color={hasPaidDeposit ? "blue" : "gold"}>{paymentStatusLabel(order)}</Tag></div>
        </aside>
      </main>

      <section className="order-workspace__tabs">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          destroyOnHidden={false}
          items={[
            { key: "payment", label: <span><DollarCircleOutlined /> Thanh toán & đặt cọc</span>, children: paymentTab },
            { key: "shipping", label: <span><TruckOutlined /> Vận chuyển</span>, children: shippingTab },
            { key: "notes", label: <span><FileTextOutlined /> Ghi chú & yêu cầu</span>, children: notesTab },
            { key: "history", label: <span><HistoryOutlined /> Lịch sử đơn hàng</span>, children: historyTab },
          ]}
        />
      </section>
    </div>
  );
};
