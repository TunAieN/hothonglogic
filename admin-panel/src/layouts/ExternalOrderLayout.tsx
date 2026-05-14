import type { ReactNode } from "react";
import { Layout, theme } from "antd";

export const ExternalOrderLayout = ({ children }: { children: ReactNode }) => {
  const { token } = theme.useToken();

  return (
    <Layout
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${token.colorBgLayout} 0%, #fff7ed 100%)`,
      }}
    >
      <Layout.Content
        style={{
          width: "100%",
          maxWidth: 1440,
          margin: "0 auto",
          padding: "32px 20px 48px",
        }}
      >
        {children}
      </Layout.Content>
    </Layout>
  );
};
