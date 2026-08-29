"use client";
import * as React from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { Card, SampleSize, Stat } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { signedMoney, percent, humanise, signedNumber } from "@/lib/format";
import type { Expectancy } from "@/lib/pnl";
import type { Bucket, Fact } from "@/lib/study/aggregate";
import {
  consistency, domainMatrix, groupBy, maeMfeScatter, mistakesOverTime,
  plannedSplit, rHistogram, summarise, timeOfDay,
} from "@/lib/study/aggregate";

const AXIS = { fontSize: 11, fill: "var(--text-tertiary)" } as const;
const TOOLTIP = {
  background: "var(--bg-raised)", border: "1px solid var(--line-strong)",
  borderRadius: "var(--r-std)", fontSize: 12, boxShadow: "var(--shadow-raised)",
} as const;

/** Shell: every card names its sample size and greys out below the minimum. */
export function Analysis({
  title, description, n, min, children, wide,
}: {
  title: string; description?: string; n: number; min: number;
  children: React.ReactNode; wide?: boolean;
}) {
  const thin = n < min;
  return (
    <Card className={cn("p-4 min-w-0", wide && "xl:col-span-2")}>
      <header className="flex items-baseline justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-13 font-[590]">{title}</h3>
          {description && (
            <p className="text-11 text-[var(--text-tertiary)] mt-0.5">{description}</p>
          )}
        </div>
        <SampleSize n={n} min={min} />
      </header>
      <div className={cn(thin && "opacity-45")} aria-disabled={thin}>
        {children}
      </div>
      {thin && (
        <p className="text-11 text-[var(--warn)] mt-2.5">
          Below your minimum of {min}. Read it as an anecdote, not a finding.
        </p>
      )}
    </Card>
  );
}

