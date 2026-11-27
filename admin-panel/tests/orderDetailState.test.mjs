import assert from "node:assert/strict";
import test from "node:test";

import { getOrderPrimaryAction } from "../src/pages/orders/orderDetailState.ts";

const cases = [
  ["pending", true, "Xác nhận đơn hàng"],
  ["awaiting_deposit", true, "Theo dõi thanh toán đặt cọc"],
  ["deposited", true, "Bắt đầu đặt hàng"],
  ["purchasing", true, "Xác nhận đã đặt hàng"],
  ["awaiting_tracking", true, "Quản lý mã vận đơn"],
  ["waiting_cn_warehouse", true, "Quản lý mã vận đơn"],
  ["receiving", false, "Đang xử lý vận chuyển"],
  ["completed", false, "Đơn hàng đã hoàn thành"],
  ["cancelled", false, "Đơn hàng đã hủy"],
  [undefined, false, "Không có thao tác phù hợp"],
];

test("maps backend order states to safe primary actions", () => {
  for (const [status, enabled, label] of cases) {
    assert.deepEqual(getOrderPrimaryAction(status), { enabled, label });
  }
});
