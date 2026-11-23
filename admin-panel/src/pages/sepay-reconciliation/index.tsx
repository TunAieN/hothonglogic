import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, DatePicker, Descriptions, Input, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { Can } from "../../shared/auth/Can";
import { fetchSepayEvents, retrySepayEvent } from "./api";
import type { SepayEvent } from "./api";

const { RangePicker } = DatePicker;
const money = (value?: number | null) => value == null ? "—" : `${Number(value).toLocaleString("vi-VN")} đ`;
const statusColor: Record<string, string> = { processed: "green", received: "blue", processing: "cyan", retryable_failed: "orange", reconciliation_needed: "red" };
const prettyHistory = (value?: string) => {
  try {
    return JSON.stringify(JSON.parse(value || "[]"), null, 2);
  } catch {
    return value || "[]";
  }
};

export const SepayReconciliationPage = () => {
  const [rows, setRows] = useState<SepayEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [filter, setFilter] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchSepayEvents(filter, page);
      setRows(result.data); setTotal(result.paginatorInfo.total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể tải event SePay.");
    } finally { setLoading(false); }
  }, [filter, page]);
  useEffect(() => { void load(); }, [load]);

  const retry = async (id: string) => {
    setRetrying(id);
    try { await retrySepayEvent(id); message.success("Đã gửi xử lý lại event."); await load(); }
    catch (error) { message.error(error instanceof Error ? error.message : "Không thể retry event."); }
    finally { setRetrying(null); }
  };

  const columns: ColumnsType<SepayEvent> = [
    { title: "Thời điểm", dataIndex: "occurred_at", width: 165, render: (value) => value ? dayjs(value).format("DD/MM/YYYY HH:mm:ss") : "—" },
    { title: "Provider transaction", dataIndex: "provider_transaction_id", width: 180 },
    { title: "Reference", dataIndex: "reference", width: 190, render: (value) => value || "—" },
    { title: "Tài khoản nhận", width: 170, render: (_, row) => <><div>{row.bank_code || "—"}</div><Typography.Text type="secondary">{row.account_number || "—"}</Typography.Text></> },
    { title: "Số tiền", dataIndex: "amount_vnd", align: "right", width: 130, render: money },
    { title: "Trạng thái", dataIndex: "status", width: 155, render: (value) => <Tag color={statusColor[value]}>{value}</Tag> },
    { title: "Nguyên nhân", dataIndex: "reconciliation_reason", width: 210, render: (value, row) => value || row.last_error_code || "—" },
    { title: "Lần thử", dataIndex: "attempt_count", align: "center", width: 85 },
    { title: "Thao tác", fixed: "right", width: 105, render: (_, row) => <Can permission="payments.confirm"><Button size="small" icon={<ReloadOutlined />} loading={retrying === row.id} disabled={!['received', 'retryable_failed'].includes(row.status)} onClick={() => retry(row.id)}>Retry</Button></Can> },
  ];

  return <Space direction="vertical" size={16} style={{ width: "100%" }}>
    <div><Typography.Title level={3} style={{ marginBottom: 4 }}>Đối soát SePay</Typography.Title><Typography.Text type="secondary">Theo dõi event đã tiếp nhận, lỗi retry và giao dịch cần kiểm tra thủ công.</Typography.Text></div>
    <Alert showIcon type="warning" message="Retry chỉ xử lý lại event lỗi kỹ thuật. Giao dịch sai tiền, sai tài khoản hoặc QR hết hạn không được tự động ghi có." />
    <Card><Space wrap>
      <Select allowClear style={{ width: 190 }} placeholder="Trạng thái" options={['received','retryable_failed','reconciliation_needed','processed'].map((value) => ({ value, label: value }))} onChange={(value) => { setPage(1); setFilter((old) => ({ ...old, status: value || "" })); }} />
      <Input.Search allowClear style={{ width: 280 }} placeholder="Reference hoặc provider transaction" onSearch={(value) => { setPage(1); setFilter((old) => ({ ...old, reference: value.trim() })); }} />
      <RangePicker showTime onChange={(values) => { setPage(1); setFilter((old) => ({ ...old, date_from: values?.[0]?.toISOString() || "", date_to: values?.[1]?.toISOString() || "" })); }} />
      <Button icon={<ReloadOutlined />} onClick={() => void load()}>Làm mới</Button>
    </Space></Card>
    <Table<SepayEvent>
      rowKey="id"
      loading={loading}
      columns={columns}
      dataSource={rows}
      scroll={{ x: 1420 }}
      pagination={{ current: page, total, pageSize: 20, showSizeChanger: false, onChange: setPage }}
      expandable={{
        expandedRowRender: (row) => <Descriptions
          size="small"
          bordered
          column={2}
          items={[
            { key: "intent", label: "Payment intent", children: row.intent ? `${row.intent.reference} (${row.intent.status})` : "Không xác định" },
            { key: "error", label: "Lỗi gần nhất", children: row.last_error_message || "—" },
            { key: "retry", label: "Retry tiếp theo", children: row.next_retry_at ? dayjs(row.next_retry_at).format("DD/MM/YYYY HH:mm:ss") : "—" },
            { key: "history", label: "Lịch sử xử lý", span: 2, children: <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{prettyHistory(row.processing_history_json)}</pre> },
          ]}
        />,
      }}
    />
  </Space>;
};
