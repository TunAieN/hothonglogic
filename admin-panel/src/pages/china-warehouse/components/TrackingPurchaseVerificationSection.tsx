import { useState } from "react";
import { Alert, Button, Input, Select, Spin, Typography } from "antd";
import type { Purchase, useTrackingPurchaseVerification } from "./useTrackingPurchaseVerification";

const messages = {
  linked: "Đã xác định đơn mua Taobao liên quan.",
  conflict: "Item đã kiểm hoặc số lượng vượt phạm vi đơn mua đang liên kết. Cần kiểm tra nguồn giao hàng.",
  candidates: "Chưa xác định nguồn mua. Đối chiếu ứng viên với bằng chứng giao hàng.",
  no_items: "Chọn sản phẩm thực tế trong kiện để hệ thống kiểm tra các đơn mua Taobao liên quan.",
  no_purchase_data: "Đơn VietTrung này chưa có dữ liệu mua Taobao.",
  unknown: "Chưa xác định nguồn mua. Các item đã chọn chưa khớp dòng mua Taobao.",
};

const purchaseLabel = (purchase: Purchase) => `${purchase.code} · ${purchase.shop || "Chưa có tên shop"}`;

const fullLine = (value: string) => (
  <Typography.Text className="cn-inspection-ellipsis" ellipsis={{ tooltip: value }}>{value}</Typography.Text>
);

const PurchaseSummary = ({ purchase, linked }: { purchase: Purchase; linked: boolean }) => (
  <div className="cn-inspection-purchase">
    {fullLine(purchaseLabel(purchase))}
    <Typography.Text type="secondary">{linked ? "Đã liên kết tracking này" : "Chưa liên kết tracking này"}</Typography.Text>
    {purchase.items.map((item) => (
      <div key={item.order_item_id}>
        {fullLine(`${item.name || "Sản phẩm lịch sử"} · ${item.variant || "—"} · Đã mua ${item.quantity}`)}
      </div>
    ))}
  </div>
);

export const TrackingPurchaseVerificationSection = ({
  verification, canInspect, canVerify, unsavedItems, disabled, saving, onVerify,
}: {
  verification: ReturnType<typeof useTrackingPurchaseVerification>;
  canInspect: boolean;
  canVerify: boolean;
  unsavedItems: boolean;
  disabled: boolean;
  saving: boolean;
  onVerify: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const { data, selected, reason, setSelected, setReason, loadError, loading, retry } = verification;
  return (
    <div className="cn-inspection-stack">
      {loadError && <Alert type="error" showIcon message="Không thể tải kết quả đối chiếu."
        action={<Button size="small" disabled={disabled} onClick={retry}>Thử lại</Button>} />}
      {loading && <Spin size="small" />}
      {data && <>
        <div className="cn-inspection-purchase-status">
          <Typography.Text strong>
            {data.status === "no_items" && !canInspect ? "Kiện này chưa có item đã xác nhận để đối chiếu." : messages[data.status]}
          </Typography.Text>
          <Button size="small" type="link" disabled={disabled} onClick={retry}>Tải lại</Button>
        </div>
        {data.ambiguous && <Alert showIcon type="warning"
          message="Có nhiều đơn mua Taobao chứa cùng sản phẩm. Cần xác minh nguồn giao hàng." />}
        {data.linked_purchases.map((purchase) => <PurchaseSummary key={purchase.id} purchase={purchase} linked />)}
        {data.candidates.map((purchase) => <PurchaseSummary key={purchase.id} purchase={purchase} linked={false} />)}
        {!canVerify && <Typography.Text type="secondary">Thông tin chi tiết về nguồn mua dành cho người có quyền.</Typography.Text>}
        {canVerify && data.candidates.length > 0 && <>
          <Button className="cn-inspection-verify-toggle" size="small" aria-expanded={expanded} disabled={disabled}
            onClick={() => setExpanded(!expanded)}>{expanded ? "Thu gọn xác minh nguồn mua" : "Xác minh nguồn mua"}</Button>
          {expanded && <>
            <Typography.Text type="secondary">
              Dùng vận đơn hoặc bảng kê giao hàng của shop làm căn cứ. SKU chỉ giúp tìm ứng viên.
            </Typography.Text>
            {unsavedItems && <Typography.Text type="secondary">Lưu xác nhận item trước khi bổ sung liên kết.</Typography.Text>}
            <Select mode="multiple" allowClear value={selected} onChange={setSelected} disabled={disabled}
              maxTagTextLength={36}
              aria-label="Đơn mua Taobao có bằng chứng giao hàng"
              placeholder="Chọn đơn mua có bằng chứng giao hàng"
              options={data.candidates.map((purchase) => ({ value: purchase.id, label: purchaseLabel(purchase) }))} />
            <Input.TextArea aria-label="Căn cứ xác minh" placeholder="Nhập căn cứ xác minh từ chứng từ giao hàng"
              maxLength={1000} rows={2} value={reason} disabled={disabled} onChange={(event) => setReason(event.target.value)} />
            <Button className="cn-inspection-verify-toggle" loading={saving}
              disabled={disabled || unsavedItems || !verification.canSave} onClick={onVerify}>
              Lưu xác minh Taobao
            </Button>
          </>}
        </>}
      </>}
    </div>
  );
};
