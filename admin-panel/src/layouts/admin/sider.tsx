import React, { useEffect, useMemo, useState } from "react";
import { Avatar, Button, Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { Link, useLocation } from "react-router";
import { useGetIdentity, useLogout } from "@refinedev/core";
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  BarChartOutlined,
  CreditCardOutlined,
  DollarCircleOutlined,
  DownOutlined,
  FileTextOutlined,
  ExportOutlined,
  HomeOutlined,
  InboxOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
  UsergroupAddOutlined,
} from "@ant-design/icons";
import type { User } from "../../shared/types";
import { hasPermission } from "../../shared/auth/permissions";

export const SIDEBAR_COLLAPSED_WIDTH = 72;
export const SIDEBAR_EXPANDED_WIDTH = 256;

const SIDEBAR_GROUP_STORAGE_KEY = "logistics-pro:sidebar-groups";

type SidebarUser = User & {
  role?: User["role"] | { name?: string | null } | null;
};

type SidebarItemConfig = {
  key: string;
  label: string;
  icon: React.ReactNode;
  permission?: string;
};

type SidebarGroupConfig = {
  key: string;
  title: string;
  defaultPath?: string;
  items: SidebarItemConfig[];
};

type SidebarProps = {
  collapsed: boolean;
  isMobile: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
};

type SidebarHeaderProps = {
  collapsed: boolean;
  isMobile: boolean;
  onToggleCollapse: () => void;
};

type SidebarGroupProps = {
  group: SidebarGroupConfig;
  collapsed: boolean;
  selectedKey: string;
  expanded: boolean;
  onToggle: (groupKey: string) => void;
  onNavigate: () => void;
};

type SidebarItemProps = {
  item: SidebarItemConfig;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
};

type UserProfileCardProps = {
  collapsed: boolean;
  userName: string;
  roleName: string;
};

const menuSections: SidebarGroupConfig[] = [
  {
    key: "overview",
    title: "Tổng quan",
    items: [{ key: "/", icon: <HomeOutlined />, label: "Tổng quan" }],
  },
  {
    key: "management",
    title: "Quản lý",
    items: [
      { key: "/customers", icon: <UsergroupAddOutlined />, label: "Khách hàng", permission: "customers.read" },
      { key: "/orders", icon: <CreditCardOutlined />, label: "Đơn hàng", permission: "orders.read" },
      { key: "/cn-batches", icon: <InboxOutlined />, label: "Lô hàng vận chuyển", permission: "cn_batches.read" },
      { key: "/china-warehouse", icon: <BankOutlined />, label: "Kho hàng Trung Quốc", permission: "cn_packages.read" },
      { key: "/vietnam-warehouse", icon: <ApartmentOutlined />, label: "Kho hàng Việt Nam", permission: "vn_warehouse.read" },
    ],
  },
  {
    key: "shipping",
    title: "Xuất hàng",
    defaultPath: "/shipping/queue",
    items: [
      { key: "/shipping/queue", icon: <ExportOutlined />, label: "Danh sách chờ xuất", permission: "shipping_queue.read" },
      { key: "/shipping/tasks", icon: <InboxOutlined />, label: "Danh sách nhiệm vụ", permission: "shipping_tasks.read" },
      { key: "/shipping/slips", icon: <FileTextOutlined />, label: "Phiếu xuất hàng", permission: "export_slips.read" },
    ],
  },
  {
    key: "finance",
    title: "Tài chính",
    items: [
      { key: "/payment-vouchers", icon: <DollarCircleOutlined />, label: "Phiếu thanh toán", permission: "payment_vouchers.read" },
      { key: "/shipping-rates", icon: <CreditCardOutlined />, label: "Bảng giá cước", permission: "shipping_rates.read" },
      { key: "/invoices", icon: <FileTextOutlined />, label: "Hóa đơn", permission: "invoices.read" },
      { key: "/revenue-report", icon: <BarChartOutlined />, label: "Báo cáo doanh thu", permission: "revenue_report.read" },
    ],
  },
  {
    key: "system",
    title: "Hệ thống",
    items: [
      { key: "/employees", icon: <TeamOutlined />, label: "Nhân viên", permission: "employees.read" },
      { key: "/routes", icon: <SettingOutlined />, label: "Cài đặt chung", permission: "settings.read" },
      { key: "/analytics", icon: <AppstoreOutlined />, label: "Nhật ký hoạt động", permission: "audit_logs.read" },
    ],
  },
];

