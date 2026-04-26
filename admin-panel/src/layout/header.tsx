import React from "react";
import { Layout as AntdLayout, Input, Badge, Space, Button } from "antd";
import { BellOutlined, SettingOutlined, QuestionCircleOutlined, SearchOutlined } from "@ant-design/icons";

export const CustomHeader: React.FC = () => {
  return (
    <AntdLayout.Header
      style={{
        backgroundColor: "#fff",
        padding: "0 24px",
        height: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--border-color)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ flex: 1, maxWidth: 480 }}>
        <Input
          placeholder="Search shipments, drivers or routes..."
          prefix={<SearchOutlined style={{ color: "var(--text-secondary)" }} />}
          style={{
            borderRadius: 24,
            backgroundColor: "var(--bg-light)",
            border: "none",
            height: 40,
            paddingLeft: 16,
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ fontWeight: 600, color: "var(--bg-dark)", display: "none" }}>Delivery Dashboard</div>
        <Space size={16}>
          <Badge count={2} dot offset={[-4, 4]} color="red">
            <Button type="text" icon={<BellOutlined style={{ fontSize: 20, color: "var(--text-secondary)" }} />} />
          </Badge>
          <Button type="text" icon={<SettingOutlined style={{ fontSize: 20, color: "var(--text-secondary)" }} />} />
          <Button type="text" icon={<QuestionCircleOutlined style={{ fontSize: 20, color: "var(--text-secondary)" }} />} />
          <div style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: "#ED8936", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 8 }}>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>D</span>
          </div>
        </Space>
      </div>
    </AntdLayout.Header>
  );
};
