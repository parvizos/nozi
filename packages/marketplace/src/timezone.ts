export { MARKETPLACE_TIME_ZONE } from "./order-display";
export const DUSHANBE_UTC_OFFSET_MINUTES = 5 * 60;

export function dushanbeLocalParts(now: Date): {
  date: string;
  dayOfWeek: number;
  minutes: number;
} {
  const local = new Date(now.getTime() + DUSHANBE_UTC_OFFSET_MINUTES * 60_000);
  const day = local.getUTCDay();
  return {
    date: local.toISOString().slice(0, 10),
    dayOfWeek: day === 0 ? 7 : day,
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

export function dushanbeDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    Date.UTC(year!, month! - 1, day!, hour!, minute!) -
      DUSHANBE_UTC_OFFSET_MINUTES * 60_000,
  );
}

export function dushanbeStartOfDay(now = new Date()): Date {
  const { date } = dushanbeLocalParts(now);
  return dushanbeDateTime(date, "00:00");
}

export function dushanbeDayRange(now = new Date()): {
  end: Date;
  start: Date;
} {
  const start = dushanbeStartOfDay(now);
  return { end: new Date(start.getTime() + 86_400_000), start };
}
