export const customerPortalDemoData = Object.freeze({
  profile: { id: "demo-customer", name: "Khách hàng Demo", initials: "KD", email: "demo@example.invalid", phone: "0900 000 000" },
  summary: { walletBalance: 2350000, processingOrders: 4, shippingPackages: 3, debt: 1280000 },
  orders: [
    { id: "demo-order-01", code: "DEMO260001", product: "Túi xách thời trang", source: "Taobao", quantity: 2, totalVnd: 878000, status: "purchasing", createdAt: "2026-10-26T10:24:00+07:00", updatedAt: "2026-10-28T09:12:00+07:00", items: [{ id: "item-1", name: "Túi xách nữ", source: "Taobao", variant: "Màu đen", quantity: 2, unitPriceVnd: 439000, imageUrl: "/images/hero/3-20210510015239-e_5fa65.jpg" }] },
    { id: "demo-order-02", code: "DEMO260002", product: "Giày thể thao nam", source: "1688", quantity: 1, totalVnd: 1120000, status: "awaiting_tracking", createdAt: "2026-10-24T14:30:00+07:00", updatedAt: "2026-10-29T08:00:00+07:00", items: [{ id: "item-2", name: "Giày thể thao", source: "1688", variant: "Size 42", quantity: 1, unitPriceVnd: 1120000, imageUrl: "/images/hero/khovan_hvdn.jpg" }] },
    { id: "demo-order-03", code: "DEMO260003", product: "Áo khoác nam", source: "Tmall", quantity: 3, totalVnd: 700000, status: "waiting_cn_warehouse", createdAt: "2026-10-21T08:10:00+07:00", updatedAt: "2026-10-30T16:05:00+07:00", items: [{ id: "item-3", name: "Áo khoác", source: "Tmall", variant: "Màu xanh", quantity: 3, unitPriceVnd: 233333, imageUrl: "/images/hero/logistics-viet-nam.jpeg" }] },
    { id: "demo-order-04", code: "DEMO260004", product: "Đồ gia dụng", source: "Nhà cung cấp riêng", quantity: 4, totalVnd: 1650000, status: "shipped", createdAt: "2026-10-18T11:20:00+07:00", updatedAt: "2026-11-01T10:00:00+07:00", items: [{ id: "item-4", name: "Bộ đồ gia dụng", variant: "Tiêu chuẩn", quantity: 4, unitPriceVnd: 412500 }] },
    { id: "demo-order-05", code: "DEMO260005", product: "Phụ kiện cửa hàng", source: "Alibaba", quantity: 10, totalVnd: 940000, status: "completed", createdAt: "2026-10-12T09:00:00+07:00", updatedAt: "2026-10-25T17:40:00+07:00", items: [{ id: "item-5", name: "Phụ kiện trưng bày", variant: "Bộ 10", quantity: 10, unitPriceVnd: 94000 }] },
  ],
  consignments: [
    { id: "demo-consignment-1", tracking: "DEMO-KG-001", name: "Quần áo, phụ kiện", declaredAt: "2026-10-25T09:00:00+07:00", weight: 3.2, status: "shipped", feeVnd: 320000 },
    { id: "demo-consignment-2", tracking: "DEMO-KG-002", name: "Đồ gia dụng", declaredAt: "2026-10-23T10:30:00+07:00", weight: 5.8, status: "receiving", feeVnd: 580000 },
    { id: "demo-consignment-3", tracking: "DEMO-KG-003", name: "Mỹ phẩm", declaredAt: "2026-10-20T15:00:00+07:00", weight: 1.2, status: "waiting_cn_warehouse", feeVnd: 120000 },
  ],
  transactions: [
    { id: "demo-tx-1", code: "DEMO-GD-001", type: "deposit", description: "Nạp tiền qua chuyển khoản (minh họa)", amountVnd: 1000000, balanceVnd: 2350000, status: "confirmed", createdAt: "2026-10-26T14:05:00+07:00" },
    { id: "demo-tx-2", code: "DEMO-GD-002", type: "payment", description: "Thanh toán đơn DEMO260002 (minh họa)", amountVnd: -500000, balanceVnd: 1350000, status: "confirmed", createdAt: "2026-10-25T11:06:00+07:00" },
    { id: "demo-tx-3", code: "DEMO-GD-003", type: "refund", description: "Hoàn tiền đơn DEMO260004 (minh họa)", amountVnd: 200000, balanceVnd: 1850000, status: "confirmed", createdAt: "2026-10-24T09:12:00+07:00" },
  ],
  addresses: [
    { id: "demo-address-1", receiver: "Người nhận Demo", phone: "0900 000 001", fullAddress: "Địa chỉ minh họa tại Việt Nam", label: "Nhà", isDefault: true },
    { id: "demo-address-2", receiver: "Cửa hàng Demo", phone: "0900 000 002", fullAddress: "Địa chỉ giao nhận minh họa", label: "Cửa hàng", isDefault: false },
  ],
  notifications: [
    { id: "demo-note-1", type: "order", title: "Đơn minh họa đã cập nhật trạng thái", body: "Đây là thông báo phục vụ kiểm tra giao diện, không phải sự kiện thật.", unread: true, createdAt: "2026-11-01T10:00:00+07:00" },
    { id: "demo-note-2", type: "package", title: "Kiện minh họa đã về kho", body: "Dữ liệu này chỉ xuất hiện khi bật development demo.", unread: true, createdAt: "2026-10-31T15:30:00+07:00" },
    { id: "demo-note-3", type: "system", title: "Thông báo hệ thống minh họa", body: "Customer Portal đang chờ hợp đồng API dành cho khách hàng.", unread: false, createdAt: "2026-10-30T08:00:00+07:00" },
  ],
});
