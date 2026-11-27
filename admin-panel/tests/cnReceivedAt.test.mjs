import test from "node:test";
import assert from "node:assert/strict";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import { isCnReceivedAtInFuture, parseCnReceivedAt, serializeCnReceivedAt } from "../src/pages/china-warehouse/receivedAt.ts";

dayjs.extend(customParseFormat);

test("the Vietnamese DatePicker minute has the correct UTC instant and round-trips", () => {
  process.env.TZ = "Asia/Ho_Chi_Minh";
  const format = "DD/MM/YYYY HH:mm";
  const entered = dayjs("27/11/2026 23:29", format, true);
  const now = dayjs("27/11/2026 23:30", format, true);
  assert.equal(entered.isValid(), true);
  assert.equal(isCnReceivedAtInFuture(entered, now), false);
  assert.equal(serializeCnReceivedAt(entered), "2026-11-27 16:29:00");
  assert.equal(parseCnReceivedAt(serializeCnReceivedAt(entered)).format(format), "27/11/2026 23:29");
});

test("China's next calendar day can be the same instant as Vietnam's evening", () => {
  process.env.TZ = "Asia/Shanghai";
  const midnight = dayjs("28/11/2026 00:00", "DD/MM/YYYY HH:mm", true);
  const now = dayjs("2026-11-27T23:00:00+07:00");
  assert.equal(midnight.valueOf(), now.valueOf());
  assert.equal(serializeCnReceivedAt(midnight), "2026-11-27 16:00:00");
  assert.equal(parseCnReceivedAt("2026-11-27 16:00:00").format("DD/MM/YYYY HH:mm"), "28/11/2026 00:00");
  assert.equal(isCnReceivedAtInFuture(midnight, now), false);
});

test("the first second after now is rejected, even across midnight", () => {
  process.env.TZ = "Asia/Shanghai";
  const now = dayjs("2026-11-28 00:00:00.250");
  assert.equal(isCnReceivedAtInFuture(dayjs("2026-11-27 23:59:59"), now), false);
  assert.equal(isCnReceivedAtInFuture(dayjs("2026-11-28 00:00:00"), now), false);
  assert.equal(isCnReceivedAtInFuture(dayjs("2026-11-28 00:00:01"), now), true);
  assert.equal(serializeCnReceivedAt(dayjs("2026-11-27 23:59:59")), "2026-11-27 15:59:59");
});
