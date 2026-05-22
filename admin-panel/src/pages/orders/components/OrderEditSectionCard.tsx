import type { CSSProperties, ReactNode } from "react";
import { Card, Space, Typography } from "antd";

const { Title } = Typography;

type OrderEditSectionCardProps = {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  extra?: ReactNode;
};

const iconBoxStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 12,
  background: "#f4f7fe",
  color: "#0a1f55",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "inset 0 0 0 1px #edf1f9",
};

export const OrderEditSectionCard = ({
  icon,
  title,
  children,
  extra,
}: OrderEditSectionCardProps) => (
  <Card className="order-edit-section-card" bordered={false}>
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div className="order-edit-section-head">
        <Space size={14}>
          <div style={iconBoxStyle}>{icon}</div>
          <Title level={3} style={{ margin: 0 }} className="order-edit-section-title">
            {title}
          </Title>
        </Space>
        {extra}
      </div>
      {children}
    </Space>
  </Card>
);
