import dayjs from "dayjs";
import { formatVnd, formatWeight } from "./helpers";
import type { ExportSlip } from "./types";

const escapeHtml = (value: unknown) => String(value ?? "-").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character] || character);

export const downloadExportSlip = (slip: ExportSlip) => {
  const packageRows = (slip.packages || []).map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.order_code)}</td><td>${escapeHtml(item.tracking_number)}</td><td>${item.length} × ${item.width} × ${item.height} cm</td><td>${escapeHtml(formatWeight(item.weight))}</td></tr>`).join("");
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>${escapeHtml(slip.export_code)}</title><style>body{font:14px Arial;padding:32px;color:#172033}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:9px;border:1px solid #dbe2ea;text-align:left}.summary{margin-top:20px;font-weight:700}</style><body><h1>PHIẾU XUẤT HÀNG ${escapeHtml(slip.export_code)}</h1><p>Mã nhiệm vụ: ${escapeHtml(slip.task_code)}</p><p>Ngày tạo: ${escapeHtml(slip.created_at ? dayjs(slip.created_at).format("DD/MM/YYYY HH:mm") : "-")}</p><p>Nhân viên giao hàng: ${escapeHtml(slip.delivery_staff_name)}</p><p>Đơn vị vận chuyển: ${escapeHtml(slip.carrier_name)}</p><table><thead><tr><th>STT</th><th>Mã đơn</th><th>Mã vận đơn</th><th>Kích thước</th><th>Khối lượng</th></tr></thead><tbody>${packageRows}</tbody></table><div class="summary">${slip.order_count} đơn • ${slip.total_packages} kiện • ${escapeHtml(formatWeight(slip.total_weight))} • ${escapeHtml(formatVnd(slip.total_value))}</div></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slip.export_code}.html`;
  anchor.click();
  URL.revokeObjectURL(url);
};
