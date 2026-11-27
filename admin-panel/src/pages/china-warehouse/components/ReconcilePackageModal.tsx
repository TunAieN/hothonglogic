import { useRef, useState } from "react";
import { Alert, Descriptions, Form, Input, Modal, Radio, Space, Typography } from "antd";
import { Link } from "react-router";
import { CN_PACKAGE_RECONCILIATION_ORDERS_QUERY } from "../../../graphql/cnPackages";
import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../../providers/graphqlClient";
import type { ChinaWarehousePackage } from "../types";

type OrderResult = {
  id: string;
  order_code: string;
  customer_name?: string;
  tracking_numbers: string[];
  purchases: { id: string; external_order_code: string; shop_name?: string }[];
};

export type ReconciliationInput = {
  original_tracking_number: string | null;
  original_note: string | null;
  verified_tracking_number?: string;
  reason: string;
  note?: string;
};

const ResultText = ({ text }: { text: string }) => (
  <Typography.Text style={{ display: "block", width: "100%" }} ellipsis={{ tooltip: text }}>
    {text}
  </Typography.Text>
);

export const ReconcilePackageModal = ({ record, canSearch, onClose, onSave }: {
  record: ChinaWarehousePackage;
  canSearch: boolean;
  onClose: () => void;
  onSave: (input: ReconciliationInput) => Promise<void>;
}) => {
  const [form] = Form.useForm<{ mode: "note" | "verify"; tracking: string; reason: string; note: string }>();
  const [results, setResults] = useState<OrderResult[]>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [saveError, setSaveError] = useState<string>();
  const mode = Form.useWatch("mode", form);
  const locked = Boolean(record.batchId || record.confirmedItemCount || record.isImportedToVietnam);

  const search = async (value: string) => {
    if (!value.trim() || searching) return;
    setSearching(true);
    setSearchError(false);
    setResults(undefined);
    try {
      syncGraphqlAuthToken();
      const response = await client.request<{ cnPackageReconciliationOrders: OrderResult[] }>(
        CN_PACKAGE_RECONCILIATION_ORDERS_QUERY, { search: value.trim() }, getGraphqlAuthHeaders(),
      );
      setResults(response.cnPackageReconciliationOrders);
    } catch {
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    if (saveLock.current) return;
    saveLock.current = true;
    try {
      const values = await form.validateFields().catch(() => undefined);
      if (!values) return;
      setSaving(true);
      setSaveError(undefined);
      await onSave({
        original_tracking_number: record.originalTrackingNumber ?? null,
        original_note: record.note ?? null,
        verified_tracking_number: values.mode === "verify" ? values.tracking.trim() : undefined,
        reason: values.reason.trim(),
        note: values.note?.trim() ?? "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể lưu đối chiếu. Vui lòng thử lại.";
      setSaveError(message);
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      centered open width={720} title="Đối chiếu kiện chưa khớp"
      onCancel={() => { if (!saving) onClose(); }} onOk={() => void save()}
      confirmLoading={saving} okText="Lưu đối chiếu" cancelText="Đóng"
      styles={{
        header: { background: "#102B50", color: "#fff", padding: "10px 16px", borderRadius: 8 },
        title: { color: "#fff" },
        body: { maxHeight: "min(66vh, 620px)", overflowY: "auto", padding: "8px 4px" },
      }}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[
          { key: "id", label: "Mã kiện", children: record.id },
          { key: "tracking", label: "Vận đơn", children: record.trackingCode },
          { key: "warehouse", label: "Kho", children: record.warehouseName },
          { key: "receiver", label: "Người nhận", children: record.receiverName },
          { key: "date", label: "Ngày nhận", children: record.receivedDate },
          { key: "weight", label: "Khối lượng", children: `${record.weight} kg` },
          { key: "condition", label: "Tình trạng", children: record.packageCondition || "Chưa ghi nhận" },
          { key: "status", label: "Trạng thái", children: "Chưa khớp" },
        ]} />
        {canSearch && <>
          <Input.Search
            aria-label="Tra cứu đơn liên quan"
            placeholder="Mã vận đơn, đơn VietTrung, đơn Taobao, khách hàng hoặc shop"
            defaultValue={record.trackingCode} enterButton="Tra cứu" loading={searching} maxLength={191}
            onSearch={(value) => void search(value)}
          />
          {searchError && <Alert type="error" message="Không thể tra cứu đơn liên quan. Vui lòng thử lại." />}
          {results && (results.length ? results.map((order) => (
            <div key={order.id} style={{ padding: 10, background: "#EAF2FF", minWidth: 0 }}>
              <Link to={`/orders/show/${order.id}`} target="_blank" rel="noopener">Mở đơn {order.order_code}</Link>
              <ResultText text={order.customer_name || "Chưa có tên khách hàng"} />
              <ResultText text={order.tracking_numbers.length ? order.tracking_numbers.join(", ") : "Đơn chưa khai báo vận đơn"} />
              {order.purchases.map((purchase) => (
                <ResultText key={purchase.id} text={`${purchase.external_order_code} · ${purchase.shop_name || "Chưa có tên shop"}`} />
              ))}
            </div>
          )) : <Alert type="info" message="Không tìm thấy đơn phù hợp." />)}
          <Typography.Text type="secondary">
            Kết quả chỉ để tham khảo. Nếu shop đã phát hàng nhưng chưa có tracking, mở đơn và khai báo trong Quản lý mã vận đơn.
          </Typography.Text>
        </>}
        {locked && <Alert type="warning" message="Kiện đã có sản phẩm hoặc lô hàng. Chỉ có thể lưu ghi chú xác minh." />}
        {saveError && <Alert type="error" showIcon message={saveError} />}
        <Form form={form} layout="vertical" disabled={saving}
          initialValues={{ mode: "note", tracking: record.originalTrackingNumber ?? "", note: record.note ?? "" }}>
          <Form.Item name="mode" label="Cách xử lý">
            <Radio.Group options={[
              { label: "Lưu ghi chú xác minh", value: "note" },
              { label: "Đối chiếu mã trên nhãn", value: "verify", disabled: locked },
            ]} />
          </Form.Item>
          {mode === "verify" && <Form.Item name="tracking" label="Mã vận đơn đã xác minh"
            rules={[{ required: true, whitespace: true, message: "Nhập mã thực tế trên nhãn." }]}>
            <Input maxLength={100} />
          </Form.Item>}
          <Form.Item name="reason" label="Lý do và căn cứ xác minh"
            rules={[{ required: true, whitespace: true, message: "Nhập lý do và căn cứ xác minh." }]}>
            <Input.TextArea maxLength={1000} rows={2} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú kiện">
            <Input.TextArea rows={2} maxLength={4000} />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  );
};
