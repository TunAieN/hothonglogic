import React, { useEffect, useState } from "react";
import { Layout as AntdLayout } from "antd";
import { CustomSider, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_EXPANDED_WIDTH } from "./sider";
import { CustomHeader } from "./header";
import "./layout.css";

const SIDEBAR_COLLAPSE_STORAGE_KEY = "logistics-pro:sidebar-collapsed";
const MOBILE_MEDIA_QUERY = "(max-width: 991px)";

const getInitialCollapsed = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "true";
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);

    updateIsMobile();
    mediaQuery.addEventListener("change", updateIsMobile);

    return () => mediaQuery.removeEventListener("change", updateIsMobile);
  }, []);

  return isMobile;
};

export const CustomLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  const mainOffset = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  const toggleCollapsed = () => {
    setCollapsed((currentValue) => {
      const nextValue = !currentValue;
      window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, String(nextValue));
      return nextValue;
    });
  };

  const onHeaderMenuClick = () => {
    if (isMobile) {
      setMobileOpen(true);
      return;
    }

    toggleCollapsed();
  };

  return (
    <AntdLayout className="admin-shell">
      <CustomSider
        collapsed={collapsed}
        isMobile={isMobile}
        mobileOpen={mobileOpen}
        onToggleCollapse={toggleCollapsed}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <AntdLayout
        className="admin-shell__main"
        style={{ "--admin-sidebar-offset": `${isMobile ? 0 : mainOffset}px` } as React.CSSProperties}
      >
        <CustomHeader onMenuClick={onHeaderMenuClick} isMobile={isMobile} collapsed={collapsed} />
        <AntdLayout.Content className="admin-shell__content">{children}</AntdLayout.Content>
      </AntdLayout>
    </AntdLayout>
  );
};
