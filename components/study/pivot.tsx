"use client";
import * as React from "react";
import { Card } from "@/components/ui/surface";
import { Select } from "@/components/ui/field";
import { SampleSize } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { signedMoney, percent, signedNumber, humanise } from "@/lib/format";
import { matrix, PIVOT_DIMENSIONS, type Fact } from "@/lib/study/aggregate";

const METRICS = [
  { key: "net", label: "Net P&L", get: (e: { netPnl: number }) => e.netPnl, format: (v: number) => signedMoney(v, true), signed: true },
  { key: "count", label: "Trade count", get: (e: { count: number }) => e.count, format: (v: number) => String(v), signed: false },
  { key: "expectancy", label: "Expectancy", get: (e: { expectancy: number | null }) => e.expectancy ?? 0, format: (v: number) => signedMoney(v, true), signed: true },
  { key: "winRate", label: "Win rate", get: (e: { winRate: number | null }) => e.winRate ?? 0, format: (v: number) => percent(v), signed: false },
  { key: "avgR", label: "Average R", get: (e: { avgR: number | null }) => e.avgR ?? 0, format: (v: number) => signedNumber(v, 2), signed: true },
] as const;

/**
 * Two dimensions and a metric, rendered as a heatmap. Deliberately generic so
 * comparisons nobody anticipated are one dropdown away.
 */
export function PivotBuilder({ facts, min }: { facts: Fact[]; min: number }) {
  const [rowKey, setRowKey] = React.useState("domain");
  const [colKey, setColKey] = React.useState("planned");
  const [metricKey, setMetricKey] = React.useState<string>("net");

  const rowDim = PIVOT_DIMENSIONS.find((d) => d.key === rowKey)!;
  const colDim = PIVOT_DIMENSIONS.find((d) => d.key === colKey)!;
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const m = React.useMemo(
    () => matrix(facts, rowDim.get, colDim.get),
    [facts, rowDim, colDim],
  );

  const values = m.cells.map((c) => Math.abs(metric.get(c as never)));
  const maxAbs = Math.max(1, ...values);

  return (
    <Card className="p-4 min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="label mb-1">Rows</div>
            <Select value={rowKey} className="h-8 py-0 w-[160px]" onChange={(e) => setRowKey(e.target.value)}>
              {PIVOT_DIMENSIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </Select>
          </div>
          <div>
            <div className="label mb-1">Columns</div>
            <Select value={colKey} className="h-8 py-0 w-[160px]" onChange={(e) => setColKey(e.target.value)}>
              {PIVOT_DIMENSIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </Select>
          </div>
          <div>
            <div className="label mb-1">Metric</div>
            <Select value={metricKey} className="h-8 py-0 w-[140px]" onChange={(e) => setMetricKey(e.target.value)}>
              {METRICS.map((mm) => <option key={mm.key} value={mm.key}>{mm.label}</option>)}
            </Select>
          </div>
        </div>
        <SampleSize n={facts.length} min={min} />
      </header>

      {m.rows.length === 0 ? (
        <p className="text-12 text-[var(--text-tertiary)]">Nothing to pivot in this slice.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-12 border-collapse">
            <thead>
              <tr>
                <th className="label font-[560] text-left py-1.5 pr-3 sticky left-0 bg-[var(--bg-raised)]">
                  {rowDim.label}
                </th>
                {m.cols.map((c) => (
                  <th key={c} className="label font-[560] text-right py-1.5 px-2 whitespace-nowrap">
                    {humanise(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r} className="border-t border-[var(--line)]">
                  <td className="py-1 pr-3 whitespace-nowrap sticky left-0 bg-[var(--bg-raised)]">
                    {humanise(r)}
                  </td>
                  {m.cols.map((c) => {
                    const cell = m.cells.find((x) => x.row === r && x.col === c);
                    if (!cell) {
                      return <td key={c} className="py-1 px-2 text-right text-[var(--text-tertiary)]">—</td>;
                    }
                    const value = metric.get(cell as never);
                    const intensity = Math.abs(value) / maxAbs;
                    const positive = metric.signed ? value >= 0 : true;
                    return (
                      <td key={c} className="py-1 px-1">
                        <div
                          title={`${cell.count} trades`}
                          className="rounded-[4px] px-2 py-1 text-right num tabular-nums"
                          style={{
                            background: `color-mix(in oklab, ${
                              metric.signed
                                ? positive ? "var(--pos)" : "var(--neg)"
                                : "var(--accent)"
                            } ${Math.round(8 + intensity * 55)}%, transparent)`,
                          }}
                        >
                          <div>{metric.format(value)}</div>
                          <div className={cn(
                            "text-[10px] text-[var(--text-tertiary)]",
                            cell.count < min && "text-[var(--warn)]",
                          )}>
                            n={cell.count}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-11 text-[var(--text-tertiary)] mt-2">
        Cells below your minimum sample size of {min} show their count in amber.
      </p>
    </Card>
  );
}
