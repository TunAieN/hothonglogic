import {
  Alert,
  Avatar,
  Button,
  Checkbox,
  Empty,
  Input,
  Modal,
  Select,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CalculatorOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CrownOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
  ShoppingCartOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { Order, OrderItem } from "../../../shared/types";
import { formatCny, formatVnd } from "../../../shared/utils/currency";
import "./order-confirmation-modal.css";

const { Text, Title } = Typography;

export type RiskDepositPolicy = {
  id: string;
  code: string;
  name: string;
  priority: number;
  minimum_deposit_percent?: number | null;
  surcharge_percent?: number | null;
  requires_manager_approval: boolean;
  is_active: boolean;
};

export type DepositPolicyPreview = {
  vip_code?: string | null;
  vip_name?: string | null;
  qualified_spend_vnd: number;
  vip_policy_enabled: boolean;
  vip_proposed_percent?: number | null;
  vip_effective_percent?: number | null;
  risk_code?: string | null;
  risk_name?: string | null;
  risk_minimum_percent?: number | null;
  risk_surcharge_percent?: number | null;
  additive_percent?: number | null;
  risk_requires_manager_approval: boolean;
  capital_minimum_percent?: number | null;
  recommended_percent: number;
  fallback_percent: number;
  fallback_applied: boolean;
  policy_formula: string;
  policy_configuration_valid: boolean;
  product_total_cny: number;
  exchange_rate?: number | null;
  exchange_rate_locked: boolean;
  product_total_vnd: number;
  deposit_amount_vnd?: number | null;
  can_calculate: boolean;
  calculation_message: string;
  can_approve_exception: boolean;
};

export type RiskAssessmentEvidence = {
  seller_checked: boolean;
  product_checked: boolean;
  returns_checked: boolean;
  anomaly_checked: boolean;
};

type Props = {
  open: boolean;
  order?: Order;
  loading: boolean;
  policies: RiskDepositPolicy[];
  policiesLoading: boolean;
  policiesError?: string | null;
  preview?: DepositPolicyPreview | null;
  previewLoading: boolean;
  previewError?: string | null;
  riskLevel: string;
  riskReason: string;
  waiveDeposit: boolean;
  exceptionReason: string;
  evidence: RiskAssessmentEvidence;
  onRiskLevelChange: (value: string) => void;
  onRiskReasonChange: (value: string) => void;
  onWaiveDepositChange: (value: boolean) => void;
  onExceptionReasonChange: (value: string) => void;
  onEvidenceChange: (key: keyof RiskAssessmentEvidence, value: boolean) => void;
  onRetry: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const formatPercent = (value?: number | null) =>
  value == null ? "Chưa cấu hình" : `${Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
const formatSurcharge = (value?: number | null) =>
  value == null ? "Chưa cấu hình" : `+${formatPercent(value)}`;

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
};

const itemSubtotal = (item: OrderItem) =>
  Number(item.subtotal_cny) > 0
    ? Number(item.subtotal_cny)
    : Number(item.price_cny) * Number(item.quantity);

export function OrderConfirmationModal({
  open,
  order,
  loading,
  policies,
  policiesLoading,
  policiesError,
  preview,
  previewLoading,
  previewError,
  riskLevel,
  riskReason,
  waiveDeposit,
  exceptionReason,
  evidence,
  onRiskLevelChange,
  onRiskReasonChange,
  onWaiveDepositChange,
  onExceptionReasonChange,
  onEvidenceChange,
  onRetry,
  onCancel,
  onConfirm,
}: Props) {
  const items = order?.items ?? [];
  const hasSellerData = items.length > 0 && items.some((item) => Boolean(item.shop_name || item.seller || item.shop_id));
  const hasValidProducts = items.length > 0 && items.every((item) => item.product_name && Number(item.quantity) > 0 && Number(item.price_cny) > 0);
  const selectedRisk = policies.find((policy) => policy.code === riskLevel);
  const needsException = waiveDeposit || Boolean(selectedRisk?.requires_manager_approval);
  const disabledReasons = [
    !order ? "Chưa tải được dữ liệu đơn hàng." : null,
    policiesLoading ? "Đang tải danh mục rủi ro." : null,
    policiesError ? "Danh mục rủi ro đang lỗi; hãy thử tải lại." : null,
    previewLoading ? "Backend đang tính tỷ lệ và số tiền đặt cọc." : null,
    previewError ? "Không lấy được breakdown đặt cọc từ backend." : null,
    !riskLevel ? "Chọn mức rủi ro cuối cùng sau khi kiểm tra." : null,
    riskReason.trim().length < 10 ? "Nhập căn cứ đánh giá rủi ro tối thiểu 10 ký tự." : null,
    preview && !preview.can_calculate ? preview.calculation_message : null,
    needsException && !preview?.can_approve_exception ? "Tài khoản không có quyền phê duyệt ngoại lệ đặt cọc." : null,
    needsException && preview?.can_approve_exception && !exceptionReason.trim() ? "Nhập lý do phê duyệt ngoại lệ." : null,
    riskLevel === "low" && (!evidence.seller_checked || !evidence.product_checked || !evidence.anomaly_checked) ? "Mức Thấp yêu cầu xác nhận đã kiểm tra shop, sản phẩm và dấu hiệu bất thường." : null,
  ].filter((reason): reason is string => Boolean(reason));
  const readyToSubmit = disabledReasons.length === 0 && !loading;

  const checklist = [
    {
      key: "seller",
      title: "Thông tin nhà bán hàng (shop)",
      detail: hasSellerData
        ? "Đơn có tên/mã shop do người tạo đơn cung cấp; chưa có nguồn xác minh uy tín shop."
        : "Chưa có tên, mã hoặc thông tin nhà bán hàng để đối chiếu.",
      state: "unverified",
      checked: evidence.seller_checked,
    },
    {
      key: "product",
      title: "Sản phẩm, giá và số lượng",
      detail: hasValidProducts
        ? "Các dòng sản phẩm có tên, giá CNY và số lượng hợp lệ về định dạng."
        : "Thiếu tên, giá CNY hoặc số lượng hợp lệ ở ít nhất một sản phẩm.",
      state: hasValidProducts ? "valid" : "danger",
      checked: evidence.product_checked,
    },
    {
      key: "returns",
      title: "Chính sách đổi trả & vận chuyển",
      detail: "Hệ thống chưa có dữ liệu xác minh điều kiện đổi trả và vận chuyển của shop.",
      state: "unverified",
      checked: evidence.returns_checked,
    },
    {
      key: "anomaly",
      title: "Dấu hiệu bất thường / rủi ro khác",
      detail: riskReason.trim()
        ? "Nhân viên đã nhập ghi chú đánh giá; mức rủi ro chỉ được ghi nhận khi xác nhận đơn."
        : "Chưa có kết luận; nhân viên cần kiểm tra và ghi rõ căn cứ đánh giá.",
      state: riskReason.trim() ? "available" : "unverified",
      checked: evidence.anomaly_checked,
    },
  ];

  const columns = [
    {
      title: "Sản phẩm",
      key: "product",
      render: (_: unknown, item: OrderItem) => (
        <div className="order-confirmation__product">
          {item.product_image ? <img src={item.product_image} alt="" /> : <div className="order-confirmation__product-placeholder"><ShoppingCartOutlined /></div>}
          <div><Tooltip title={item.product_name}><strong>{item.product_name}</strong></Tooltip><span>{[item.color, item.size].filter(Boolean).join(" / ") || "Chưa có phân loại"}</span></div>
        </div>
      ),
    },
    { title: "Shop", key: "shop", width: 150, render: (_: unknown, item: OrderItem) => { const shop = item.shop_name || item.seller || "Chưa có"; return <Tooltip title={shop}><span className="order-confirmation__shop">{shop}</span></Tooltip>; } },
    { title: "SL", dataIndex: "quantity", key: "quantity", align: "center" as const, width: 72 },
    { title: "Đơn giá", dataIndex: "price_cny", key: "price", align: "right" as const, render: (value: number) => formatCny(Number(value)) },
    { title: "Thành tiền", key: "subtotal", align: "right" as const, render: (_: unknown, item: OrderItem) => <strong>{formatCny(itemSubtotal(item))}</strong> },
  ];

  const policyMessage = preview?.vip_policy_enabled
    ? "Chính sách VIP đang có hiệu lực; tỷ lệ cuối do backend lấy theo sàn cao nhất đã cấu hình."
    : `Chính sách cọc VIP chưa kích hoạt. Backend đang giữ mức hiện hành ${formatPercent(preview?.fallback_percent ?? 70)} khi không có sàn nào có hiệu lực.`;

  return (
    <Modal
      open={open}
      width={940}
      centered
      closable={false}
      footer={null}
      onCancel={loading ? undefined : onCancel}
      className="order-confirmation"
      wrapClassName="order-confirmation-wrap"
      destroyOnHidden
    >
      <header className="order-confirmation__header">
        <div className="order-confirmation__header-icon"><SafetyCertificateOutlined /></div>
        <div>
          <Title level={3}>Xác nhận & thiết lập đặt cọc đơn hàng</Title>
          <Text>Đánh giá rủi ro bằng dữ liệu hiện có trước khi tạo nghĩa vụ đặt cọc</Text>
        </div>
        <Button type="text" aria-label="Đóng" icon={<CloseOutlined />} onClick={onCancel} disabled={loading} />
      </header>

      <div className="order-confirmation__body">
        <section className="order-confirmation__overview">
          <div className="order-confirmation__overview-cell"><span>Đơn hàng</span><Tooltip title={order?.order_code}><strong>{order?.order_code ?? "-"}</strong></Tooltip><small>{formatDateTime(order?.created_at)} · {order?.accountManager?.name ?? "Chưa phân công"}</small></div>
          <div className="order-confirmation__overview-cell order-confirmation__overview-customer"><Avatar size={34} icon={<UserOutlined />} src={order?.customer?.avatar} /><div><span>Khách hàng</span><Tooltip title={order?.customer?.email}><strong>{order?.customer?.name ?? "-"}</strong></Tooltip></div></div>
          <div className="order-confirmation__overview-cell"><span><CrownOutlined /> VIP hiệu lực</span><strong>{preview?.vip_name ?? order?.customer?.vipTier?.name ?? order?.customer?.vip_group ?? "Chưa phân hạng"}</strong><small>{formatVnd(preview?.qualified_spend_vnd ?? Number(order?.customer?.vip_qualified_spend_vnd ?? 0))} hợp lệ</small></div>
          <div className="order-confirmation__overview-cell order-confirmation__overview-rate"><span>Tỷ lệ đang áp dụng</span><strong>{formatPercent(preview?.recommended_percent)}</strong><small>{preview?.vip_policy_enabled ? "Theo chính sách có hiệu lực" : "Fallback hiện hành"}</small></div>
        </section>

        {(policiesError || previewError) ? (
          <Alert className="order-confirmation__error" type="error" showIcon message="Không tải được dữ liệu chính sách" description={previewError || policiesError} action={<Button onClick={onRetry}>Thử lại</Button>} />
        ) : null}

        <section className="order-confirmation__grid">
          <article className="order-confirmation__panel">
            <div className="order-confirmation__panel-title"><SafetyCertificateOutlined /><strong>Đánh giá rủi ro đơn hàng (Taobao)</strong></div>
            <div className="order-confirmation__risk-summary">
              <div><span>Đề xuất tự động</span><strong className="is-unverified">Chưa đủ dữ liệu</strong></div>
              <div><span>Đánh giá cuối của nhân viên</span><strong className={!riskLevel ? "is-unverified" : ""}>{selectedRisk?.name ?? "Chưa xác nhận"}</strong></div>
            </div>
            <label className="order-confirmation__field-label" htmlFor="order-risk-level">Mức rủi ro sau khi kiểm tra</label>
            <Select
              id="order-risk-level"
              aria-label="Mức rủi ro"
              value={riskLevel || undefined}
              placeholder={policiesLoading ? "Đang tải chính sách..." : "Chọn mức rủi ro"}
              loading={policiesLoading}
              disabled={policiesLoading || Boolean(policiesError) || loading}
              onChange={onRiskLevelChange}
              options={policies.map((policy) => ({ value: policy.code, label: policy.name }))}
            />
            {riskLevel === "high" ? <Alert type="warning" showIcon message="Rủi ro Cao: cần ghi rõ bằng chứng và khả năng xử lý khi phát sinh vấn đề." /> : null}
            {selectedRisk?.requires_manager_approval ? <Alert type="error" showIcon message="Mức Đặc biệt bắt buộc tài khoản có quyền quản lý phê duyệt và nhập lý do phê duyệt." /> : null}
            <div className="order-confirmation__risk-floor"><span>Phụ thêm khi chính sách bật</span><strong>{riskLevel ? formatSurcharge(preview?.risk_surcharge_percent) : "Chưa đánh giá"}</strong></div>
            <div className="order-confirmation__checklist-title"><strong>Tiêu chí đánh giá</strong><span>Bấm từng mục để xem căn cứ</span></div>
            <div className="order-confirmation__checklist">
              {checklist.map((item) => (
                <details className={`order-confirmation__check-item is-${item.state}`} key={item.key}>
                  <summary><Checkbox checked={item.checked} onChange={(event) => onEvidenceChange(`${item.key}_checked` as keyof RiskAssessmentEvidence, event.target.checked)} onClick={(event) => event.stopPropagation()} /><strong>{item.title}</strong><Tag>{item.checked ? "Đã kiểm tra" : item.state === "danger" ? "Cần sửa" : "Chưa xác minh"}</Tag></summary>
                  <p>{item.detail}</p>
                </details>
              ))}
            </div>
            <label className="order-confirmation__field-label" htmlFor="order-risk-reason">Ghi chú và căn cứ đánh giá <span>*</span></label>
            <Input.TextArea id="order-risk-reason" aria-label="Lý do đánh giá rủi ro" value={riskReason} onChange={(event) => onRiskReasonChange(event.target.value)} maxLength={500} showCount rows={3} placeholder="Ghi rõ dữ liệu đã kiểm tra, dữ liệu còn thiếu và dấu hiệu cần lưu ý..." disabled={loading} />
          </article>

          <article className="order-confirmation__panel">
            <div className="order-confirmation__panel-title order-confirmation__panel-title--split"><span><CalculatorOutlined /><strong>Tính toán mức đặt cọc</strong></span><Tag color={preview?.vip_policy_enabled ? "green" : "gold"}>Chính sách VIP: {preview?.vip_policy_enabled ? "Đang hoạt động" : "Chưa kích hoạt"}</Tag></div>
            {previewLoading ? <div className="order-confirmation__loading"><Spin /><span>Backend đang tính breakdown...</span></div> : (
              <>
                <div className="order-confirmation__breakdown">
                  <div><span><CrownOutlined /> Tỷ lệ theo VIP ({preview?.vip_name ?? "Chưa phân hạng"})</span><strong>{preview?.vip_policy_enabled ? formatPercent(preview.vip_effective_percent) : <Tooltip title="Mức đề xuất trong cấu hình, chưa có hiệu lực"><span>{formatPercent(preview?.vip_proposed_percent)} <small>đề xuất</small></span></Tooltip>}</strong></div>
                  <div><span><SafetyCertificateOutlined /> Phụ thêm rủi ro ({preview?.risk_name ?? "chưa đánh giá"})</span><strong>{riskLevel ? <>{formatSurcharge(preview?.risk_surcharge_percent)} {!preview?.vip_policy_enabled ? <small>chưa áp dụng</small> : null}</> : "Chưa đánh giá"}</strong></div>
                  {preview?.risk_minimum_percent != null ? <div><span>Sàn cọc tuyệt đối</span><strong>{formatPercent(preview.risk_minimum_percent)}</strong></div> : null}
                  {preview?.capital_minimum_percent != null ? <div><span>Giới hạn vốn theo hạng</span><strong>{formatPercent(preview.capital_minimum_percent)}</strong></div> : null}
                  <div className="order-confirmation__final-rate"><span>Tỷ lệ đặt cọc backend áp dụng</span><strong>{formatPercent(preview?.recommended_percent)}</strong></div>
                </div>
                <Alert type={preview?.vip_policy_enabled ? "info" : "warning"} showIcon message={policyMessage} />
                <div className="order-confirmation__money">
                  <div><span>Tổng giá trị sản phẩm</span><strong>{formatCny(preview?.product_total_cny ?? 0)}</strong></div>
                  <div><span>Tỷ giá {preview?.exchange_rate_locked ? "đã khóa" : "xem trước"}</span><strong>{preview?.exchange_rate ? `${Number(preview.exchange_rate).toLocaleString("vi-VN")} VND/CNY` : "Chưa có"}</strong></div>
                  <div><span>Tổng giá trị đơn (VND)</span><strong>{preview?.can_calculate ? formatVnd(preview.product_total_vnd) : "Chưa tính được"}</strong></div>
                  <div className="order-confirmation__deposit-total"><span>Số tiền cần đặt cọc ({formatPercent(preview?.recommended_percent)})</span><strong>{preview?.can_calculate && preview.deposit_amount_vnd != null ? formatVnd(preview.deposit_amount_vnd) : "Chưa đủ dữ liệu"}</strong></div>
                </div>
                <Alert type={preview?.can_calculate ? "info" : "error"} showIcon message={preview?.calculation_message ?? "Đang chờ dữ liệu tính toán."} />
              </>
            )}
          </article>
        </section>

        <details className="order-confirmation__products">
          <summary><span><ShoppingCartOutlined /><strong>Danh sách sản phẩm ({items.length})</strong></span><span>{formatCny(preview?.product_total_cny ?? items.reduce((sum, item) => sum + itemSubtotal(item), 0))} · Mở để kiểm tra</span></summary>
          <div className="order-confirmation__products-body">{items.length ? <Table rowKey="id" size="small" pagination={false} dataSource={items} columns={columns} scroll={{ x: 700 }} /> : <Empty description="Đơn hàng chưa có sản phẩm" />}</div>
        </details>
      </div>

      <footer className="order-confirmation__footer">
        <div className="order-confirmation__footer-main"><div className="order-confirmation__waive">
            <Checkbox checked={waiveDeposit} onChange={(event) => onWaiveDepositChange(event.target.checked)} disabled={loading || !preview?.can_approve_exception}>Không cần đặt cọc</Checkbox>
            {!preview?.can_approve_exception ? <Tooltip title="Tài khoản cần quyền phê duyệt ngoại lệ đặt cọc"><InfoCircleOutlined /></Tooltip> : null}
            {needsException ? <Input value={exceptionReason} onChange={(event) => onExceptionReasonChange(event.target.value)} placeholder="Lý do quản lý phê duyệt (bắt buộc)" maxLength={500} disabled={loading} /> : null}
          </div>
          <div className="order-confirmation__actions"><Button onClick={onCancel} disabled={loading}>Hủy</Button><Tooltip title={disabledReasons.join(" ")}><span><Button type="primary" icon={<CheckCircleOutlined />} loading={loading} disabled={!readyToSubmit} onClick={onConfirm}>{waiveDeposit ? "Xác nhận không đặt cọc" : "Xác nhận & tạo yêu cầu cọc"}</Button></span></Tooltip></div></div>
        {disabledReasons.length ? <div className="order-confirmation__validation"><InfoCircleOutlined /> {disabledReasons[0]}</div> : <div className="order-confirmation__validation is-ready"><CheckCircleOutlined /> Đã đủ điều kiện xác nhận; backend sẽ chốt lại tỷ giá và tỷ lệ trong transaction.</div>}
      </footer>
    </Modal>
  );
}
