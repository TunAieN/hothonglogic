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
  width: 34,
  height: 34,
  borderRadius: 10,
  background: "linear-gradient(180deg, #eff5ff 0%, #f8fbff 100%)",
  color: "#2754c5",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "inset 0 0 0 1px #e1eafc",
};

export const OrderEditSectionCard = ({
  icon,
  title,
  children,
  extra,
}: OrderEditSectionCardProps) => (
  <Card className="order-edit-section-card" variant="borderless">
    <Space orientation="vertical" size={24} style={{ width: "100%" }}>
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
