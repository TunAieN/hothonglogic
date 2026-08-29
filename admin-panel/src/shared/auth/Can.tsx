import type { ReactNode } from "react";
import { useGetIdentity } from "@refinedev/core";

import type { User } from "../types";
import { hasPermission } from "./permissions";

export const Can = ({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) => {
  const { data: identity } = useGetIdentity<User>();

  return hasPermission(identity, permission) ? <>{children}</> : null;
};
