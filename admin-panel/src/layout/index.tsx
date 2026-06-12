import React from "react";
import { Layout as AntdLayout } from "antd";
import { CustomSider } from "./sider";
import { CustomHeader } from "./header";
import "./layout.css";

export const CustomLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AntdLayout className="admin-shell">
      <CustomSider />
      <AntdLayout className="admin-shell__main">
        <CustomHeader />
        <AntdLayout.Content className="admin-shell__content">{children}</AntdLayout.Content>
      </AntdLayout>
    </AntdLayout>
  );
};
