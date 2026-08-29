"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setLevelInteraction, reground } from "@/app/actions/day";
import { countdownLabel, localTime, minutesUntil } from "@/lib/time";
import { formatPrice } from "@/lib/pnl";
import { cn } from "@/lib/cn";

interface Props {
  date: string;
  dayId: string;
  instruments: { id: string; symbol: string; tickSize: number }[];
  preps: { id: string; instrumentId: string }[];
  levels: {
    id: string; instrumentPrepId: string; price: string; strength: number;
    note: string | null; typeLabel: string;
  }[];
  interactions: { prepLevelId: string; reaction: string }[];
  hypotheses: {
    id: string; rank: number; label: string; instrumentId: string;
    invalidation: string | null; plannedResponse: string | null;
  }[];
  events: { id: string; name: string; scheduledAt: string; importance: number }[];
  rules: { id: string; text: string }[];
}

const REACTIONS = [
  { value: "respected", label: "Held" },
  { value: "broke", label: "Broke" },
  { value: "broke_and_retested", label: "B&R" },
  { value: "no_touch", label: "Untouched" },
];

/**
 * Second-monitor mode: narrow, high contrast, nothing but what you need to stay
 * on plan. Level interactions can be marked here without leaving the session,
 * and the whole view refreshes itself every minute.
 */
export function Companion(props: Props) {
  const router = useRouter();
  const [, start] = React.useTransition();
  const [active, setActive] = React.useState(props.instruments[0]?.id ?? "");
  const [tick, setTick] = React.useState(0);

  // Countdown ticks locally; data refetches once a minute.
  React.useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  React.useEffect(() => {
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [router]);

  const instrument = props.instruments.find((i) => i.id === active) ?? props.instruments[0];
  const prep = props.preps.find((p) => p.instrumentId === instrument?.id);
  const levels = props.levels
    .filter((l) => l.instrumentPrepId === prep?.id)
    .sort((a, b) => Number(b.price) - Number(a.price));
  const primary = props.hypotheses.find((h) => h.instrumentId === instrument?.id)
    ?? props.hypotheses[0];
  const reactionFor = (id: string) => props.interactions.find((i) => i.prepLevelId === id)?.reaction;

  const nextEvent = props.events
    .filter((e) => minutesUntil(e.scheduledAt) >= 0)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0];

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)] w-full max-w-[420px] mx-auto px-3 py-3">
      <header className="flex items-center gap-2 mb-3">
        <Link
          href={`/day/${props.date}`}
          className="text-11 text-[var(--text-tertiary)] hover:text-[var(--text)]"
        >
          ← day
        </Link>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => start(async () => { await reground(props.dayId, props.date); router.refresh(); })}
          className="text-11 px-2 h-6 rounded-[var(--r-input)] border border-[var(--line-strong)]
                     hover:bg-[var(--bg-hover)]"
        >
          Reground
        </button>
      </header>

      {nextEvent && (
        <div
          className={cn(
            "mb-3 px-2.5 py-2 rounded-[var(--r-std)] border",
            minutesUntil(nextEvent.scheduledAt) <= 15
              ? "border-[var(--warn)] bg-[var(--warn-quiet)]"
              : "border-[var(--line-strong)]",
          )}
        >
          <div className="label mb-0.5">Next release</div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-13 font-[590] truncate">{nextEvent.name}</span>
            <span className="mono text-13 num shrink-0" key={tick}>
              {countdownLabel(nextEvent.scheduledAt)}
            </span>
          </div>
          <div className="text-11 text-[var(--text-tertiary)] mono">
            {localTime(nextEvent.scheduledAt)} · importance {nextEvent.importance}
          </div>
        </div>
      )}

      {props.instruments.length > 1 && (
        <div role="tablist" aria-label="Instrument" className="flex gap-1 mb-3 overflow-x-auto">
          {props.instruments.map((i) => (
            <button
              key={i.id}
              role="tab"
              aria-selected={i.id === active}
              onClick={() => setActive(i.id)}
              className={cn(
                "h-7 px-2.5 rounded-[var(--r-input)] mono text-12 shrink-0",
                i.id === active
                  ? "bg-[var(--accent)] text-[var(--text-on-accent)] font-[560]"
                  : "border border-[var(--line-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
              )}
            >
              {i.symbol}
            </button>
          ))}
        </div>
      )}

      {primary && (
        <section className="mb-3 pl-2.5 border-l-2 border-l-[var(--accent)]">
          <div className="label mb-0.5">Primary hypothesis</div>
          <h1 className="text-15 font-[590] leading-[1.3]">{primary.label}</h1>
          {primary.invalidation && (
            <p className="text-12 mt-1.5">
              <span className="label mr-1.5">Wrong if</span>
              <span className="text-[var(--neg)]">{primary.invalidation}</span>
            </p>
          )}
          {primary.plannedResponse && (
            <p className="text-12 mt-1 text-[var(--text-secondary)]">{primary.plannedResponse}</p>
          )}
        </section>
      )}

      <section className="mb-3">
        <div className="label mb-1">Levels — {instrument?.symbol}</div>
        {levels.length === 0 ? (
          <p className="text-12 text-[var(--text-tertiary)]">Nothing marked for this instrument.</p>
        ) : (
          <ul className="space-y-0.5">
            {levels.map((l) => {
              const reaction = reactionFor(l.id);
              return (
                <li key={l.id} className="py-1 border-b border-[var(--line)] last:border-0">
                  <div className="flex items-baseline gap-2">
                    <span className="mono text-13 font-[560] tabular-nums w-[76px]">
                      {formatPrice(l.price, instrument?.tickSize ?? 0.25)}
                    </span>
                    <span className="text-12 flex-1 min-w-0 truncate">{l.typeLabel}</span>
                    <span className="text-11 text-[var(--text-tertiary)]">{"•".repeat(l.strength)}</span>
                  </div>
                  <div className="flex gap-0.5 mt-1">
                    {REACTIONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        aria-pressed={reaction === r.value}
                        onClick={() => start(async () => {
                          await setLevelInteraction(props.date, {
                            prepLevelId: l.id, reaction: r.value,
                          });
                          router.refresh();
                        })}
                        className={cn(
                          "h-6 px-1.5 rounded-[var(--r-input)] text-11 border",
                          reaction === r.value
                            ? "bg-[var(--bg-active)] border-transparent font-[560]"
                            : "border-[var(--line)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]",
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {props.rules.length > 0 && (
        <section>
          <div className="label mb-1">Rules</div>
          <ul className="text-12 space-y-1 text-[var(--text-secondary)]">
            {props.rules.map((r) => (
              <li key={r.id} className="flex gap-1.5">
                <span aria-hidden className="text-[var(--text-tertiary)]">—</span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
