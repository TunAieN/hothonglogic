import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../src/pages/orders/components/OrderDetailWorkspace.tsx", import.meta.url);
const cssPath = new URL("../src/pages/orders/components/order-detail-workspace.css", import.meta.url);

test("order workspace exposes the four approved tabs and navy tokens", async () => {
  const [component, css] = await Promise.all([
    readFile(componentPath, "utf8"),
    readFile(cssPath, "utf8"),
  ]);

  for (const label of [
    "Thanh toán & đặt cọc",
    "Vận chuyển",
    "Ghi chú & yêu cầu",
    "Lịch sử đơn hàng",
  ]) {
    assert.ok(component.includes(label), `missing tab: ${label}`);
  }

  assert.ok(css.includes("--order-navy: #102b50"));
  assert.ok(css.includes("--order-blue: #1764c0"));
  assert.ok(component.includes('useState("payment")'));
  assert.ok(component.includes('destroyOnHidden={false}'));
  assert.ok(css.includes("grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1.14fr)"));
  assert.doesNotMatch(component, /scroll=\{\{ x: 900 \}\}/);
  assert.ok(component.includes('tableLayout="fixed"'));
  assert.ok(component.includes('className="order-products-scroll"'));
  assert.ok(component.includes('productRows.length > 2 ? { y: 156 }'));
  assert.ok(css.includes('.order-workspace__products .ant-table-tbody > tr { height: 78px; }'));
  assert.ok(css.includes('.order-products-scroll .ant-table-body::-webkit-scrollbar { width: 5px; }'));
  assert.ok(css.includes('scrollbar-color: #b7c7dc transparent'));
  assert.ok(component.includes('trigger={["click", "hover"]}'));
  assert.ok(css.includes("-webkit-line-clamp: 2"));
  assert.ok(css.includes("scrollbar-width: thin"));
  assert.ok(component.includes("VT-CUSTOMER-REQUEST:"));
  assert.doesNotMatch(component, /J&T Express|4\.703|65%/);
});
