import type { ReactNode } from "react";
import { Space, Typography } from "antd";
import "./admin-page-summary.css";

const { Text, Title } = Typography;

export type StatCardTone = "blue" | "green" | "orange" | "red" | "purple" | "neutral";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

type StatsGridProps = {
  children: ReactNode;
  columns?: 3 | 4;
};

type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  description?: ReactNode;
  icon: ReactNode;
  tone?: StatCardTone;
};

export const PageHeader = ({ title, description, actions }: PageHeaderProps) => (
  <div className="admin-page-header">
    <div className="admin-page-header__title-area">
      <Title level={2} className="admin-page-header__title">
        {title}
      </Title>
      {description ? <Text className="admin-page-header__description">{description}</Text> : null}
    </div>
    {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
  </div>
);

export const PageHeaderActions = ({ children }: { children: ReactNode }) => (
  <Space wrap size={8} className="admin-page-header__actions-space">
    {children}
  </Space>
);

export const StatsGrid = ({ children, columns = 4 }: StatsGridProps) => (
  <div className={`admin-stats-grid admin-stats-grid--${columns}`}>{children}</div>
);

export const StatCard = ({ label, value, unit, description, icon, tone = "blue" }: StatCardProps) => (
  <div className="admin-stat-card">
    <div className={`admin-stat-card__icon admin-stat-card__icon--${tone}`} aria-hidden="true">
      {icon}
    </div>
    <div className="admin-stat-card__content">
      <div className="admin-stat-card__label">{label}</div>
      <div className="admin-stat-card__value">
        {value}
        {unit ? <span>{unit}</span> : null}
      </div>
      {description ? <div className="admin-stat-card__description">{description}</div> : null}
    </div>
  </div>
);
