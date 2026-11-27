import { useMemo } from "react";
import { Alert, Button, Collapse, Input, InputNumber, Modal, Tag } from "antd";
import {
  BankOutlined, BellOutlined, CheckCircleFilled, ClockCircleOutlined, CloseOutlined,
  CopyOutlined, DollarOutlined, ReloadOutlined, SafetyCertificateOutlined, SendOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { OrderSummary } from "../../../shared/types/order";
import "./deposit-payment-tracking-modal.css";

const vnd = (value: number) => `${Math.round(value || 0).toLocaleString("vi-VN")} VND`;
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString("vi-VN") : "—";

type Props = {
  open: boolean;
  order?: OrderSummary;
  loading: boolean;
  manualAmount: number | null;
  manualCode: string;
  manualReason: string;
  onManualAmountChange: (value: number | null) => void;
  onManualCodeChange: (value: string) => void;
  onManualReasonChange: (value: string) => void;
  onManualConfirm: () => void;
  onReminder: () => void;
  onRefresh: () => void;
  onClose: () => void;
};

export function DepositPaymentTrackingModal({
  open, order, loading, manualAmount, manualCode, manualReason,
  onManualAmountChange, onManualCodeChange, onManualReasonChange,
  onManualConfirm, onReminder, onRefresh, onClose,
}: Props) {
  const voucher = order?.depositVoucher;
  const automation = voucher?.paymentAutomation;
  const intent = automation?.intent;
  const event = automation?.latest_event;
  const notifications = automation?.notifications ?? [];
  const requested = Boolean(voucher);
  const notified = notifications.some((item) => item.type === "deposit_requested" || item.type === "deposit_reminder");
  const received = Boolean(event);
  const reconciled = event?.status === "processed" || event?.status === "reconciliation_needed";
  const paid = voucher?.status === "paid";
  const needsReview = event?.status === "reconciliation_needed" || intent?.display_status === "reconciliation_needed";
  const remaining = Number(voucher?.remaining_amount ?? order?.deposit_remaining_amount_vnd ?? 0);
  const amount = Number(voucher?.total_amount ?? order?.deposit_amount_vnd ?? 0);
  const percent = Number(voucher?.deposit_percent ?? order?.deposit_percent ?? 0);
  const latestTransaction = voucher?.transactions?.slice().sort((a, b) => Number(b.id) - Number(a.id))[0];
  const lastNotification = notifications[0];
  const timeline = useMemo(() => [
    ["Tạo yêu cầu cọc", requested, voucher?.created_at],
    ["Đã gửi thông báo", notified, lastNotification?.sent_at],
    ["Nhận giao dịch", received, event?.occurred_at],
    [needsReview ? "Cần đối soát" : "Tự đối soát", reconciled, event?.processed_at || event?.occurred_at],
    ["Đã xác nhận", paid, latestTransaction?.received_at],
  ] as const, [event, lastNotification, latestTransaction, needsReview, notified, paid, received, reconciled, requested, voucher?.created_at]);
  const copy = (value?: string | null) => { if (value) void navigator.clipboard.writeText(value); };
  const manualDisabled = !voucher || paid || remaining <= 0 || manualAmount !== remaining || !manualCode.trim() || manualReason.trim().length < 10;

  return <Modal open={open} onCancel={onClose} footer={null} width={920} centered destroyOnHidden={false} className="deposit-tracking-modal" closeIcon={<CloseOutlined />} title={null}>
    <header className="deposit-tracking-modal__header">
      <span><DollarOutlined /></span><div><h2>Theo dõi thanh toán đặt cọc</h2><p>Đối soát SePay tự động; xác nhận thủ công chỉ dùng khi có căn cứ ngân hàng.</p></div>
    </header>
    <div className="deposit-tracking-modal__body">
      <section className="deposit-tracking-modal__summary">
        <div><small>Mã đơn hàng</small><strong>{order?.order_code ?? "—"}</strong></div>
        <div><small>Khách hàng</small><strong><UserOutlined /> {order?.customer?.name ?? "—"}</strong></div>
        <div><small>VIP</small><strong>{order?.customer?.vipTier?.name ?? order?.customer?.vip_group ?? "—"}</strong></div>
        <div><small>Tỷ lệ cọc</small><strong>{percent ? `${percent}%` : "—"}</strong></div>
        <div><small>Tiền đặt cọc</small><strong className="deposit-tracking-modal__amount">{vnd(amount)}</strong></div>
      </section>

      {!automation?.enabled && <Alert type="warning" showIcon message="Tự xác nhận đặt cọc qua SePay đang tắt" description="Hệ thống sẽ không tự ghi nhận khoản cọc cho đến khi feature flag được bật." />}
      {needsReview && <Alert type="warning" showIcon message="Giao dịch cần đối soát thủ công" description={event?.reconciliation_reason || "Dữ liệu giao dịch chưa đáp ứng điều kiện tự xác nhận."} />}

      <section className="deposit-tracking-modal__timeline" aria-label="Tiến trình thanh toán">
        {timeline.map(([label, done, at], index) => <div key={label} data-done={done}>
          <span>{done ? <CheckCircleFilled /> : <ClockCircleOutlined />}</span>
          <strong>{label}</strong><small>{done ? dateTime(at) : "Chưa hoàn tất"}</small>{index < timeline.length - 1 && <i />}
        </div>)}
      </section>

      <div className="deposit-tracking-modal__grid">
        <section className="deposit-tracking-modal__card">
          <header><SafetyCertificateOutlined /><h3>Trạng thái thanh toán</h3><Tag color={paid ? "success" : needsReview ? "warning" : "processing"}>{paid ? "Đã thanh toán / Đã tự xác nhận" : needsReview ? "Cần đối soát" : "Đang chờ thanh toán"}</Tag></header>
          <dl>
            <div><dt>Số tiền còn lại</dt><dd>{vnd(remaining)}</dd></div>
            <div><dt>Mã giao dịch</dt><dd>{event?.provider_transaction_id || latestTransaction?.bank_transaction_code || "Chưa nhận"}</dd></div>
            <div><dt>Nguồn xác nhận</dt><dd>{latestTransaction?.confirmation_source === "sepay_auto" ? "SePay tự động" : latestTransaction ? "Thủ công" : "Chưa xác nhận"}</dd></div>
            <div><dt>Thời gian thanh toán</dt><dd>{dateTime(latestTransaction?.received_at || event?.occurred_at)}</dd></div>
          </dl>
        </section>
        <section className="deposit-tracking-modal__card">
          <header><BellOutlined /><h3>Thông báo khách hàng</h3><Tag color={notified ? "success" : "default"}>{notified ? "Đã gửi" : "Chưa gửi"}</Tag></header>
          <p>{lastNotification?.title || "Chưa có thông báo nào được ghi nhận."}</p>
          <small>{lastNotification ? `Gửi lần cuối: ${dateTime(lastNotification.sent_at || lastNotification.created_at)}` : "Thông báo chỉ được tạo sau khi dữ liệu nghiệp vụ commit."}</small>
          <div className="deposit-tracking-modal__actions"><Button icon={<SendOutlined />} disabled={paid || !voucher} loading={loading} onClick={onReminder}>Gửi nhắc nhở</Button><Button icon={<ReloadOutlined />} onClick={onRefresh}>Làm mới</Button></div>
        </section>
      </div>

      <section className="deposit-tracking-modal__bank">
        <div><BankOutlined /><span><small>Ngân hàng</small><strong>{intent?.bank_name || voucher?.bank_name_snapshot || "—"}</strong></span></div>
        <div><span><small>Số tài khoản</small><strong>{intent?.account_number || voucher?.bank_account_number_snapshot || "—"}</strong></span><Button type="text" icon={<CopyOutlined />} onClick={() => copy(intent?.account_number || voucher?.bank_account_number_snapshot)} /></div>
        <div><span><small>Nội dung chuyển khoản</small><strong>{intent?.reference || voucher?.transfer_content || "—"}</strong></span><Button type="text" icon={<CopyOutlined />} onClick={() => copy(intent?.reference || voucher?.transfer_content)} /></div>
        {intent?.qr_url && !paid ? <img src={intent.qr_url} alt={`QR thanh toán ${intent.reference}`} /> : null}
      </section>

      <Collapse ghost items={[{ key: "manual", label: "Xác nhận thủ công (dự phòng có kiểm soát)", children: <div className="deposit-tracking-modal__manual">
        <Alert type="warning" showIcon message="Chỉ dùng khi webhook không thể ghi nhận nhưng đã có bằng chứng ngân hàng." />
        <InputNumber min={1} precision={0} value={manualAmount} onChange={(value) => onManualAmountChange(value === null ? null : Number(value))} addonAfter="VND" style={{ width: "100%" }} />
        <Input value={manualCode} onChange={(event) => onManualCodeChange(event.target.value)} placeholder="Mã tham chiếu ngân hàng" />
        <Input.TextArea value={manualReason} onChange={(event) => onManualReasonChange(event.target.value)} placeholder="Căn cứ ngân hàng và lý do xác nhận (tối thiểu 10 ký tự)" autoSize={{ minRows: 3, maxRows: 5 }} />
        <Button danger disabled={manualDisabled} loading={loading} onClick={onManualConfirm}>Xác nhận thủ công</Button>
      </div> }]} />
    </div>
    <footer className="deposit-tracking-modal__footer"><Button onClick={onClose}>Đóng</Button></footer>
  </Modal>;
}