export function ExpectancyCard({ facts, min }: { facts: Fact[]; min: number }) {
  const e = summarise(facts);
  const hist = rHistogram(facts);
  return (
    <Analysis
      title="Expectancy and distribution"
      description="Where the money actually comes from in this slice."
      n={e.count} min={min}
    >
      <div className="flex flex-wrap gap-x-7 gap-y-3 mb-4">
        <Stat label="Net" value={signedMoney(e.netPnl)} tone={e.netPnl >= 0 ? "pos" : "neg"} />
        <Stat label="Expectancy" value={e.expectancy === null ? "—" : signedMoney(e.expectancy)} sub="per trade" tone="muted" />
        <Stat label="Win rate" value={e.winRate === null ? "—" : percent(e.winRate)} sub={`${e.wins}W ${e.losses}L`} tone="muted" />
        <Stat label="Profit factor" value={e.profitFactor === null ? "—" : e.profitFactor.toFixed(2)} tone="muted" />
        <Stat label="Avg win" value={e.avgWin === null ? "—" : signedMoney(e.avgWin)} tone="muted" />
        <Stat label="Avg loss" value={e.avgLoss === null ? "—" : signedMoney(e.avgLoss)} tone="muted" />
        <Stat label="Avg R" value={e.avgR === null ? "—" : signedNumber(e.avgR, 2)} tone="muted" />
      </div>
      <div className="h-[150px] -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={hist} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="bucket" tick={AXIS} tickLine={false} axisLine={false} interval={0} />
            <YAxis width={30} tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: "var(--bg-hover)" }} contentStyle={TOOLTIP} />
            <Bar dataKey="n" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {hist.map((b) => (
                <Cell
                  key={b.bucket}
                  fill={b.bucket.startsWith("<") || b.bucket.startsWith("-") ? "var(--neg)" : "var(--pos)"}
                  fillOpacity={0.75}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Analysis>
  );
}

export function DomainMatrixCard({ facts, min }: { facts: Fact[]; min: number }) {
  const m = domainMatrix(facts);
  const cell = (row: string, col: string) => m.cells.find((c) => c.row === row && c.col === col);
  return (
    <Analysis
      title="Edge domain matrix"
      description="Which of the five domains pays, and what a conflicting one costs."
      n={facts.length} min={min} wide
    >
      <div className="overflow-x-auto">
        <table className="w-full text-12 border-collapse min-w-[560px]">
          <thead>
            <tr>
              <th className="label font-[560] text-left py-1.5 pr-3">Primary domain</th>
              {m.cols.map((c) => (
                <th key={c} className="label font-[560] text-right py-1.5 px-3">{humanise(c)}</th>
              ))}
              <th className="label font-[560] text-right py-1.5 pl-3">All</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => {
              const rowFacts = facts.filter((f) => (f.primary_domain_label ?? "Not scored") === r);
              const total = summarise(rowFacts);
              return (
                <tr key={r} className="border-t border-[var(--line)]">
                  <td className="py-1.5 pr-3">{r}</td>
                  {m.cols.map((c) => {
                    const v = cell(r, c);
                    return (
                      <td key={c} className="py-1.5 px-3 text-right">
                        {v ? <CellValue e={v} /> : <span className="text-[var(--text-tertiary)]">—</span>}
                      </td>
                    );
                  })}
                  <td className="py-1.5 pl-3 text-right font-[560]"><CellValue e={total} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Analysis>
  );
}

function CellValue({ e }: { e: Expectancy }) {
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={cn(
        "num tabular-nums",
        e.netPnl > 0 && "text-[var(--pos)]", e.netPnl < 0 && "text-[var(--neg)]",
      )}>
        {signedMoney(e.netPnl, true)}
      </span>
      <span className="text-11 text-[var(--text-tertiary)] num">
        {e.count} · {e.winRate === null ? "—" : percent(e.winRate)}
      </span>
    </span>
  );
}

export function PlanAdherenceCard({ facts, min }: { facts: Fact[]; min: number }) {
  const split = plannedSplit(facts);
  const rows: { label: string; e: Expectancy }[] = [
    { label: "In the plan", e: split.planned },
    { label: "Improvised", e: split.unplanned },
  ];
  return (
    <Analysis
      title="Plan adherence"
      description="Trades you wrote down beforehand against trades you did not."
      n={facts.length} min={min}
    >
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-12">{r.label}</span>
              <span className={cn(
                "num text-15 font-[590]",
                r.e.netPnl > 0 && "text-[var(--pos)]", r.e.netPnl < 0 && "text-[var(--neg)]",
              )}>
                {signedMoney(r.e.netPnl)}
              </span>
            </div>
            <Bars value={r.e.netPnl} max={Math.max(
              Math.abs(split.planned.netPnl), Math.abs(split.unplanned.netPnl), 1,
            )} />
            <div className="text-11 text-[var(--text-tertiary)] num mt-1">
              {r.e.count} trades · {r.e.winRate === null ? "—" : percent(r.e.winRate)} win rate ·{" "}
              {r.e.expectancy === null ? "—" : `${signedMoney(r.e.expectancy)} each`}
            </div>
          </div>
        ))}
      </div>
    </Analysis>
  );
}

function Bars({ value, max }: { value: number; max: number }) {
  const width = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className="h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
      <div
        className="h-full rounded-full transition-[width] duration-[var(--d-slow)]"
        style={{
          width: `${width}%`,
          background: value >= 0 ? "var(--pos)" : "var(--neg)",
        }}
      />
    </div>
  );
}

export function HypothesisAccuracyCard({ facts, min }: { facts: Fact[]; min: number }) {
  const groups = groupBy(facts, (f) => f.hypothesis_outcome, (k) => humanise(k === "—" ? "unlinked" : k));
  return (
    <Analysis
      title="Hypothesis accuracy"
      description="What you make when the plan holds, and when it does not."
      n={facts.length} min={min}
    >
      <BucketTable buckets={groups} />
    </Analysis>
  );
}

