import React from "react";
import { Avatar, Badge, Button, Input, Layout as AntdLayout, Space, Tooltip } from "antd";
import { BellOutlined, MenuOutlined, SearchOutlined, SettingOutlined } from "@ant-design/icons";

type CustomHeaderProps = {
  onMenuClick: () => void;
  isMobile: boolean;
  collapsed: boolean;
};

export const CustomHeader: React.FC<CustomHeaderProps> = ({ onMenuClick, isMobile, collapsed }) => {
  const menuLabel = isMobile ? "Mở menu điều hướng" : collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar";

  return (
    <AntdLayout.Header className="admin-shell__header">
      <Tooltip title={menuLabel}>
        <Button
          type="text"
          aria-label={menuLabel}
          icon={<MenuOutlined />}
          className="admin-shell__menu-button"
          onClick={onMenuClick}
        />
      </Tooltip>

      <div className="admin-shell__header-search">
        <Input
          placeholder="Tìm kiếm đơn hàng, khách hàng, mã vận đơn..."
          prefix={<SearchOutlined style={{ color: "var(--text-secondary)" }} />}
          className="admin-shell__search-input"
        />
      </div>

      <div className="admin-shell__header-actions">
        <Space size={16}>
          <Badge count={5} size="small">
            <Button
              type="text"
              aria-label="Thông báo"
              icon={<BellOutlined style={{ fontSize: 20, color: "var(--text-secondary)" }} />}
            />
          </Badge>
          <Button
            type="text"
            aria-label="Cài đặt"
            icon={<SettingOutlined style={{ fontSize: 20, color: "var(--text-secondary)" }} />}
          />

          <Avatar
            size={38}
            src="https://i.pravatar.cc/100?img=11"
            className="admin-shell__header-avatar"
          />
        </Space>
      </div>
    </AntdLayout.Header>
  );
};
