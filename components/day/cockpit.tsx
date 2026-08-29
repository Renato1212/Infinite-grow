"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { computePhases, canCloseDay, type PhaseKey } from "@/lib/completion";
import { CompletionRing } from "@/components/ui/ring";
import { Button, TextButton } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { dayLabel, shiftDay, todayISO } from "@/lib/time";
import { signedMoney, pnlTone, humanise } from "@/lib/format";
import { closeDay, reopenDay } from "@/app/actions/day";
import type { CockpitProps } from "./types";
import { PhasePrepare } from "./phase-prepare";
import { PhasePlan } from "./phase-plan";
import { PhaseTrade } from "./phase-trade";
import { PhaseDebriefTrades } from "./phase-debrief-trades";
import { PhaseDebriefDay } from "./phase-debrief-day";

export function DayCockpit(props: CockpitProps) {
  const { date, bundle, streak } = props;
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = React.useTransition();

  const phases = React.useMemo(() => computePhases({
    narratives: bundle.narratives,
    preps: bundle.preps,
    levels: bundle.levels,
    environment: bundle.environment,
    hypotheses: bundle.hypotheses,
    opportunities: bundle.opportunities,
    trades: bundle.trades,
    notes: bundle.notes,
    tradesDebriefed: bundle.trades.map((t) => ({
      tradeId: t.id,
      hasPrimaryDomain: props.assessments.some((a) => a.tradeId === t.id && a.wasPrimary),
      hasDebrief: props.tradeDebriefs.some((d) => d.tradeId === t.id && d.repeatable !== null),
    })),
    dayDebrief: bundle.debrief,
    ruleChecks: bundle.ruleChecks,
    activeRuleCount: props.rules.length,
  }), [bundle, props.assessments, props.tradeDebriefs, props.rules.length]);

  const closable = canCloseDay(phases);
  const closed = bundle.day.status === "debriefed";

  const scrollTo = React.useCallback((key: PhaseKey) => {
    document.getElementById(`phase-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  React.useEffect(() => {
    if (props.focusPhase) scrollTo(props.focusPhase as PhaseKey);
  }, [props.focusPhase, scrollTo]);

  // b → brief, / → search. n and d are owned by the phases that use them.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "b") { e.preventDefault(); router.push(`/day/${date}/brief`); }
      if (e.key === "d") { e.preventDefault(); scrollTo("debrief-trades"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [date, router, scrollTo]);

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Link
              href={`/day/${shiftDay(date, -1)}`}
              aria-label="Previous day"
              className="size-6 grid place-items-center rounded-[var(--r-input)] text-[var(--text-tertiary)]
                         hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >‹</Link>
            <Link
              href={`/day/${shiftDay(date, 1)}`}
              aria-label="Next day"
              className="size-6 grid place-items-center rounded-[var(--r-input)] text-[var(--text-tertiary)]
                         hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >›</Link>
            {date !== todayISO() && (
              <TextButton onClick={() => router.push(`/day/${todayISO()}`)}>Today</TextButton>
            )}
          </div>
          <h1 className="text-24 font-[590] tracking-[-0.018em]">{dayLabel(date)}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Pill tone={closed ? "pos" : bundle.day.status === "live" ? "accent" : "neutral"}>
              {humanise(bundle.day.status)}
            </Pill>
            {bundle.day.actualDayType && <Pill>{humanise(bundle.day.actualDayType)}</Pill>}
            {streak > 0 && (
              <span className="text-11 text-[var(--text-tertiary)] num" title="Consecutive debriefed sessions">
                {streak} day streak
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-6">
          <div className="text-right">
            <div className="label">Net</div>
            <div className={cn(
              "text-24 num font-[590] tracking-[-0.015em]",
              pnlTone(bundle.day.netPnl) === "pos" && "text-[var(--pos)]",
              pnlTone(bundle.day.netPnl) === "neg" && "text-[var(--neg)]",
            )}>
              {signedMoney(bundle.day.netPnl)}
            </div>
            <div className="text-11 text-[var(--text-tertiary)] num">
              {bundle.day.tradeCount} trades · {bundle.day.winCount} won
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/day/${date}/brief`}>
              <Button>Brief</Button>
            </Link>
            {closed ? (
              <Button
                variant="ghost" disabled={pending}
                onClick={() => start(async () => {
                  await reopenDay(bundle.day.id, date);
                  toast("Day reopened.");
                  router.refresh();
                })}
              >
                Reopen
              </Button>
            ) : (
              <Button
                variant="primary" disabled={!closable || pending}
                title={closable ? undefined : "Finish the gating phases first"}
                onClick={() => start(async () => {
                  const res = await closeDay(bundle.day.id, date);
                  toast(res.ok ? "Day closed." : res.error);
                  router.refresh();
                })}
              >
                Close the day
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* The stepper shows state; it never hides work. Every phase is on the page. */}
      <nav
        aria-label="Day phases"
        className="sticky top-12 z-20 -mx-4 px-4 py-2 mb-6 bg-[var(--bg)]/90 backdrop-blur-md
                   border-b border-[var(--line)] overflow-x-auto"
      >
        <ol className="flex items-center gap-1 min-w-max">
          {phases.map((p, i) => (
            <li key={p.key} className="flex items-center">
              {i > 0 && <span aria-hidden className="w-4 h-px bg-[var(--line)] mx-0.5" />}
              <button
                type="button"
                onClick={() => scrollTo(p.key)}
                title={p.checks.filter((c) => !c.done).map((c) => c.label).join(" · ") || "Complete"}
                className={cn(
                  "flex items-center gap-2 h-8 px-2.5 rounded-[var(--r-input)] text-13",
                  "hover:bg-[var(--bg-hover)] transition-colors duration-[var(--d-fast)]",
                  p.complete ? "text-[var(--text)]" : "text-[var(--text-secondary)]",
                )}
              >
                <CompletionRing value={p.ratio} label={`${p.label}, ${Math.round(p.ratio * 100)}% complete`} />
                <span className="whitespace-nowrap">{p.label}</span>
                {!p.required && (
                  <span className="text-11 text-[var(--text-tertiary)]">optional</span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-10 pb-24">
        <PhasePrepare {...props} phase={phases[0]} />
        <PhasePlan {...props} phase={phases[1]} />
        <PhaseTrade {...props} phase={phases[2]} />
        <PhaseDebriefTrades {...props} phase={phases[3]} />
        <PhaseDebriefDay {...props} phase={phases[4]} />
      </div>
    </div>
  );
}

/** Shared section chrome for a phase. */
export function PhaseShell({
  id, index, title, description, ratio, checks, children, actions,
}: {
  id: string; index: number; title: string; description: string;
  ratio: number; checks: { label: string; done: boolean }[];
  children: React.ReactNode; actions?: React.ReactNode;
}) {
  const missing = checks.filter((c) => !c.done);
  // Per-trade checks all carry the same label; say it once, with a count.
  const missingLabels = [...new Set(missing.map((c) => c.label.toLowerCase()))];
  const missingText = missing.length > missingLabels.length
    ? `${missing.length} left: ${missingLabels.join(" · ")}`
    : missingLabels.join(" · ");
  return (
    <section id={`phase-${id}`} className="scroll-mt-24 min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <CompletionRing value={ratio} size={22} className="mt-1" />
          <div className="min-w-0">
            <h2 className="text-17 font-[590] tracking-[-0.014em]">
              <span className="text-[var(--text-tertiary)] num mr-1.5">{index}</span>
              {title}
            </h2>
            <p className="text-12 text-[var(--text-secondary)] mt-0.5">{description}</p>
            {missing.length > 0 && (
              <p className="text-11 text-[var(--text-tertiary)] mt-1">
                Still to do: {missingText}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