export function EnvironmentCard({ facts, min }: { facts: Fact[]; min: number }) {
  const groups = groupBy(
    facts,
    (f) => `${f.actual_day_type ?? "unclassified"} · ${f.volume_regime ?? "?"}/${f.volatility_regime ?? "?"}`,
    (k) => humanise(k),
  );
  return (
    <Analysis
      title="Environment slicing"
      description="Day type by volume and volatility regime."
      n={facts.length} min={min}
    >
      <BucketTable buckets={groups.slice(0, 12)} />
    </Analysis>
  );
}

export function BucketTable({ buckets }: { buckets: Bucket[] }) {
  if (!buckets.length) {
    return <p className="text-12 text-[var(--text-tertiary)]">Nothing in this slice.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-12 border-collapse">
        <thead>
          <tr>
            {["", "n", "Win", "Net", "Expectancy", "Avg R"].map((h, i) => (
              <th key={h} className={cn("label font-[560] py-1.5", i === 0 ? "text-left" : "text-right pl-3")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key} className="border-t border-[var(--line)]">
              <td className="py-1.5 pr-3">{b.label}</td>
              <td className="py-1.5 pl-3 text-right num">{b.count}</td>
              <td className="py-1.5 pl-3 text-right num">{b.winRate === null ? "—" : percent(b.winRate)}</td>
              <td className={cn(
                "py-1.5 pl-3 text-right num font-[560]",
                b.netPnl > 0 && "text-[var(--pos)]", b.netPnl < 0 && "text-[var(--neg)]",
              )}>
                {signedMoney(b.netPnl, true)}
              </td>
              <td className="py-1.5 pl-3 text-right num">
                {b.expectancy === null ? "—" : signedMoney(b.expectancy, true)}
              </td>
              <td className="py-1.5 pl-3 text-right num">
                {b.avgR === null ? "—" : signedNumber(b.avgR, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TimeOfDayCard({ facts, min }: { facts: Fact[]; min: number }) {
  const buckets = timeOfDay(facts);
  const maxAbs = Math.max(1, ...buckets.map((b) => Math.abs(b.netPnl)));
  return (
    <Analysis
      title="Time of day"
      description="P&L by 15-minute entry bucket, Europe/Lisbon."
      n={facts.length} min={min} wide
    >
      {buckets.length === 0 ? (
        <p className="text-12 text-[var(--text-tertiary)]">No trades with entry times in this slice.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-0.5">
            {buckets.map((b) => {
              const intensity = Math.abs(b.netPnl) / maxAbs;
              return (
                <div
                  key={b.key}
                  title={`${b.label} · ${b.count} trades · ${signedMoney(b.netPnl)} · ${b.winRate === null ? "—" : percent(b.winRate)} win rate`}
                  className="w-[34px] rounded-[3px] px-0.5 py-1 text-center"
                  style={{
                    background: b.netPnl === 0
                      ? "var(--bg-hover)"
                      : `color-mix(in oklab, ${b.netPnl > 0 ? "var(--pos)" : "var(--neg)"} ${Math.round(12 + intensity * 62)}%, transparent)`,
                  }}
                >
                  <div className="text-[9px] mono text-[var(--text-secondary)] leading-none">{b.label}</div>
                  <div className="text-11 num leading-tight mt-0.5">{b.count}</div>
                </div>
              );
            })}
          </div>
          <p className="text-11 text-[var(--text-tertiary)] mt-2">
            Shade is net P&L, number is trade count. Hover for the detail.
          </p>
        </>
      )}
    </Analysis>
  );
}

export function LevelPerformanceCard({
  stats, min,
}: {
  stats: {
    bucket: string; n: number; respected: number; broke: number;
    broke_retested: number; no_touch: number; avg_ticks: string | null;
  }[];
  min: number;
}) {
  const total = stats.reduce((a, s) => a + s.n, 0);
  return (
    <Analysis
      title="Level performance"
      description="How price actually treated each level type you marked."
      n={total} min={min} wide
    >
      {stats.length === 0 ? (
        <p className="text-12 text-[var(--text-tertiary)]">
          No level interactions recorded yet. Mark what price did at each level during the session.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-12 border-collapse min-w-[520px]">
            <thead>
              <tr>
                {["Level type", "n", "Held", "Broke", "Broke & retested", "Untouched", "Avg ticks"].map((h, i) => (
                  <th key={h} className={cn("label font-[560] py-1.5", i === 0 ? "text-left" : "text-right pl-3")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.bucket} className="border-t border-[var(--line)]">
                  <td className="py-1.5 pr-3">{s.bucket}</td>
                  <td className="py-1.5 pl-3 text-right num">{s.n}</td>
                  <td className="py-1.5 pl-3 text-right num">{percent(s.respected / s.n)}</td>
                  <td className="py-1.5 pl-3 text-right num">{percent(s.broke / s.n)}</td>
                  <td className="py-1.5 pl-3 text-right num">{percent(s.broke_retested / s.n)}</td>
                  <td className="py-1.5 pl-3 text-right num text-[var(--text-tertiary)]">
                    {percent(s.no_touch / s.n)}
                  </td>
                  <td className="py-1.5 pl-3 text-right num">{s.avg_ticks ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Analysis>
  );
}

export function MaeMfeCard({ facts, min }: { facts: Fact[]; min: number }) {
  const points = maeMfeScatter(facts);
  return (
    <Analysis
      title="Entry timing"
      description="MAE against MFE. Up and left is early; down and right is late."
      n={points.length} min={min}
    >
      {points.length === 0 ? (
        <p className="text-12 text-[var(--text-tertiary)]">
          No trades with MAE and MFE recorded. Add them on the trade page.
        </p>
      ) : (
        <div className="h-[220px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 12, left: 0 }}>
              <CartesianGrid stroke="var(--line)" />
              <XAxis
                type="number" dataKey="mae" name="MAE ticks" tick={AXIS}
                tickLine={false} axisLine={false}
                label={{ value: "MAE ticks", position: "insideBottom", offset: -6, style: AXIS }}
              />
              <YAxis
                type="number" dataKey="mfe" name="MFE ticks" width={40} tick={AXIS}
                tickLine={false} axisLine={false}
              />
              <ZAxis range={[36, 36]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3", stroke: "var(--line-strong)" }}
                contentStyle={TOOLTIP}
              />
              <Scatter data={points} isAnimationActive={false}>
                {points.map((p, i) => (
                  <Cell
                    key={i}
                    fill={p.net >= 0 ? "var(--pos)" : "var(--neg)"}
                    fillOpacity={0.55}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </Analysis>
  );
}

export function MistakesCard({ facts, min }: { facts: Fact[]; min: number }) {
  const m = mistakesOverTime(facts);
  const data = m.series.map((s) => ({ month: s.month, total: s.total }));
  const tagged = facts.filter((f) => (f.mistake_labels ?? []).length > 0).length;
  return (
    <Analysis
      title="Mistake frequency"
      description="Error tags over time. The question is whether the line is falling."
      n={tagged} min={min}
    >
      {data.length === 0 ? (
        <p className="text-12 text-[var(--text-tertiary)]">
          No mistakes tagged in this slice. Tag them in the debrief and the trend appears here.
        </p>
      ) : (
        <>
          <div className="h-[150px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis width={28} tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Line
                  type="monotone" dataKey="total" stroke="var(--accent)" strokeWidth={1.8}
                  dot={{ r: 2.5 }} isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex flex-wrap gap-1.5 mt-2.5">
            {m.labels.slice(0, 8).map((l) => (
              <li key={l} className="text-11 px-1.5 py-0.5 rounded-[var(--r-pill)] bg-[var(--bg-hover)]">
                {l}
              </li>
            ))}
          </ul>
        </>
      )}
    </Analysis>
  );
}

export function ConsistencyCard({ facts, min }: { facts: Fact[]; min: number }) {
  const series = consistency(facts, 20);
  return (
    <Analysis
      title="Rolling 20-trade expectancy"
      description="Consistency, not a single number."
      n={facts.length} min={min}
    >
      {series.length === 0 ? (
        <p className="text-12 text-[var(--text-tertiary)]">
          Twenty trades are needed before this says anything.
        </p>
      ) : (
        <div className="h-[170px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="day" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis
                width={54} tick={AXIS} tickLine={false} axisLine={false}
                tickFormatter={(v: number) => signedMoney(v, true)}
              />
              <ReferenceLine y={0} stroke="var(--line-strong)" />
              <Tooltip
                contentStyle={TOOLTIP}
                formatter={(v) => [signedMoney(Number(v)), "Expectancy"]}
              />
              <Line
                type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={1.8}
                dot={false} isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Analysis>
  );
}

export function DisciplineCard({
  days, min,
}: {
  days: {
    day: string; net_pnl: string; process_adherence_pct: string | null;
    focus_rating: number | null; reground_count: number;
  }[];
  min: number;
}) {
  const withAdherence = days.filter((d) => d.process_adherence_pct !== null);
  const points = withAdherence.map((d) => ({
    adherence: Number(d.process_adherence_pct),
    net: Number(d.net_pnl),
    focus: d.focus_rating,
    day: d.day,
  }));

  const byFocus = new Map<number, { n: number; net: number }>();
  for (const d of days) {
    if (d.focus_rating === null) continue;
    const e = byFocus.get(d.focus_rating) ?? { n: 0, net: 0 };
    e.n++; e.net += Number(d.net_pnl);
    byFocus.set(d.focus_rating, e);
  }

  return (
    <Analysis
      title="Discipline against results"
      description="Rule adherence and focus, plotted against the day's outcome."
      n={points.length} min={Math.min(min, 20)}
    >
      {points.length === 0 ? (
        <p className="text-12 text-[var(--text-tertiary)]">
          Check your rules at the end of a day and adherence becomes a number here.
        </p>
      ) : (
        <>
          <div className="h-[170px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 14, left: 0 }}>
                <CartesianGrid stroke="var(--line)" />
                <XAxis
                  type="number" dataKey="adherence" domain={[0, 100]} tick={AXIS}
                  tickLine={false} axisLine={false}
                  label={{ value: "Rule adherence %", position: "insideBottom", offset: -8, style: AXIS }}
                />
                <YAxis
                  type="number" dataKey="net" width={54} tick={AXIS} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => signedMoney(v, true)}
                />
                <ReferenceLine y={0} stroke="var(--line-strong)" />
                <Tooltip contentStyle={TOOLTIP} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={points} isAnimationActive={false}>
                  {points.map((p, i) => (
                    <Cell key={i} fill={p.net >= 0 ? "var(--pos)" : "var(--neg)"} fillOpacity={0.6} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          {byFocus.size > 0 && (
            <table className="w-full text-12 border-collapse mt-3">
              <thead>
                <tr>
                  <th className="label font-[560] text-left py-1">Focus</th>
                  <th className="label font-[560] text-right py-1">Days</th>
                  <th className="label font-[560] text-right py-1">Net</th>
                </tr>
              </thead>
              <tbody>
                {[...byFocus.entries()].sort((a, b) => a[0] - b[0]).map(([focus, v]) => (
                  <tr key={focus} className="border-t border-[var(--line)]">
                    <td className="py-1 num">{focus}</td>
                    <td className="py-1 text-right num">{v.n}</td>
                    <td className={cn(
                      "py-1 text-right num",
                      v.net > 0 && "text-[var(--pos)]", v.net < 0 && "text-[var(--neg)]",
                    )}>
                      {signedMoney(v.net, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Analysis>
  );
}
