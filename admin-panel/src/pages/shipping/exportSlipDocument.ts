import dayjs from "dayjs";
import { formatWeight } from "./helpers";
import type { ExportSlip } from "./types";

const escapeHtml = (value: unknown) => String(value ?? "—").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character] || character);

const money = (value?: number | null) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value ?? 0)} đ`;
const line = (label: string, value: unknown) => `<div class="line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;

export const downloadExportSlip = (slip: ExportSlip) => {
  const financials = slip.financials;
  const address = slip.delivery_address;
  const addressText = address?.full_address || [address?.address_line, address?.ward_name, address?.district_name, address?.province_name].filter(Boolean).join(", ") || "—";
  const carrier = slip.carrier_code?.toLowerCase() === "ghn" ? "Giao Hàng Nhanh (GHN)" : slip.carrier_name || "—";
  const packageRows = (slip.packages || []).map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.order_code)}</td><td>${escapeHtml(item.tracking_number || "—")}</td><td>${escapeHtml(item.customer_name || "—")}</td><td>${item.length} × ${item.width} × ${item.height} cm</td><td>${escapeHtml(formatWeight(item.weight))}</td><td>1</td><td>${financials?.status === "paid" ? "Đã thanh toán" : "Chưa hoàn tất"}</td></tr>`).join("");
  const shipment = slip.shipment?.exists ? slip.shipment.tracking_number || slip.shipment.carrier_order_id || "Đã tạo" : "Chưa tạo";
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(slip.export_code)}</title><style>
body{font:14px Arial,sans-serif;padding:30px;color:#172033}h1{margin:0 0 5px;font-size:22px}h2{margin:24px 0 10px;font-size:16px;color:#173f73}.muted{color:#64748b}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.box{padding:13px;border:1px solid #dbe2ea;border-radius:8px}.line{display:flex;justify-content:space-between;gap:16px;padding:5px 0}.line span{color:#64748b}.line strong{text-align:right}.total{margin-top:6px;padding-top:10px;border-top:1px solid #cbd5e1;font-size:16px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:8px;border:1px solid #dbe2ea;text-align:left}th{background:#f8fafc}.footer{margin-top:16px;font-weight:700}@media print{body{padding:0}.box{break-inside:avoid}}
</style></head><body>
<h1>PHIẾU XUẤT HÀNG ${escapeHtml(slip.export_code)}</h1><div class="muted">Mã nhiệm vụ: ${escapeHtml(slip.task_code)} • Ngày tạo: ${escapeHtml(slip.created_at ? dayjs(slip.created_at).format("DD/MM/YYYY HH:mm") : "—")}</div>
<div class="grid"><section><h2>Thông tin xuất hàng</h2><div class="box">${line("Nhân viên tạo", slip.creator_name || "—")}${line("Nhân viên phụ trách xuất hàng", slip.delivery_staff_name || "—")}${line("Kho xuất", [slip.warehouse_name, slip.warehouse_address].filter(Boolean).join(" - ") || "—")}${line("Đơn vị vận chuyển", carrier)}${line("Dự kiến giao", slip.scheduled_delivery_date ? `${dayjs(slip.scheduled_delivery_date).format("DD/MM/YYYY")} (theo GHN)` : "—")}${line("Mã phiếu thanh toán", slip.payment?.voucher_codes?.join(", ") || "—")}</div></section>
<section><h2>Snapshot người nhận</h2><div class="box">${line("Người nhận", address?.receiver_name || "—")}${line("Số điện thoại", address?.receiver_phone || "—")}${line("Địa chỉ chi tiết", address?.address_line || "—")}${line("Tỉnh/Thành", address?.province_name || "—")}${line("Quận/Huyện", address?.district_name || "—")}${line("Phường/Xã", address?.ward_name || "—")}${line("Địa chỉ đầy đủ", addressText)}${line("GHN District ID", address?.district_code || "—")}${line("GHN Ward Code", address?.ward_code || "—")}</div></section></div>
<div class="grid"><section><h2>GHN Preview</h2><div class="box">${line("Chế độ", slip.ghn?.mode || "preview")}${line("Dịch vụ", slip.ghn?.service_name || slip.service_type || "—")}${line("Service ID", slip.ghn?.service_id ?? "—")}${line("Gói hàng", slip.ghn ? `${slip.ghn.package_count} kiện • ${formatWeight(slip.ghn.total_weight)}` : "—")}${line("Kích thước tổng hợp", slip.ghn ? `${slip.ghn.length} × ${slip.ghn.width} × ${slip.ghn.height} cm` : "—")}${line("Phí đã thu", money(slip.ghn?.collected_fee))}${line("Phí preview hiện tại", money(slip.ghn?.current_fee))}${line("Chênh lệch preview", money(slip.ghn?.fee_difference))}${line("Đơn GHN thực tế", shipment)}</div></section>
<section><h2>Tài chính đã tất toán</h2><div class="box">${line("Tiền hàng", money(financials?.product_total))}${line("Phí vận chuyển TQ → VN", money(financials?.weight_shipping_total))}${line("Phí giao nội địa GHN", money(financials?.domestic_shipping_total))}${line("Phụ phí", money(financials?.surcharge_total))}<div class="total">${line("Tổng đã tất toán", money(financials?.settled_total))}</div>${line("Đã dùng tiền cọc", money(financials?.deposit_applied))}${line("Thanh toán sau tiền cọc", money(financials?.payment_after_deposit))}${line("Còn phải thu", money(financials?.remaining_amount))}${line("Thu hộ (COD)", money(financials?.cod_amount))}${line("Trạng thái", financials?.status === "paid" ? "ĐÃ TẤT TOÁN" : "CHƯA HOÀN TẤT")}</div></section></div>
<h2>Danh sách đơn hàng xuất</h2><table><thead><tr><th>STT</th><th>Mã đơn hàng</th><th>Mã vận đơn</th><th>Khách hàng</th><th>Kích thước</th><th>Khối lượng</th><th>Số kiện</th><th>Trạng thái</th></tr></thead><tbody>${packageRows}</tbody></table>
<div class="footer">${slip.order_count} đơn • ${slip.total_packages} kiện • ${escapeHtml(formatWeight(slip.total_weight))} • Tổng đã tất toán: ${escapeHtml(money(financials?.settled_total))}</div>
</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slip.export_code}.html`;
  anchor.click();
  URL.revokeObjectURL(url);
};
