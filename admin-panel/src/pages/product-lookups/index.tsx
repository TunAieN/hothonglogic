import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Input, Select, Space, Table, Tag, Typography } from "antd";
import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../providers/graphqlClient";

type Lookup = { id: string; customer_code?: string; customer_name?: string; platform: string; source_url: string; status: string; staff_name?: string; product_data_json?: string; staff_note?: string; created_at: string };
type StaffExtensionResponse = { ok?: boolean; product?: Record<string, unknown>; error?: { code?: string } };
type ChromeRuntimeBridge = { lastError?: { message?: string }; sendMessage: (extensionId: string, message: object, callback: (response: StaffExtensionResponse) => void) => void };
const fields = "id customer_code customer_name platform source_url status staff_name product_data_json staff_note created_at updated_at";
const listQuery = `query($status: String) { productLookupRequests(status: $status) { ${fields} } }`;
const claimMutation = `mutation($id: ID!) { claimProductLookupRequest(id: $id) { ${fields} } }`;
const completeMutation = `mutation($id: ID!, $json: String!, $note: String) { completeProductLookupRequest(id: $id, product_data_json: $json, staff_note: $note) { ${fields} } }`;

async function gql<T>(query: string, variables: object) {
  syncGraphqlAuthToken();
  return client.request<T>(query, variables, getGraphqlAuthHeaders());
}

function staffExtract(url: string): Promise<Record<string, unknown>> {
  const extensionId = String(import.meta.env.VITE_STAFF_EXTENSION_ID || "").trim();
  const chromeRuntime = (globalThis as unknown as { chrome?: { runtime?: ChromeRuntimeBridge } }).chrome?.runtime;
  return new Promise((resolve, reject) => {
    if (!extensionId || !chromeRuntime?.sendMessage) return reject(new Error("Chưa cấu hình Staff Extension ID cho Admin Panel."));
    chromeRuntime.sendMessage(extensionId, { type: "STAFF_PRODUCT_EXTRACT", protocol_version: "1.0", product_url: url }, (response) => {
      if (chromeRuntime.lastError || !response?.ok || !response.product) reject(new Error(response?.error?.code || "Staff Extension không phản hồi. Hãy kiểm tra đăng nhập hoặc CAPTCHA trên tab sản phẩm."));
      else resolve(response.product);
    });
  });
}

export function ProductLookupRequestsPage() {
  const [rows, setRows] = useState<Lookup[]>([]);
  const [status, setStatus] = useState<string | undefined>("pending");
  const [selected, setSelected] = useState<Lookup | null>(null);
  const [json, setJson] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { setRows((await gql<{ productLookupRequests: Lookup[] }>(listQuery, { status })).productLookupRequests); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể tải hàng đợi."); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  const claim = async (row: Lookup) => {
    setBusy(true); setError("");
    try { const item = (await gql<{ claimProductLookupRequest: Lookup }>(claimMutation, { id: row.id })).claimProductLookupRequest; setSelected(item); setJson(item.product_data_json || ""); setNote(item.staff_note || ""); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể nhận yêu cầu."); }
    finally { setBusy(false); }
  };
  const extract = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try { setJson(JSON.stringify(await staffExtract(selected.source_url), null, 2)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể đọc sản phẩm."); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try { JSON.parse(json); await gql(completeMutation, { id: selected.id, json, note: note || null }); setSelected(null); setJson(""); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Kết quả JSON không hợp lệ."); }
    finally { setBusy(false); }
  };

  return <div style={{ padding: 24 }}>
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div><Typography.Title level={3}>Yêu cầu lấy thông tin sản phẩm</Typography.Title><Typography.Text type="secondary">Nhận đúng yêu cầu, dùng Staff Extension đọc sản phẩm, kiểm tra rồi trả kết quả cho khách.</Typography.Text></div>
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError("")} />}
      <Select aria-label="Lọc trạng thái" value={status} onChange={setStatus} style={{ width: 220 }} options={[{ value: "pending", label: "Chờ xử lý" }, { value: "claimed", label: "Đang xử lý" }, { value: "completed", label: "Hoàn tất" }]} />
      <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 20 }} columns={[
        { title: "Mã", dataIndex: "id", width: 75 },
        { title: "Khách hàng", render: (_, row) => `${row.customer_code || ""} — ${row.customer_name || ""}` },
        { title: "Nguồn", dataIndex: "platform", width: 90 },
        { title: "Link", render: (_, row) => <a href={row.source_url} target="_blank" rel="noreferrer">Mở sản phẩm</a> },
        { title: "Trạng thái", render: (_, row) => <Tag>{row.status}</Tag>, width: 120 },
        { title: "", render: (_, row) => <Button disabled={busy || row.status === "completed"} onClick={() => claim(row)}>{row.status === "pending" ? "Nhận xử lý" : "Mở"}</Button>, width: 130 },
      ]} />
      {selected && <Card title={`Xử lý yêu cầu #${selected.id}`}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <a href={selected.source_url} target="_blank" rel="noreferrer">{selected.source_url}</a>
          <Button loading={busy} onClick={extract}>Lấy bằng Staff Extension</Button>
          <Input.TextArea aria-label="Dữ liệu sản phẩm chuẩn hóa" value={json} onChange={(event) => setJson(event.target.value)} autoSize={{ minRows: 10, maxRows: 24 }} placeholder="Kết quả chuẩn hóa từ Staff Extension" />
          <Input.TextArea aria-label="Ghi chú cho khách" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú nếu dữ liệu thiếu hoặc cần khách xác nhận" />
          <Button type="primary" disabled={!json} loading={busy} onClick={complete}>Xác nhận và trả kết quả</Button>
        </Space>
      </Card>}
    </Space>
  </div>;
}
