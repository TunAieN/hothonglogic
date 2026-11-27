import { useState } from "react";
import { Alert, Button, Descriptions, Modal, Spin, Typography } from "antd";
import { SendOutlined } from "@ant-design/icons";
import type { CnPackage } from "../../shared/types";
import { BatchFacts, BatchHeading, BatchPackageItems, BatchPackagesTable, BatchReviewAlerts } from "./BatchWorkspaceParts";
import { batchTime, formatWeight } from "./helpers";
import type { BatchViewModel } from "./types";
import { useBatchWorkspace } from "./useBatchWorkspace";
import "./batch-workspace.css";

export function BatchDetailModal({ summary, canDispatch, onCancel, onDispatch }: {
  summary: BatchViewModel;
  canDispatch: boolean;
  onCancel: () => void;
  onDispatch: (batch: BatchViewModel) => void;
}) {
  const { batch, review, loading, error, reload } = useBatchWorkspace(summary.id);
  const [packageDetail, setPackageDetail] = useState<CnPackage>();
  return <Modal open centered rootClassName="cn-batch-workspace" width="min(94vw, 1120px)" onCancel={onCancel}
    title={<BatchHeading title="Chi tiết lô hàng" code={batch?.batchCode ?? summary.batchCode} />}
    footer={<div className="cn-workspace-footer">
      <Button onClick={onCancel}>Đóng</Button>
      {canDispatch && batch?.status === "pending" && <Button type="primary" icon={<SendOutlined />} onClick={() => onDispatch(batch)}>
        Mở luồng xuất kho
      </Button>}
    </div>}>
    {loading && <div className="cn-workspace-loading"><Spin /></div>}
    {error && <Alert type="error" showIcon message="Không thể tải chi tiết lô."
      action={<Button onClick={reload} size="small">Tải lại</Button>} />}
    {batch && review && <div className="cn-workspace-stack">
      <BatchFacts batch={batch} detail />
      <section className="cn-workspace-panel cn-workspace-stack">
        <Typography.Title level={4}>Danh sách kiện trong lô</Typography.Title>
        <BatchPackagesTable packages={batch.packages} review={review} onView={setPackageDetail} detail />
      </section>
      {packageDetail && <BatchPackageItems pkg={packageDetail} onClose={() => setPackageDetail(undefined)}
        warnings={review.packages.find((row) => row.id === packageDetail.id)?.warnings ?? []} />}
      {batch.status === "pending" && <>
        <BatchReviewAlerts review={review} />
        {!review.destination_ready && <Alert type="warning" showIcon message="Cần chọn kho nhận Việt Nam đang hoạt động khi mở luồng xuất kho." />}
        <Alert type="info" showIcon message="Lô hàng cần được kiểm tra điều kiện trước khi xác nhận xuất Kho Trung Quốc." />
      </>}
      {(batch.handedOverAt || batch.note || batch.dispatchNote) && <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
        {batch.handedOverAt && <>
          <Descriptions.Item label="Bàn giao lúc">{batchTime(batch.handedOverAt)}</Descriptions.Item>
          <Descriptions.Item label="Đơn vị vận chuyển">{batch.carrierName || "Chưa có"}</Descriptions.Item>
          <Descriptions.Item label="Mã chuyến">{batch.transportCode || "Chưa có"}</Descriptions.Item>
          <Descriptions.Item label="Số bao/thùng">{batch.transportContainerCount ?? "Chưa có"}</Descriptions.Item>
          <Descriptions.Item label="KL lô lúc xuất">{formatWeight(batch.actualBatchWeight)}</Descriptions.Item>
        </>}
        {batch.note && <Descriptions.Item label="Ghi chú" span="filled">{batch.note}</Descriptions.Item>}
        {batch.dispatchNote && <Descriptions.Item label="Ghi chú bàn giao" span="filled">{batch.dispatchNote}</Descriptions.Item>}
      </Descriptions>}
    </div>}
  </Modal>;
}
