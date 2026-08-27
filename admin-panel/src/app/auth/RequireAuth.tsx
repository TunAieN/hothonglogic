import type { ReactNode } from "react";
import { Authenticated } from "@refinedev/core";
import { Navigate, useLocation } from "react-router";

export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const redirect = `${location.pathname}${location.search}`;

  return (
    <Authenticated
      key={`auth-${location.pathname}`}
      fallback={<Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />}
    >
      <>{children}</>
    </Authenticated>
  );
};
