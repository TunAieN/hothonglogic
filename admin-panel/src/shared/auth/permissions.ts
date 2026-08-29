import type { User } from "../types";

export const hasPermission = (
  user: User | null | undefined,
  permission: string,
): boolean => {
  if (!user || (user.status && user.status !== "active")) {
    return false;
  }

  const permissions = user.role?.permissions ?? [];

  return permissions.includes("all") || permissions.includes(permission);
};
