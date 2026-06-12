import React from "react";
import { Layout as AntdLayout, Input, Badge, Space, Button } from "antd";
import { BellOutlined, SettingOutlined, QuestionCircleOutlined, SearchOutlined } from "@ant-design/icons";

export const CustomHeader: React.FC = () => {
  return (
    <AntdLayout.Header className="admin-shell__header">
      <div className="admin-shell__header-search">
        <Input
          placeholder="Search shipments, drivers or routes..."
          prefix={<SearchOutlined style={{ color: "var(--text-secondary)" }} />}
          className="admin-shell__search-input"
        />
      </div>

      <div className="admin-shell__header-actions">
        <div style={{ fontWeight: 600, color: "var(--bg-dark)", display: "none" }}>Delivery Dashboard</div>
        <Space size={16}>
          <Badge count={2} dot offset={[-4, 4]} color="red">
            <Button type="text" icon={<BellOutlined style={{ fontSize: 20, color: "var(--text-secondary)" }} />} />
          </Badge>
          <Button type="text" icon={<SettingOutlined style={{ fontSize: 20, color: "var(--text-secondary)" }} />} />
          <Button type="text" icon={<QuestionCircleOutlined style={{ fontSize: 20, color: "var(--text-secondary)" }} />} />
          <div className="admin-shell__header-avatar">
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>D</span>
          </div>
        </Space>
      </div>
    </AntdLayout.Header>
  );
};
