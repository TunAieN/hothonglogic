import test from "node:test";
import assert from "node:assert/strict";
import { DUPLICATE_CN_TRACKING, getReceivingError, getReceivingFormError } from "../src/pages/china-warehouse/receivingFeedback.ts";

const graphqlError = (message, extensions, status = 200) => ({
  response: { status, errors: [{ message, extensions }] },
});

test("an Ant Form failure exposes the missing field, including the receipt confirmation", () => {
  const reason = "Vui lòng xác nhận đã nhận kiện thực tế.";
  assert.deepEqual(getReceivingFormError({ errorFields: [{ name: ["receiptConfirmed"], errors: [reason] }] }),
    { field: "receiptConfirmed", message: `Kiểm tra thông tin nhập kiện. ${reason}` });
  assert.match(getReceivingFormError({ errorFields: [], outOfDate: true }).message, /vừa thay đổi/);
  assert.equal(getReceivingFormError(new Error("fetch failed")), undefined);
});

test("GraphQL HTTP 200 with a business 422 maps the received-at error to DatePicker", () => {
  const message = "Thời gian nhận hàng không được ở tương lai.";
  assert.deepEqual(getReceivingError(graphqlError(message, { field: "received_at", status: 422 }), "create"),
    { message, field: "receivedDate" });
});

test("a duplicate tracking requests an existence check without retrying a write", () => {
  const error = graphqlError("duplicate", { code: "CN_PACKAGE_DUPLICATE_TRACKING", status: 409 });
  assert.deepEqual(getReceivingError(error, "create"),
    { message: DUPLICATE_CN_TRACKING, field: "trackingCode", checkExisting: true });
});

test("authentication, authorization, invalid payload and ambiguous outcomes use separate feedback", () => {
  const graphQLPermissionError = graphqlError("Bạn không có quyền thực hiện thao tác này.");
  assert.match(getReceivingError(graphQLPermissionError, "create").message, /không có quyền nhập kiện/);
  assert.match(getReceivingError({ response: { status: 401 } }, "create").message, /hết hạn/);
  assert.match(getReceivingError({ response: { status: 422 } }, "create").message, /chưa hợp lệ/);

  const errors = [
    graphqlError("SQLSTATE mock secret", { debugMessage: "private" }),
    graphqlError("private server log", {}, 503),
    new TypeError("Failed to fetch"),
    new DOMException("Aborted", "TimeoutError"),
  ];
  for (const error of errors) {
    const feedback = getReceivingError(error, "create");
    assert.match(feedback.message, /Chưa xác nhận được kết quả nhập kiện/);
    assert.doesNotMatch(feedback.message, /SQLSTATE|private|fetch|Aborted/);
    assert.equal(feedback.checkExisting, true);
  }
});