const getSelectedKey = (pathname: string) => {
  if (pathname === "/") {
    return "/";
  }

  if (pathname.startsWith("/shipping/create")) {
    return "/shipping/queue";
  }

  const matchedItem = menuSections
    .flatMap((section) => section.items)
    .find((item) => item.key !== "/" && pathname.startsWith(item.key));

  return matchedItem?.key ?? "";
};

const getInitialExpandedGroups = () => {
  if (typeof window === "undefined") {
    return menuSections.map((section) => section.key);
  }

  const storedValue = window.localStorage.getItem(SIDEBAR_GROUP_STORAGE_KEY);

  if (!storedValue) {
    return menuSections.map((section) => section.key);
  }

  try {
    const parsedValue = JSON.parse(storedValue) as unknown;

    if (Array.isArray(parsedValue)) {
      return parsedValue.filter((item): item is string => typeof item === "string");
    }
  } catch {
    window.localStorage.removeItem(SIDEBAR_GROUP_STORAGE_KEY);
  }

  return menuSections.map((section) => section.key);
};

const SidebarHeader: React.FC<SidebarHeaderProps> = ({ collapsed, isMobile, onToggleCollapse }) => {
  const toggleLabel = collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar";

  return (
    <header className="admin-sider__header">
      <div className="admin-sider__brand" title={collapsed ? "Logistics Pro" : undefined}>
        <div className="admin-sider__brand-mark" aria-hidden="true">
          <AppstoreOutlined />
        </div>
        {!collapsed && (
          <div className="admin-sider__brand-copy">
            <div className="admin-sider__brand-title">Logistics Pro</div>
            <div className="admin-sider__brand-subtitle">Hệ thống quản trị</div>
          </div>
        )}
      </div>

      {!isMobile && (
        <Tooltip title={toggleLabel} placement="right">
          <Button
            type="text"
            aria-label={toggleLabel}
            className="admin-sider__collapse-button"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={onToggleCollapse}
          />
        </Tooltip>
      )}
    </header>
  );
};

const SidebarItem: React.FC<SidebarItemProps> = ({ item, active, collapsed, onNavigate }) => {
  const link = (
    <Link
      to={item.key}
      aria-current={active ? "page" : undefined}
      className={`admin-sider__item${active ? " admin-sider__item--active" : ""}`}
      onClick={onNavigate}
      title={!collapsed ? item.label : undefined}
    >
      <span className="admin-sider__item-indicator" aria-hidden="true" />
      <span className="admin-sider__item-icon" aria-hidden="true">
        {item.icon}
      </span>
      {!collapsed && <span className="admin-sider__item-label">{item.label}</span>}
    </Link>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <Tooltip title={item.label} placement="right">
      {link}
    </Tooltip>
  );
};

