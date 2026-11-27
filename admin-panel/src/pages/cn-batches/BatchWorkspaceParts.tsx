import { Alert, Button, Empty, Table, Tag, Typography } from "antd";
import { ApartmentOutlined, CalendarOutlined, ClockCircleOutlined, DropboxOutlined, EyeOutlined, InboxOutlined, SendOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { ReactNode } from "react";
import type { CnPackage } from "../../shared/types";
import { batchTime, formatVolume, formatWeight, getBatchStatusTag, getShippingTypeTag } from "./helpers";
import type { BatchDispatchReview, BatchViewModel } from "./types";

export const BatchHeading = ({ title, code, dispatch = false }: { title: string; code: string; dispatch?: boolean }) =>
  <div className="cn-workspace-heading">
    <div className="cn-workspace-logo">{dispatch ? <SendOutlined /> : <DropboxOutlined />}</div>
    <div className="cn-workspace-heading-text">
      <strong>{title}</strong>
      {dispatch ? <div>Kiểm tra điều kiện, thông tin lô và xác nhận xuất kho.</div>
        : <Typography.Text className="cn-workspace-code" copyable={{ text: code }}>Mã lô: {code}</Typography.Text>}
    </div>
  </div>;

const Ellipsis = ({ value, copy = false }: { value: string; copy?: boolean }) =>
  <Typography.Text className="cn-workspace-ellipsis" ellipsis={{ tooltip: value }} copyable={copy ? { text: value } : false}>{value}</Typography.Text>;

const Fact = ({ label, icon, value }: { label: string; icon: ReactNode; value: ReactNode }) =>
  <div className="cn-workspace-fact"><span className="cn-workspace-fact-icon">{icon}</span><div>
    <span>{label}</span><strong>{typeof value === "string" ? <Ellipsis value={value} /> : value}</strong>
  </div></div>;

export function BatchFacts({ batch, detail = false }: { batch: BatchViewModel; detail?: boolean }) {
  return <>
    <div className="cn-workspace-facts">
      {detail && <Fact label="Trạng thái" icon={<ClockCircleOutlined />} value={getBatchStatusTag(batch.status)} />}
      <Fact label="Kho xuất" icon={<ApartmentOutlined />} value={batch.originWarehouseName} />
      <Fact label="Kho nhận" icon={<ApartmentOutlined />} value={batch.receivingWarehouseName || "Chưa xác định"} />
      <Fact label="Số kiện" icon={<InboxOutlined />} value={String(batch.packages.length)} />
      {!detail && <Fact label="Tổng cân nặng" icon={<DropboxOutlined />} value={formatWeight(batch.totalWeight)} />}
    </div>
    {detail && <div className="cn-workspace-facts cn-workspace-metrics">
      <Fact label="Tổng cân nặng" icon={<InboxOutlined />} value={formatWeight(batch.totalWeight)} />
      <Fact label="Tổng thể tích" icon={<InboxOutlined />} value={formatVolume(batch.totalVolume)} />
      <Fact label="Hình thức vận chuyển" icon={<SendOutlined />} value={getShippingTypeTag(batch.shippingType)} />
      <Fact label="Ngày gom lô" icon={<CalendarOutlined />} value={batchTime(batch.createdAt)} />
    </div>}
  </>;
}

export const BatchReviewAlerts = ({ review }: { review: BatchDispatchReview }) => {
  const blocked = review.packages.filter((pkg) => pkg.issues.length);
  const warnings = review.packages.flatMap((pkg) => pkg.warnings);
  return <>
    {review.issues.map((issue) => <Alert key={issue} type="warning" showIcon message={issue} />)}
    {blocked.length > 0 && <Alert type="error" showIcon message={`${blocked.length} kiện có dữ liệu chưa đạt. Xem lý do trong bảng.`} />}
    {warnings.length > 0 && <Alert type="warning" showIcon message={`${warnings.length} kiện cần rà soát tình trạng vỏ hoặc ngoại lệ.`} />}
    {review.issues.length === 0 && blocked.length === 0 && <Alert type="success" showIcon message="Điều kiện dữ liệu của các kiện đạt. Cần hoàn tất rà soát lô trước khi xuất." />}
  </>;
};

export function BatchPackagesTable({ packages, review, onView, reviewed, detail = false }: {
  packages: CnPackage[];
  review: BatchDispatchReview;
  onView: (pkg: CnPackage) => void;
  reviewed?: string[];
  detail?: boolean;
}) {
  const reviews = new Map(review.packages.map((pkg) => [pkg.id, pkg]));
  const columns: ColumnsType<CnPackage> = [
    { title: "Mã vận đơn", key: "tracking", width: "16%", render: (_, pkg) => <Ellipsis value={pkg.tracking_number || "Chưa có"} copy /> },
    { title: "Đơn VietTrung", key: "order", responsive: ["md"], render: (_, pkg) => <Ellipsis value={pkg.order?.order_code || "Chưa liên kết"} /> },
    ...(detail ? [{ title: "Người tiếp nhận", key: "receiver", width: "12%", responsive: ["lg"] as ["lg"], render: (_: unknown, pkg: CnPackage) => <Ellipsis value={pkg.receiver_name || "Chưa rõ"} /> }] : []),
    { title: "Cân nặng", key: "weight", width: "9%", responsive: ["sm"], render: (_, pkg) => formatWeight(pkg.weight) },
    { title: "Tracking", key: "status", width: "11%", responsive: ["md"], render: (_, pkg) => <Tag color={pkg.status === "matched" ? "blue" : "warning"}>{pkg.status === "matched" ? "Đã khớp" : "Chưa khớp"}</Tag> },
    { title: "Kiểm item", key: "items", width: "12%", render: (_, pkg) => {
      const items = (pkg.package_items ?? []).filter((item) => item.quantity > 0);
      return items.length ? <span>{items.length} dòng · {items.reduce((qty, item) => qty + item.quantity, 0)} SP</span> : <Tag color="warning">Chưa kiểm</Tag>;
    } },
    { title: "Điều kiện", key: "eligibility", width: "14%", render: (_, pkg) => {
      const row = reviews.get(pkg.id);
      if (!row) return "Chưa xác định";
      if (row.issues.length) return <div className="cn-workspace-issues">{row.issues.join(" · ")}</div>;
      return <Tag color={row.warnings.length ? "warning" : "success"}>{row.warnings.length ? "Cần lưu ý" : "Dữ liệu đạt"}</Tag>;
    } },
    { title: "Thao tác", key: "action", width: "16%", render: (_, pkg) => <Button type={reviewed?.includes(pkg.id) ? "text" : "link"} size="small"
      icon={<EyeOutlined />} aria-label={`Xem chi tiết kiện ${pkg.tracking_number || pkg.id}`}
      onClick={() => onView(pkg)} className="cn-workspace-view">
      <span>{reviewed?.includes(pkg.id) ? "Đã rà soát" : "Xem chi tiết"}</span>
    </Button> },
  ];
  return <Table rowKey="id" className="cn-workspace-table" size="small" columns={columns}
    dataSource={packages} tableLayout="fixed" pagination={packages.length > 6 ? { pageSize: 6, showSizeChanger: false, size: "small" } : false}
    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Lô chưa có kiện" /> }} />;
}

export function BatchPackageItems({ pkg, warnings, onClose, onReview }: {
  pkg: CnPackage; warnings: string[]; onClose: () => void; onReview?: () => void;
}) {
  return <section className="cn-workspace-panel cn-workspace-stack" aria-label={`Chi tiết kiện ${pkg.tracking_number}`}>
    <div className="cn-workspace-inline-title"><strong>Kiện {pkg.tracking_number}</strong><Button onClick={onClose} size="small">Đóng chi tiết kiện</Button></div>
    <div>Đơn VietTrung {pkg.order?.order_code || "Chưa liên kết"} · Người tiếp nhận {pkg.receiver_name || "Chưa rõ"}</div>
    {warnings.map((warning) => <Alert type="warning" showIcon message={warning} key={warning} />)}
    <Table rowKey="id" className="cn-workspace-table" size="small" pagination={false} tableLayout="fixed" dataSource={pkg.package_items ?? []}
      columns={[
        { title: "Sản phẩm", key: "name", render: (_, item) => <Ellipsis value={item.order_item?.product_name || `Item #${item.order_item_id}`} /> },
        { title: "Phân loại", key: "variant", width: "26%", render: (_, item) => <Ellipsis value={[item.order_item?.color, item.order_item?.size].filter(Boolean).join(" / ") || "—"} /> },
        { title: "SL trong kiện", dataIndex: "quantity", width: "20%" },
      ]} locale={{ emptyText: "Kiện chưa có kết quả kiểm item." }} />
    {onReview && <div className="cn-workspace-review-button"><Button type="primary" onClick={onReview}>Xác nhận đã rà soát kiện</Button></div>}
  </section>;
}
