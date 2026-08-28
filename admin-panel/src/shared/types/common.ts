export interface Role {
  id: string;
  key?: string | null;
  name: string;
  description?: string | null;
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
  department?: string | null;
  status?: string | null;
}
