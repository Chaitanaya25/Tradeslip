import { z } from "zod";
import { daysBetween, localDateOf } from "./dashboard";
import { Check } from "./schemas/fields";

/** Job scheduling: a date + time typed in the business timezone, stored as a UTC timestamp. */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Offset (ms) of `timeZone` from UTC at an instant: local wall time minus UTC. */
function offsetAt(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** "2026-03-08" + "09:30" in America/New_York -> the UTC instant. DST-safe (re-checks the offset once). */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - offsetAt(wall, timeZone);
  utc = wall - offsetAt(utc, timeZone);
  return new Date(utc);
}

/** The business-local date and "HH:MM" of a stored instant, for the date and time inputs. */
export function utcToZonedParts(timestamp: string | Date, timeZone: string): { date: string; time: string } {
  const instant = new Date(timestamp);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
  return { date: localDateOf(instant, timeZone), time };
}

export function isScheduledToday(timestamp: string | null, today: string, timeZone: string): boolean {
  return Boolean(timestamp) && localDateOf(timestamp as string, timeZone) === today;
}

/** "9:30 am" (US) / "09:30" (UK, AU) in the business timezone. */
export function formatScheduleTime(timestamp: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

export const MAX_PAST_DAYS = 365;
export const MAX_FUTURE_DAYS = 730;

/** Is a job date reasonable: not more than a year back and not more than two years ahead. */
export function isReasonableScheduleDate(date: string, today: string): boolean {
  const diff = daysBetween(today, date);
  return diff >= -MAX_PAST_DAYS && diff <= MAX_FUTURE_DAYS;
}

export const scheduleInputSchema = z
  .object({ date: z.string(), time: z.string() })
  .transform((v, ctx) => {
    const c = new Check();
    const date = c.date("date", v.date);
    if (!date) c.fail("date", "Choose the job date.");
    const time = v.time.trim();
    if (!TIME_RE.test(time)) c.fail("time", "Enter a time, like 09:30.");
    return c.done(ctx, { date: date ?? "", time });
  });

export type ScheduleInput = z.output<typeof scheduleInputSchema>;
