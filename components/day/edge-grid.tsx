"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { DomainDot } from "@/components/ui/pill";
import { setEdgeAssessment, setPrimaryDomain } from "@/app/actions/trades";
import type { Assessment } from "./types";
import type { EdgeDomain } from "@/lib/queries/reference";

const ALIGNMENTS = [
  { value: "supportive", label: "Support", short: "S" },
  { value: "neutral", label: "Neutral", short: "N" },
  { value: "conflicting", label: "Conflict", short: "C" },
  { value: "not_applicable", label: "n/a", short: "—" },
] as const;

/**
 * All five domains as one grid, pre-filled with "not applicable", so scoring a
 * trade takes about fifteen seconds. Every cell writes on click; there is no
 * save step.
 */
export function EdgeGrid({
  tradeId, date, domains, assessments, compact,
}: {
  tradeId: string; date: string;
  domains: EdgeDomain[];
  assessments: Assessment[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [, start] = React.useTransition();
  const [optimistic, setOptimistic] = React.useState<Record<string, Partial<Assessment>>>({});

  const rowFor = (domainId: string): Partial<Assessment> => ({
    alignment: "not_applicable", weight: 0, wasPrimary: false,
    ...assessments.find((a) => a.tradeId === tradeId && a.edgeDomainId === domainId),
    ...optimistic[domainId],
  });

  const write = (domainId: string, patch: Partial<Assessment>) => {
    setOptimistic((o) => ({ ...o, [domainId]: { ...o[domainId], ...patch } }));
    start(async () => {
      const row = rowFor(domainId);
      await setEdgeAssessment(tradeId, date, {
        edgeDomainId: domainId,
        alignment: patch.alignment ?? row.alignment,
        weight: patch.weight ?? row.weight ?? 0,
        note: row.note ?? null,
      });
      router.refresh();
    });
  };

  const makePrimary = (domainId: string) => {
    setOptimistic((o) => {
      const next: Record<string, Partial<Assessment>> = {};
      for (const d of domains) next[d.id] = { ...o[d.id], wasPrimary: d.id === domainId };
      return next;
    });
    start(async () => {
      await setPrimaryDomain(tradeId, date, domainId);
      router.refresh();
    });
  };

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-[minmax(120px,1fr)_auto_auto_auto] gap-x-3 gap-y-1 items-center">
        <span className="label">Domain</span>
        <span className="label text-center">Alignment</span>
        <span className="label text-center">Weight</span>
        <span className="label text-center">Primary</span>

        {domains.map((d) => {
          const row = rowFor(d.id);
          return (
            <React.Fragment key={d.id}>
              <span
                className="flex items-center gap-1.5 text-12 min-w-0 border-l-2 pl-2 py-1"
                style={{ borderColor: `var(--dom-${d.key}, var(--line))` }}
              >
                <span className="truncate">{compact ? d.label : d.label}</span>
              </span>

              <div role="radiogroup" aria-label={`${d.label} alignment`} className="flex gap-0.5">
                {ALIGNMENTS.map((a) => {
                  const active = row.alignment === a.value;
                  return (
                    <button
                      key={a.value}
                      type="button" role="radio" aria-checked={active}
                      title={a.label}
                      onClick={() => write(d.id, { alignment: a.value })}
                      className={cn(
                        "h-6 px-2 rounded-[var(--r-input)] text-11 border transition-colors",
                        "duration-[var(--d-fast)] [transition-timing-function:var(--ease)]",
                        active && a.value === "supportive" && "bg-[var(--pos-quiet)] text-[var(--pos)] border-transparent font-[560]",
                        active && a.value === "conflicting" && "bg-[var(--neg-quiet)] text-[var(--neg)] border-transparent font-[560]",
                        active && a.value === "neutral" && "bg-[var(--bg-active)] text-[var(--text)] border-transparent font-[560]",
                        active && a.value === "not_applicable" && "bg-[var(--bg-hover)] text-[var(--text-tertiary)] border-transparent",
                        !active && "border-[var(--line)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]",
                      )}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>

              <div role="radiogroup" aria-label={`${d.label} weight`} className="flex gap-0.5">
                {[0, 1, 2, 3].map((w) => (
                  <button
                    key={w}
                    type="button" role="radio" aria-checked={row.weight === w}
                    onClick={() => write(d.id, { weight: w })}
                    className={cn(
                      "size-6 rounded-[var(--r-input)] text-11 num border transition-colors duration-[var(--d-fast)]",
                      row.weight === w
                        ? "bg-[var(--bg-active)] text-[var(--text)] border-transparent font-[560]"
                        : "border-[var(--line)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]",
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>

              <div className="text-center">
                <button
                  type="button" role="radio" aria-checked={Boolean(row.wasPrimary)}
                  aria-label={`Make ${d.label} the primary domain`}
                  onClick={() => makePrimary(d.id)}
                  className={cn(
                    "size-5 rounded-full border-2 grid place-items-center transition-colors duration-[var(--d-fast)]",
                    row.wasPrimary ? "border-[var(--accent)]" : "border-[var(--line-strong)] hover:border-[var(--text-tertiary)]",
                  )}
                >
                  {row.wasPrimary && <span className="size-2 rounded-full bg-[var(--accent)]" />}
                </button>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
