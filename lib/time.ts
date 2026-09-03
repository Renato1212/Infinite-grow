import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { format, parseISO, addDays, startOfWeek, endOfWeek } from "date-fns";

export const TZ = "Europe/Lisbon";

/** Today's trading date in the trader's timezone, not the server's. */
export function todayISO(tz: string = TZ): string {
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
}

/** UTC instant → local wall clock string. */
export function localTime(instant: string | Date | null, tz: string = TZ): string {
  if (!instant) return "—";
  return formatInTimeZone(instant, tz, "HH:mm");
}

export function localTimeSeconds(instant: string | Date | null, tz: string = TZ): string {
  if (!instant) return "—";
  return formatInTimeZone(instant, tz, "HH:mm:ss");
}

export function localDateTime(instant: string | Date | null, tz: string = TZ): string {
  if (!instant) return "—";
  return formatInTimeZone(instant, tz, "d MMM yyyy, HH:mm");
}

/** A local wall-clock date + time, stored as a UTC instant. DST-correct. */
export function toInstant(date: string, time: string, tz: string = TZ): string {
  return fromZonedTime(`${date}T${time.length === 5 ? time + ":00" : time}`, tz).toISOString();
}

/** UTC instant → the "HH:mm" that a datetime-local input wants. */
export function toLocalInputValue(instant: string | Date | null, tz: string = TZ): string {
  if (!instant) return "";
  return formatInTimeZone(instant, tz, "HH:mm");
}

export function dayLabel(date: string): string {
  return format(parseISO(date), "EEEE d MMMM yyyy");
}

export function shortDayLabel(date: string): string {
  return format(parseISO(date), "EEE d MMM");
}

export function shiftDay(date: string, days: number): string {
  return format(addDays(parseISO(date), days), "yyyy-MM-dd");
}

export function weekBounds(date: string) {
  const d = parseISO(date);
  return {
    start: format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    end: format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  };
}

/** Minutes from now until an instant; negative once it has passed. */
export function minutesUntil(instant: string | Date): number {
  return Math.round((new Date(instant).getTime() - Date.now()) / 60000);
}

export function countdownLabel(instant: string | Date): string {
  const m = minutesUntil(instant);
  if (m < 0) {
    const past = Math.abs(m);
    return past < 60 ? `${past}m ago` : `${Math.floor(past / 60)}h ${past % 60}m ago`;
  }
  if (m === 0) return "now";
  return m < 60 ? `in ${m}m` : `in ${Math.floor(m / 60)}h ${m % 60}m`;
}

export function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export { toZonedTime };