const SidebarGroup: React.FC<SidebarGroupProps> = ({
  group,
  collapsed,
  selectedKey,
  expanded,
  onToggle,
  onNavigate,
}) => {
  const groupHasActiveItem = group.items.some((item) => item.key === selectedKey);
  const groupPanelId = `sidebar-group-${group.key}`;

  if (collapsed) {
    return (
      <section className="admin-sider__group admin-sider__group--collapsed" aria-label={group.title}>
        <div className="admin-sider__collapsed-group-rule" aria-hidden="true" />
        <div className="admin-sider__items">
          {group.items.map((item) => (
            <SidebarItem
              key={item.key}
              item={item}
              active={item.key === selectedKey}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </section>
    );
  }

  const groupToggle = group.defaultPath ? (
    <div
      className={`admin-sider__group-toggle${groupHasActiveItem ? " admin-sider__group-toggle--active" : ""}`}
    >
      <Link to={group.defaultPath} onClick={onNavigate} className="admin-sider__group-title-link">
        {group.title}
      </Link>
      <button
        type="button"
        aria-label={`${expanded ? "Thu gọn" : "Mở rộng"} menu ${group.title}`}
        aria-expanded={expanded}
        aria-controls={groupPanelId}
        className="admin-sider__group-chevron-button"
        onClick={() => onToggle(group.key)}
      >
        <DownOutlined aria-hidden="true" className="admin-sider__group-chevron" />
      </button>
    </div>
  ) : (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={groupPanelId}
      className={`admin-sider__group-toggle${groupHasActiveItem ? " admin-sider__group-toggle--active" : ""}`}
      onClick={() => onToggle(group.key)}
    >
      <span>{group.title}</span>
      <DownOutlined aria-hidden="true" className="admin-sider__group-chevron" />
    </button>
  );

  return (
    <section className="admin-sider__group" aria-label={group.title}>
      {groupToggle}

      <div
        id={groupPanelId}
        className="admin-sider__group-panel"
        data-expanded={expanded}
        style={{ "--sidebar-group-items": group.items.length } as React.CSSProperties}
      >
        <div className="admin-sider__items">
          {group.items.map((item) => (
            <SidebarItem
              key={item.key}
              item={item}
              active={item.key === selectedKey}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const UserProfileCard: React.FC<UserProfileCardProps> = ({ collapsed, userName, roleName }) => {
  const { mutate: logout } = useLogout();

  const dropdownItems: MenuProps["items"] = [
    { key: "profile", icon: <UserOutlined />, label: "Hồ sơ" },
    { key: "password", icon: <KeyOutlined />, label: "Đổi mật khẩu" },
    { type: "divider" },
    { key: "logout", danger: true, icon: <LogoutOutlined />, label: "Đăng xuất" },
  ];

  const onDropdownClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "logout") {
      logout({});
    }
  };

  const card = (
    <Dropdown
      menu={{ items: dropdownItems, onClick: onDropdownClick }}
      trigger={["click"]}
      placement="topRight"
    >
      <button
        type="button"
        className={`admin-sider__profile-card${collapsed ? " admin-sider__profile-card--collapsed" : ""}`}
        aria-label="Mở menu tài khoản"
      >
        <span className="admin-sider__avatar-wrap">
          <Avatar
            size={collapsed ? 40 : 44}
            icon={<UserOutlined />}
            className="admin-sider__profile-avatar"
          />
          <span className="admin-sider__online-dot" aria-label="Đang online" />
        </span>

        {!collapsed && (
          <>
            <span className="admin-sider__profile-meta">
              <span className="admin-sider__profile-name">{userName}</span>
              <span className="admin-sider__profile-role">{roleName}</span>
            </span>
            <MoreOutlined className="admin-sider__profile-action" aria-hidden="true" />
          </>
        )}
      </button>
    </Dropdown>
  );

  if (!collapsed) {
    return card;
  }

  return (
    <Tooltip title={`${userName} - ${roleName}`} placement="right">
      {card}
    </Tooltip>
  );
};

export const CustomSider: React.FC<SidebarProps> = ({
  collapsed,
  isMobile,
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
}) => {
  const location = useLocation();
  const { data: identity } = useGetIdentity<SidebarUser>();
  const selectedKey = getSelectedKey(location.pathname);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(getInitialExpandedGroups);

  const renderedCollapsed = isMobile ? false : collapsed;
  const userName = identity?.name?.trim() || "Admin";
  const roleName =
    identity?.role?.name?.trim() || "Chưa gán vai trò";

  const visibleMenuSections = useMemo(
    () => menuSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.permission || hasPermission(identity, item.permission)),
      }))
      .filter((section) => section.items.length > 0),
    [identity],
  );

  const expandedGroupSet = useMemo(() => new Set(expandedGroups), [expandedGroups]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((currentGroups) => {
      const nextGroups = currentGroups.includes(groupKey)
        ? currentGroups.filter((item) => item !== groupKey)
        : [...currentGroups, groupKey];

      window.localStorage.setItem(SIDEBAR_GROUP_STORAGE_KEY, JSON.stringify(nextGroups));
      return nextGroups;
    });
  };

  useEffect(() => {
    if (!isMobile || !mobileOpen) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseMobile();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMobile, mobileOpen, onCloseMobile]);

  return (
    <>
      <aside
        className={`admin-sider${renderedCollapsed ? " admin-sider--collapsed" : ""}${
          isMobile ? " admin-sider--mobile" : ""
        }${mobileOpen ? " admin-sider--open" : ""}`}
        aria-label="Điều hướng quản trị Logistics Pro"
      >
        <div className="admin-sider__inner">
          <SidebarHeader
            collapsed={renderedCollapsed}
            isMobile={isMobile}
            onToggleCollapse={onToggleCollapse}
          />

          <nav className="admin-sider__menu-scroll" aria-label="Menu chính">
            {visibleMenuSections.map((section) => (
              <SidebarGroup
                key={section.key}
                group={section}
                collapsed={renderedCollapsed}
                selectedKey={selectedKey}
                expanded={expandedGroupSet.has(section.key)}
                onToggle={toggleGroup}
                onNavigate={isMobile ? onCloseMobile : () => undefined}
              />
            ))}
          </nav>

          <UserProfileCard collapsed={renderedCollapsed} userName={userName} roleName={roleName} />
        </div>
      </aside>

      {isMobile && mobileOpen && (
        <button
          type="button"
          className="admin-sider__overlay"
          aria-label="Đóng sidebar"
          onClick={onCloseMobile}
        />
      )}
    </>
  );
};
