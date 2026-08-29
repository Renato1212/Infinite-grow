"use client";
import * as React from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { localTime } from "@/lib/time";
import { signedMoney } from "@/lib/format";
import { num } from "@/lib/pnl";
import type { DayBundle } from "@/lib/queries/day";

/** Realised equity through the session. Auto-generated from trade exits. */
export function PnlCurve({ points }: { points: DayBundle["pnlPoints"] }) {
  const data = React.useMemo(
    () => points.map((p) => ({
      t: localTime(p.recordedAt),
      pnl: num(p.realisedPnl),
    })),
    [points],
  );

  if (data.length < 2) {
    return (
      <div className="h-[132px] grid place-items-center text-12 text-[var(--text-tertiary)]">
        The curve appears once two trades have closed.
      </div>
    );
  }

  const last = data[data.length - 1].pnl;
  const positive = last >= 0;
  const stroke = positive ? "var(--pos)" : "var(--neg)";

  return (
    <div className="h-[132px] -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.16} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="t" tickLine={false} axisLine={false}
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} minTickGap={28}
          />
          <YAxis
            width={54} tickLine={false} axisLine={false}
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
            tickFormatter={(v: number) => signedMoney(v, true)}
          />
          <ReferenceLine y={0} stroke="var(--line-strong)" />
          <Tooltip
            cursor={{ stroke: "var(--line-strong)" }}
            contentStyle={{
              background: "var(--bg-raised)", border: "1px solid var(--line-strong)",
              borderRadius: "var(--r-std)", fontSize: 12, boxShadow: "var(--shadow-raised)",
            }}
            labelStyle={{ color: "var(--text-tertiary)", fontSize: 11 }}
            formatter={(v) => [signedMoney(Number(v)), "Realised"]}
          />
          <Area
            type="monotone" dataKey="pnl" stroke={stroke} strokeWidth={1.6}
            fill="url(#pnlFill)" isAnimationActive={false} dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
