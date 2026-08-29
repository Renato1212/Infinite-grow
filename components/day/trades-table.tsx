"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pill, DirectionMark } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { deleteTrade } from "@/app/actions/trades";
import { localTime } from "@/lib/time";
import { formatPrice, num } from "@/lib/pnl";
import { signedMoney, signedNumber, duration, pnlTone } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { CockpitProps } from "./types";

export function TradesTable({
  trades, instruments, hypotheses, date, assessments, domains,
}: {
  trades: CockpitProps["bundle"]["trades"];
  instruments: CockpitProps["instruments"];
  hypotheses: CockpitProps["bundle"]["hypotheses"];
  date: string;
  assessments: CockpitProps["assessments"];
  domains: CockpitProps["domains"];
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();

  if (trades.length === 0) {
    return (
      <EmptyState
        title="No trades yet today."
        body="Add your first trade above — you can tag and debrief it later."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-12 border-collapse min-w-[860px]">
        <caption className="sr-only">Trades taken today</caption>
        <thead>
          <tr>
            {["In", "Out", "Held", "Instr.", "Side", "Size", "Entry", "Exit", "Ticks", "R", "Net", "Plan", "Primary domain", ""]
              .map((h) => (
                <th key={h} className="label font-[560] text-left px-2 py-2 whitespace-nowrap">{h}</th>
              ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const instrument = instruments.find((i) => i.id === t.instrumentId);
            const tickSize = num(instrument?.tickSize, 0.25);
            const primary = assessments.find((a) => a.tradeId === t.id && a.wasPrimary);
            const domain = domains.find((d) => d.id === primary?.edgeDomainId);
            const tone = pnlTone(t.netPnl);
            return (
              <tr key={t.id} className="border-t border-[var(--line)] hover:bg-[var(--bg-hover)]">
                <td className="px-2 py-1.5 mono whitespace-nowrap">{localTime(t.entryAt)}</td>
                <td className="px-2 py-1.5 mono whitespace-nowrap">{t.exitAt ? localTime(t.exitAt) : "open"}</td>
                <td className="px-2 py-1.5 num [color:var(--text-secondary)] whitespace-nowrap">
                  {duration(t.durationSeconds)}
                </td>
                <td className="px-2 py-1.5 mono">{instrument?.symbol ?? "—"}</td>
                <td className="px-2 py-1.5"><DirectionMark direction={t.direction} /></td>
                <td className="px-2 py-1.5 num">{t.maxSize ? num(t.maxSize) : "—"}</td>
                <td className="px-2 py-1.5 mono">{formatPrice(t.avgEntryPrice, tickSize)}</td>
                <td className="px-2 py-1.5 mono">{formatPrice(t.avgExitPrice, tickSize)}</td>
                <td className="px-2 py-1.5 num">{t.ticksCaptured === null ? "—" : signedNumber(t.ticksCaptured, 0)}</td>
                <td className="px-2 py-1.5 num">{t.rMultiple === null ? "—" : signedNumber(t.rMultiple, 2)}</td>
                <td className={cn(
                  "px-2 py-1.5 num font-[560] whitespace-nowrap",
                  tone === "pos" && "[color:var(--pos)]",
                  tone === "neg" && "[color:var(--neg)]",
                )}>
                  {signedMoney(t.netPnl)}
                </td>
                <td className="px-2 py-1.5">
                  {t.planned
                    ? <span className="[color:var(--text-tertiary)]">planned</span>
                    : <Pill tone="warn">improvised</Pill>}
                </td>
                <td className="px-2 py-1.5">
                  {domain ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden className="inline-block size-[6px] rounded-full"
                        style={{ background: `var(--dom-${domain.key})` }}
                      />
                      {domain.label}
                    </span>
                  ) : (
                    <span className="[color:var(--warn)]">not scored</span>
                  )}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <Link
                    href={`/trades/${t.id}`}
                    className="[color:var(--accent)] hover:underline underline-offset-2"
                  >
                    Open
                  </Link>
                  <button
                    type="button"
                    aria-label="Delete trade"
                    onClick={() => start(async () => {
                      await deleteTrade(t.id, date);
                      toast("Trade deleted.");
                      router.refresh();
                    })}
                    className="[color:var(--text-tertiary)] hover:[color:var(--neg)] px-1.5"
                  >×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
