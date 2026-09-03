"use client";
import Link from "next/link";
import { Card, EmptyState, SampleSize } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { signedMoney, humanise, percent } from "@/lib/format";
import { num } from "@/lib/pnl";

export interface SimilarDay {
  day: string;
  net_pnl: string;
  trade_count: number;
  actual_day_type: string | null;
  open_type: string | null;
  volume_regime: string | null;
  volatility_regime: string | null;
  primary_hypothesis_outcome: string | null;
  score: number;
  max_score: number;
}

/**
 * "Days like this one, and how they resolved." Weighted matching on the
 * categorical fields, no ML — and it only appears once the day is classified,
 * because before that there is nothing to match on.
 */
export function SimilarDays({ days, classified }: { days: SimilarDay[]; classified: boolean }) {
  if (!classified) {
    return (
      <Card className="p-4">
        <h3 className="label mb-2">Days like this one</h3>
        <EmptyState
          title="Classify the day first."
          body="Set the day type, open type and the two regimes above, and the most similar sessions you have already traded appear here with how they resolved."
        />
      </Card>
    );
  }

  const net = days.reduce((a, d) => a + num(d.net_pnl), 0);
  const green = days.filter((d) => num(d.net_pnl) > 0).length;

  return (
    <Card className="p-4 min-w-0">
      <header className="flex items-baseline justify-between gap-3 mb-2.5">
        <div>
          <h3 className="label">Days like this one</h3>
          <p className="text-11 [color:var(--text-tertiary)] mt-0.5">
            Weighted match on day type, open, regimes and flow flags.
          </p>
        </div>
        <SampleSize n={days.length} min={5} />
      </header>

      {days.length === 0 ? (
        <EmptyState
          title="No comparable sessions yet."
          body="Once you have classified a few more days, the ones that look like this will show up here — and what they did next."
        />
      ) : (
        <>
          <p className="text-12 [color:var(--text-secondary)] mb-2.5">
            On these {days.length} sessions you made{" "}
            <span className={cn(
              "num font-[560]",
              net > 0 && "[color:var(--pos)]", net < 0 && "[color:var(--neg)]",
            )}>
              {signedMoney(net)}
            </span>
            {days.length > 0 && ` · ${percent(green / days.length)} of them green`}.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-12 border-collapse min-w-[540px]">
              <thead>
                <tr>
                  {["Match", "Day", "Type", "Regimes", "Trades", "Net", "Primary hypothesis"].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "label font-[560] py-1.5 whitespace-nowrap",
                        i >= 4 ? "text-right pl-3" : "text-left pr-3",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day} className="border-t border-[var(--line)]">
                    <td className="py-1.5 pr-3 num whitespace-nowrap [color:var(--text-secondary)]">
                      <span
                        className="inline-block w-8 h-1.5 rounded-full bg-[var(--bg-hover)] mr-1.5 align-middle overflow-hidden"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${(d.score / Math.max(1, d.max_score)) * 100}%` }}
                        />
                      </span>
                      {d.score}/{d.max_score}
                    </td>
                    <td className="py-1.5 pr-3 mono whitespace-nowrap">
                      <Link href={`/day/${d.day}`} className="hover:underline underline-offset-2">
                        {d.day}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{humanise(d.actual_day_type)}</td>
                    <td className="py-1.5 pr-3 [color:var(--text-secondary)] whitespace-nowrap">
                      {d.volume_regime ?? "—"} / {d.volatility_regime ?? "—"}
                    </td>
                    <td className="py-1.5 pl-3 text-right num">{d.trade_count}</td>
                    <td className={cn(
                      "py-1.5 pl-3 text-right num font-[560] whitespace-nowrap",
                      num(d.net_pnl) > 0 && "[color:var(--pos)]",
                      num(d.net_pnl) < 0 && "[color:var(--neg)]",
                    )}>
                      {signedMoney(d.net_pnl)}
                    </td>
                    <td className="py-1.5 pl-3 text-right [color:var(--text-secondary)] whitespace-nowrap">
                      {d.primary_hypothesis_outcome ? humanise(d.primary_hypothesis_outcome) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
