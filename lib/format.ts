import { num } from "./pnl";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const moneyCompact = new Intl.NumberFormat("en-GB", {
  style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0,
});

/** P&L with an explicit sign, so meaning is never carried by colour alone. */
export function signedMoney(value: number | string | null | undefined, compact = false): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = num(value);
  const body = (compact ? moneyCompact : money).format(Math.abs(n));
  if (n === 0) return body;
  return `${n > 0 ? "+" : "−"}${body}`;
}

export function signedNumber(value: number | string | null | undefined, digits = 1): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = num(value);
  const body = Math.abs(n).toFixed(digits);
  if (n === 0) return body;
  return `${n > 0 ? "+" : "−"}${body}`;
}

/** Tailwind-free semantic class for a P&L figure. */
export function pnlTone(value: number | string | null | undefined): "pos" | "neg" | "flat" {
  if (value === null || value === undefined || value === "") return "flat";
  const n = num(value);
  return n > 0 ? "pos" : n < 0 ? "neg" : "flat";
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** trend_up → Trend up. Sentence case, always. */
export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}
