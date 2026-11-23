export interface LocalViteServer {
  readonly host: string;
  readonly port: number;
  readonly strictPort: true;
}

export const CUSTOMER_WEB_DEV_SERVER: LocalViteServer;
export const ADMIN_PANEL_DEV_SERVER: LocalViteServer;
export const CUSTOMER_EXTENSION_LOCAL_ORIGINS: readonly string[];
export function parseExplicitOrigins(value?: string, fallback?: readonly string[]): string[];
