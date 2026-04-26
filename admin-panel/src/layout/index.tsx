import React from "react";
import { Layout as AntdLayout } from "antd";
import { CustomSider } from "./sider";
import { CustomHeader } from "./header";

export const CustomLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AntdLayout style={{ minHeight: "100vh" }}>
      <CustomSider />
      <AntdLayout style={{ marginLeft: 260 }}>
        <CustomHeader />
        <AntdLayout.Content style={{ padding: "32px", minHeight: "calc(100vh - 72px)" }}>
          {children}
        </AntdLayout.Content>
      </AntdLayout>
    </AntdLayout>
  );
};
