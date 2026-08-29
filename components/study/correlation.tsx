"use client";
import * as React from "react";
import {
  CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { Card, Stat } from "@/components/ui/surface";
import { Select } from "@/components/ui/field";
import { CORRELATION_FIELDS, correlate, type Fact } from "@/lib/study/aggregate";

const AXIS = { fontSize: 11, fill: "var(--text-tertiary)" } as const;

/** Two numeric fields, a scatter, and an honest warning below thirty pairs. */
export function CorrelationExplorer({ facts }: { facts: Fact[] }) {
  const [xKey, setXKey] = React.useState("conviction");
  const [yKey, setYKey] = React.useState("r_multiple");

  const x = CORRELATION_FIELDS.find((f) => f.key === xKey)!;
  const y = CORRELATION_FIELDS.find((f) => f.key === yKey)!;
  const { points, r, n } = React.useMemo(() => correlate(facts, x, y), [facts, x, y]);

  const strength =
    r === null ? "not enough data"
    : Math.abs(r) < 0.1 ? "no relationship"
    : Math.abs(r) < 0.3 ? "weak"
    : Math.abs(r) < 0.5 ? "moderate"
    : "strong";

  return (
    <Card className="p-4 min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <div className="label mb-1">Horizontal</div>
            <Select value={xKey} className="h-8 py-0 w-[170px]" onChange={(e) => setXKey(e.target.value)}>
              {CORRELATION_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </Select>
          </div>
          <div>
            <div className="label mb-1">Vertical</div>
            <Select value={yKey} className="h-8 py-0 w-[170px]" onChange={(e) => setYKey(e.target.value)}>
              {CORRELATION_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </Select>
          </div>
        </div>
        <div className="flex items-start gap-6">
          <Stat
            label="Correlation" value={r === null ? "—" : r.toFixed(3)}
            sub={strength} tone="muted"
          />
          <Stat label="Pairs" value={String(n)} tone="muted" />
        </div>
      </header>

      {n < 30 && (
        <p className="text-11 text-[var(--warn)] mb-2">
          {n} pairs. Below thirty, a correlation coefficient is closer to noise than to a finding —
          it will move a lot with the next few trades.
        </p>
      )}

      {points.length === 0 ? (
        <p className="text-12 text-[var(--text-tertiary)]">
          No trades have both of those fields recorded.
        </p>
      ) : (
        <div className="h-[240px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
              <CartesianGrid stroke="var(--line)" />
              <XAxis
                type="number" dataKey="x" name={x.label} tick={AXIS}
                tickLine={false} axisLine={false}
                label={{ value: x.label, position: "insideBottom", offset: -8, style: AXIS }}
              />
              <YAxis
                type="number" dataKey="y" name={y.label} width={56} tick={AXIS}
                tickLine={false} axisLine={false}
              />
              <ZAxis range={[34, 34]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3", stroke: "var(--line-strong)" }}
                contentStyle={{
                  background: "var(--bg-raised)", border: "1px solid var(--line-strong)",
                  borderRadius: "var(--r-std)", fontSize: 12,
                }}
              />
              <Scatter data={points} isAnimationActive={false}>
                {points.map((_, i) => (
                  <Cell key={i} fill="var(--accent)" fillOpacity={0.5} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
