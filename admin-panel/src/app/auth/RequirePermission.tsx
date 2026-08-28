import type { ReactNode } from "react";
import { useGetIdentity } from "@refinedev/core";
import { Navigate } from "react-router";

import { RouteLoadingFallback } from "../../shared/components/admin-loading";
import { hasPermission } from "../../shared/auth/permissions";
import type { User } from "../../shared/types";

export const RequirePermission = ({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) => {
  const { data: identity, isLoading } = useGetIdentity<User>();

  if (isLoading) {
    return <RouteLoadingFallback />;
  }

  if (!hasPermission(identity, permission)) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};
