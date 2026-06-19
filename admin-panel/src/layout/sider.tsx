import React from "react";
import { Avatar, Layout as AntdLayout, Menu, Typography } from "antd";
import { useLocation, useNavigate } from "react-router";
import { useGetIdentity } from "@refinedev/core";
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  CreditCardOutlined,
  HomeOutlined,
  InboxOutlined,
  RightOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UserOutlined,
  UsergroupAddOutlined,
} from "@ant-design/icons";
import type { User } from "../types";

type SidebarUser = User & {
  role?: User["role"] | { name?: string | null } | null;
};

const SIDEBAR_WIDTH = 244;

const ROLE_LABELS: Record<number, string> = {
  1: "Quản trị viên",
  2: "CSKH",
  3: "Nhân viên kho",
  4: "Kế toán",
  5: "Khách hàng",
};

const menuItems = [
  { key: "/", icon: <HomeOutlined />, label: "Tổng quan" },
  { key: "/customers", icon: <UsergroupAddOutlined />, label: "Khách hàng" },
  { key: "/orders", icon: <ShoppingCartOutlined />, label: "Đơn hàng" },
  { key: "/cn-batches", icon: <InboxOutlined />, label: "Lô hàng vận chuyển" },
  { key: "/china-warehouse", icon: <BankOutlined />, label: "Kho hàng Trung Quốc" },
  { key: "/vietnam-warehouse", icon: <ApartmentOutlined />, label: "Kho hàng Việt Nam" },
  { key: "/analytics", icon: <CreditCardOutlined />, label: "Thanh toán / Công nợ" },
  { key: "/employees", icon: <TeamOutlined />, label: "Nhân viên" },
  {
    key: "/routes",
    icon: <SettingOutlined />,
    label: (
      <span className="admin-sider__menu-label">
        <span>Cấu hình</span>
        <RightOutlined className="admin-sider__menu-arrow" />
      </span>
    ),
  },
] as const;

const getSelectedKey = (pathname: string) => {
  if (pathname === "/") {
    return "/";
  }

  const matchedItem = menuItems.find((item) => item.key !== "/" && pathname.startsWith(item.key));
  return matchedItem?.key ?? "";
};

export const CustomSider: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<SidebarUser>();

  const selectedKey = getSelectedKey(location.pathname);
  const userName = identity?.name?.trim() || "Admin";
  const roleName =
    identity?.role?.name?.trim() || ROLE_LABELS[Number(identity?.role_id)] || "Quản trị viên";

  return (
    <AntdLayout.Sider width={SIDEBAR_WIDTH} theme="dark" className="admin-sider">
      <div className="admin-sider__inner">
        <div className="admin-sider__brand">
          <div className="admin-sider__brand-mark">
            <AppstoreOutlined />
          </div>
          <div>
            <Typography.Title level={4} className="admin-sider__brand-title">
              Logistics Pro
            </Typography.Title>
            <Typography.Text className="admin-sider__brand-subtitle">
              Hệ thống quản trị
            </Typography.Text>
          </div>
        </div>

        <div className="admin-sider__menu-wrap">
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={selectedKey ? [selectedKey] : []}
            items={menuItems.map((item) => ({
              ...item,
              className: "admin-sider__menu-item",
            }))}
            onClick={({ key }) => navigate(key)}
            className="admin-sider__menu"
          />
        </div>

        <div className="admin-sider__profile-card">
          <Avatar
            size={44}
            icon={<UserOutlined />}
            src="https://i.pravatar.cc/150?img=11"
            className="admin-sider__profile-avatar"
          />
          <div className="admin-sider__profile-meta">
            <div className="admin-sider__profile-name">{userName}</div>
            <div className="admin-sider__profile-role">{roleName}</div>
            <div className="admin-sider__profile-status">
              <span className="admin-sider__profile-status-dot" />
              <span>Online</span>
            </div>
          </div>
          <div className="admin-sider__profile-arrow">
            <RightOutlined />
          </div>
        </div>
      </div>
    </AntdLayout.Sider>
  );
};
