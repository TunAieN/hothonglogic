import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Input, InputNumber, Space, Switch, Table, Tabs, Tag, Typography, message } from "antd";
import { client, syncGraphqlAuthToken } from "../../providers/graphqlClient";

type VipTier = { id: string; code: string; name: string; priority: number; minimum_spend_vnd: number; base_deposit_percent?: number | null; credit_limit_vnd?: number | null; deposit_policy_enabled: boolean; is_default: boolean; is_active: boolean; customers_count: number; updated_at?: string | null };
type RiskPolicy = { id: string; code: string; name: string; priority: number; minimum_deposit_percent?: number | null; surcharge_percent?: number | null; requires_manager_approval: boolean; is_active: boolean };
type Audit = { id: string; action: string; entity_type: string; entity_id?: string | null; before_data?: string | null; after_data?: string | null; created_at: string };

const money = (value?: number | null) => value == null ? "—" : `${Number(value).toLocaleString("vi-VN")} ₫`;

export const VipPoliciesPage = () => {
  const [tiers, setTiers] = useState<VipTier[]>([]);
  const [risks, setRisks] = useState<RiskPolicy[]>([]);
  const [history, setHistory] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  const load = useCallback(async () => {
    setLoading(true); syncGraphqlAuthToken();
    try {
      const data = await client.request<{ vipTiers: VipTier[]; riskDepositPolicies: RiskPolicy[]; vipPolicyHistory: Audit[] }>(`query VipPolicyAdmin {
        vipTiers { id code name priority minimum_spend_vnd base_deposit_percent credit_limit_vnd deposit_policy_enabled is_default is_active customers_count updated_at }
        riskDepositPolicies { id code name priority minimum_deposit_percent surcharge_percent requires_manager_approval is_active }
        vipPolicyHistory { id action entity_type entity_id before_data after_data created_at }
      }`);
      setTiers(data.vipTiers); setRisks(data.riskDepositPolicies); setHistory(data.vipPolicyHistory);
    } catch (error) { messageApi.error(error instanceof Error ? error.message : "Không thể tải chính sách VIP."); }
    finally { setLoading(false); }
  }, [messageApi]);

  useEffect(() => { void load(); }, [load]);
  const patchTier = (id: string, values: Partial<VipTier>) => setTiers((rows) => rows.map((row) => row.id === id ? { ...row, ...values } : row));
  const patchRisk = (id: string, values: Partial<RiskPolicy>) => setRisks((rows) => rows.map((row) => row.id === id ? { ...row, ...values } : row));

  const saveTier = async (row: VipTier) => {
    setSaving(`tier-${row.id}`); syncGraphqlAuthToken();
    try {
      await client.request(`mutation UpdateVipTier($id: ID!, $input: VipTierInput!) { updateVipTier(id: $id, input: $input) { id } }`, { id: row.id, input: { code: row.code, name: row.name, priority: row.priority, minimum_spend_vnd: row.minimum_spend_vnd, base_deposit_percent: row.base_deposit_percent, credit_limit_vnd: row.credit_limit_vnd, deposit_policy_enabled: row.deposit_policy_enabled, is_default: row.is_default, is_active: row.is_active } });
      messageApi.success(`Đã lưu hạng ${row.name}.`); await load();
    } catch (error) { messageApi.error(error instanceof Error ? error.message : "Không thể lưu hạng VIP."); }
    finally { setSaving(null); }
  };
  const saveRisk = async (row: RiskPolicy) => {
    setSaving(`risk-${row.id}`); syncGraphqlAuthToken();
    try {
      await client.request(`mutation UpdateRisk($id: ID!, $input: RiskDepositPolicyInput!) { updateRiskDepositPolicy(id: $id, input: $input) { id } }`, { id: row.id, input: { name: row.name, priority: row.priority, minimum_deposit_percent: row.minimum_deposit_percent, surcharge_percent: row.surcharge_percent, requires_manager_approval: row.requires_manager_approval, is_active: row.is_active } });
      messageApi.success(`Đã lưu mức rủi ro ${row.name}.`); await load();
    } catch (error) { messageApi.error(error instanceof Error ? error.message : "Không thể lưu chính sách rủi ro."); }
    finally { setSaving(null); }
  };

  const tierColumns = [
    { title: "Mã", dataIndex: "code", render: (_: string, row: VipTier) => <Input value={row.code} onChange={(e) => patchTier(row.id, { code: e.target.value })} /> },
    { title: "Tên hạng", dataIndex: "name", render: (_: string, row: VipTier) => <Input value={row.name} onChange={(e) => patchTier(row.id, { name: e.target.value })} /> },
    { title: "Thứ tự", dataIndex: "priority", render: (_: number, row: VipTier) => <InputNumber min={0} value={row.priority} onChange={(v) => patchTier(row.id, { priority: Number(v) })} /> },
    { title: "Ngưỡng chi tiêu", dataIndex: "minimum_spend_vnd", render: (_: number, row: VipTier) => <InputNumber min={0} style={{ width: 150 }} value={row.minimum_spend_vnd} onChange={(v) => patchTier(row.id, { minimum_spend_vnd: Number(v) })} formatter={(v) => Number(v || 0).toLocaleString("vi-VN")} /> },
    { title: "Cọc cơ bản %", dataIndex: "base_deposit_percent", render: (_: number, row: VipTier) => <InputNumber min={0} max={100} value={row.base_deposit_percent} onChange={(v) => patchTier(row.id, { base_deposit_percent: v == null ? null : Number(v) })} /> },
    { title: "Hạn mức ứng", dataIndex: "credit_limit_vnd", render: (_: number, row: VipTier) => <InputNumber min={0} style={{ width: 140 }} value={row.credit_limit_vnd} onChange={(v) => patchTier(row.id, { credit_limit_vnd: v == null ? null : Number(v) })} /> },
    { title: "Số KH", dataIndex: "customers_count", width: 70 },
    { title: "Mặc định", dataIndex: "is_default", render: (_: boolean, row: VipTier) => <Switch checked={row.is_default} onChange={(v) => patchTier(row.id, { is_default: v })} /> },
    { title: "Áp dụng cọc", dataIndex: "deposit_policy_enabled", render: (_: boolean, row: VipTier) => <Switch checked={row.deposit_policy_enabled} onChange={(v) => patchTier(row.id, { deposit_policy_enabled: v })} /> },
    { title: "Hoạt động", dataIndex: "is_active", render: (_: boolean, row: VipTier) => <Switch checked={row.is_active} onChange={(v) => patchTier(row.id, { is_active: v })} /> },
    { title: "", key: "save", render: (_: unknown, row: VipTier) => <Button type="primary" loading={saving === `tier-${row.id}`} onClick={() => void saveTier(row)}>Lưu</Button> },
  ];
  const riskColumns = [
    { title: "Mức", dataIndex: "name", render: (_: string, row: RiskPolicy) => <Input value={row.name} onChange={(e) => patchRisk(row.id, { name: e.target.value })} /> },
    { title: "Mã", dataIndex: "code", render: (value: string) => <Tag>{value}</Tag> },
    { title: "Thứ tự", dataIndex: "priority", render: (_: number, row: RiskPolicy) => <InputNumber min={0} value={row.priority} onChange={(v) => patchRisk(row.id, { priority: Number(v) })} /> },
    { title: "Sàn cọc %", dataIndex: "minimum_deposit_percent", render: (_: number, row: RiskPolicy) => <InputNumber min={0} max={100} placeholder="Chưa duyệt" value={row.minimum_deposit_percent} onChange={(v) => patchRisk(row.id, { minimum_deposit_percent: v == null ? null : Number(v) })} /> },
    { title: "Phụ thêm (điểm %)", dataIndex: "surcharge_percent", render: (_: number, row: RiskPolicy) => <InputNumber min={0} max={100} placeholder="Chưa cấu hình" value={row.surcharge_percent} onChange={(v) => patchRisk(row.id, { surcharge_percent: v == null ? null : Number(v) })} /> },
    { title: "Cần quản lý duyệt", dataIndex: "requires_manager_approval", render: (_: boolean, row: RiskPolicy) => <Switch checked={row.requires_manager_approval} onChange={(v) => patchRisk(row.id, { requires_manager_approval: v })} /> },
    { title: "Hoạt động", dataIndex: "is_active", render: (_: boolean, row: RiskPolicy) => <Switch checked={row.is_active} onChange={(v) => patchRisk(row.id, { is_active: v })} /> },
    { title: "", key: "save", render: (_: unknown, row: RiskPolicy) => <Button type="primary" loading={saving === `risk-${row.id}`} onClick={() => void saveRisk(row)}>Lưu</Button> },
  ];

  return <Space direction="vertical" size={20} style={{ width: "100%" }}>
    {contextHolder}<div><Typography.Title level={2} style={{ marginBottom: 4 }}>VIP & chính sách đặt cọc</Typography.Title><Typography.Text type="secondary">Cấu hình hạng thành viên và sàn cọc theo rủi ro cho đơn Taobao.</Typography.Text></div>
    <Alert type="warning" showIcon message="Chính sách chỉ áp dụng khi hạng VIP được bật" description="Phụ thêm là điểm phần trăm cộng vào cọc cơ bản VIP; sàn cọc là mức tối thiểu tuyệt đối. Đơn đã phát hành phiếu giữ nguyên snapshot cũ." />
    <Tabs items={[
      { key: "tiers", label: "Hạng VIP", children: <Card><Table<VipTier> loading={loading} rowKey="id" scroll={{ x: 1300 }} pagination={false} dataSource={tiers} columns={tierColumns} summary={() => <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={11}>Tổng khách theo hạng: {tiers.reduce((sum, row) => sum + row.customers_count, 0)} · Hạn mức hiển thị: {money(tiers.reduce((sum, row) => sum + Number(row.credit_limit_vnd || 0), 0))}</Table.Summary.Cell></Table.Summary.Row>} /></Card> },
      { key: "risk", label: "Rủi ro đơn", children: <Card><Table<RiskPolicy> loading={loading} rowKey="id" pagination={false} dataSource={risks} columns={riskColumns} /></Card> },
      { key: "history", label: "Lịch sử thay đổi", children: <Card><Table<Audit> loading={loading} rowKey="id" dataSource={history} columns={[{ title: "Thời gian", dataIndex: "created_at" }, { title: "Thao tác", dataIndex: "action" }, { title: "Đối tượng", render: (_, row) => `${row.entity_type} #${row.entity_id ?? "—"}` }, { title: "Trước", dataIndex: "before_data", ellipsis: true }, { title: "Sau", dataIndex: "after_data", ellipsis: true }]} /></Card> },
    ]} />
  </Space>;
};
