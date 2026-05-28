export interface Role {
  id: string;
  name: string;
  permissions?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface User {
  id: string;
  name: string;
  email?: string | null;
  role_id?: number | string | null;
  role?: Role | null;
}
