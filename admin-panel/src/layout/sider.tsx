import React from "react";
import { Layout as AntdLayout, Menu, Typography, Avatar } from "antd";
import { useLocation, useNavigate } from "react-router";
import {
  AppstoreOutlined,
  CarOutlined,    
  TeamOutlined,
  EnvironmentOutlined,
  BarChartOutlined,
} from "@ant-design/icons";

export const CustomSider: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { key: "/", icon: <AppstoreOutlined />, label: "Dashboard" },
    { key: "/customers", icon: <TeamOutlined />, label: "Customers" },
    { key: "/orders", icon: <CarOutlined />, label: "Orders" },
    { key: "/fleet", icon: <CarOutlined />, label: "Fleet Status" },
    { key: "/drivers", icon: <TeamOutlined />, label: "Driver Management" },
    { key: "/routes", icon: <EnvironmentOutlined />, label: "Routes" },
    { key: "/analytics", icon: <BarChartOutlined />, label: "Analytics" },
  ];

  return (
    <AntdLayout.Sider
      width={260}
      theme="dark"
      style={{
        height: "100vh",
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: "var(--bg-dark)",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #1A2B45",
      }}
    >
      <div style={{ padding: "24px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: 32, height: 32, backgroundColor: "#3182CE", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CarOutlined style={{ fontSize: 18, color: "#fff" }} />
        </div>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: "#fff", fontSize: 18, fontWeight: 600 }}>
            Logistics Pro
          </Typography.Title>
          <Typography.Text style={{ color: "#94A3B8", fontSize: 12 }}>
            National Fleet Admin
          </Typography.Text>
        </div>
      </div>

      <div style={{ flex: 1, marginTop: 24 }}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ backgroundColor: "transparent", border: "none" }}
        />
      </div>

      <div style={{ padding: "20px", borderTop: "1px solid #1A2B45", display: "flex", alignItems: "center", gap: "12px" }}>
        <Avatar size={40} src="https://i.pravatar.cc/150?img=11" />
        <div>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>Admin User</div>
          <div style={{ color: "#3182CE", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>SUPER ADMIN</div>
        </div>
      </div>
    </AntdLayout.Sider>
  );
};
