import { Tag } from "antd";
import type { InvoiceStatus } from "./types";
import { backendStatusLabels, invoiceStatusConfig } from "./invoiceUtils";

export const InvoiceStatusTag = ({ status, rawStatus }: { status: InvoiceStatus; rawStatus?: string | null }) => {
  const config = invoiceStatusConfig[status];
  const label = rawStatus ? backendStatusLabels[rawStatus] ?? config.label : config.label;

  return <Tag color={config.color} className={`invoice-status-tag ${config.className}`}>{label}</Tag>;
};
