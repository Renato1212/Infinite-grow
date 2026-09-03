"use client";
import * as React from "react";
import { PhaseShell } from "./cockpit";
import { Card, Stat } from "@/components/ui/surface";
import { QuickTrade } from "./quick-trade";
import { TradesTable } from "./trades-table";
import { PnlCurve } from "./pnl-curve";
import { DayNotes } from "./day-notes";
import { CsvImport } from "./csv-import";
import { Explainer } from "@/components/explainer";
import { expectancy, num } from "@/lib/pnl";
import { signedMoney, percent, pnlTone } from "@/lib/format";
import type { Phase } from "@/lib/completion";
import type { CockpitProps } from "./types";

export function PhaseTrade(props: CockpitProps & { phase: Phase }) {
  const { bundle, date, instruments, phase, explainers, openAction } = props;
  const [focusEntry, setFocusEntry] = React.useState(openAction === "trade");

  // n opens the quick-entry form, wherever you are on the page.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key !== "n") return;
      e.preventDefault();
      document.getElementById("phase-trade")?.scrollIntoView({ behavior: "smooth", block: "start" });
      setFocusEntry(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stats = expectancy(bundle.trades.map((t) => ({
    netPnl: num(t.netPnl), rMultiple: t.rMultiple === null ? null : num(t.rMultiple),
  })));
  const planned = bundle.trades.filter((t) => t.planned);
  const improvised = bundle.trades.filter((t) => !t.planned);

  return (
    <PhaseShell
      id="trade" index={3} title="Trade"
      description="Log fast, note what you see, and keep the plan one keystroke away."
      ratio={phase.ratio} checks={phase.checks}
      actions={<CsvImport dayId={bundle.day.id} date={date} />}
    >
      <div className="space-y-4">
        <QuickTrade
          dayId={bundle.day.id} date={date} instruments={instruments}
          hypotheses={bundle.hypotheses} sessions={bundle.sessions}
          autoFocus={focusEntry}
          onCreated={() => setFocusEntry(true)}
        />

        <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <Card className="p-4 min-w-0">
            <div className="flex flex-wrap gap-x-8 gap-y-3 mb-3">
              <Stat
                label="Net" value={signedMoney(stats.netPnl)}
                tone={pnlTone(stats.netPnl)}
                sub={`${stats.count} trades`}
              />
              <Stat
                label="Win rate" value={stats.winRate === null ? "—" : percent(stats.winRate)}
                sub={`${stats.wins}W ${stats.losses}L`} tone="muted"
              />
              <Stat
                label="Expectancy" value={stats.expectancy === null ? "—" : signedMoney(stats.expectancy)}
                sub="per trade" tone="muted"
              />
              <Stat
                label="Improvised" value={String(improvised.length)}
                sub={improvised.length ? signedMoney(improvised.reduce((a, t) => a + num(t.netPnl), 0)) : "none"}
                tone={improvised.length ? "neg" : "muted"}
              />
            </div>
            <PnlCurve points={bundle.pnlPoints} />
          </Card>

          <Card className="p-4 min-w-0">
            <DayNotes dayId={bundle.day.id} date={date} notes={bundle.notes} />
          </Card>
        </div>

        <Card className="p-1">
          <TradesTable
            trades={bundle.trades} instruments={instruments}
            hypotheses={bundle.hypotheses} date={date}
            assessments={props.assessments} domains={props.domains}
          />
        </Card>

        {improvised.length > 0 && (
          <div>
            <Explainer id="planned-vs-unplanned" source={explainers.plannedVsUnplanned} />
          </div>
        )}
      </div>
    </PhaseShell>
  );
}
