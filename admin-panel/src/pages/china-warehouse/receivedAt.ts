import dayjs, { type Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);

// Lighthouse DateTime uses a timezone-free string in Laravel's UTC timezone.
export const serializeCnReceivedAt = (value: Dayjs) => value.utc().format("YYYY-MM-DD HH:mm:ss");

export const parseCnReceivedAt = (value: string) => dayjs.utc(value).local();

export const isCnReceivedAtInFuture = (value: Dayjs, now = dayjs()) => value.isAfter(now, "second");
