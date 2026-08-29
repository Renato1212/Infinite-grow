"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { DomainDot } from "@/components/ui/pill";
import { setEdgeAssessment, setPrimaryDomain } from "@/app/actions/trades";
import type { Assessment } from "./types";
import type { EdgeDomain } from "@/lib/queries/reference";

const ALIGNMENTS = [
  { value: "supportive", label: "Support" },
  { value: "neutral", label: "Neutral" },
  { value: "conflicting", label: "Conflict" },
  { value: "not_applicable", label: "n/a" },
] as const;

/**
 * All five domains as one grid, pre-filled with "not applicable", so scoring a
 * trade takes about fifteen seconds. Every cell writes on click; there is no
 * save step.
 */
export function EdgeGrid({
  tradeId, date, domains, assessments,
}: {
  tradeId: string; date: string;
  domains: EdgeDomain[];
  assessments: Assessment[];
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
    <div className="min-w-0 max-w-[620px]">
      {/* Column headings are for the wide layout; on a phone each domain stacks
          and the controls label themselves through aria. */}
      <div className="hidden sm:grid grid-cols-[minmax(110px,1fr)_auto_auto_auto] gap-x-3 mb-1">
        <span className="label">Domain</span>
        <span className="label text-center">Alignment</span>
        <span className="label text-center">Weight</span>
        <span className="label text-center">Primary</span>
      </div>

      <div className="divide-y divide-[var(--line)] sm:divide-y-0">
        {domains.map((d) => {
          const row = rowFor(d.id);
          return (
            <div
              key={d.id}
              className="grid grid-cols-1 sm:grid-cols-[minmax(110px,1fr)_auto_auto_auto]
                         gap-x-3 gap-y-1.5 items-center py-1.5 sm:py-0.5"
            >
              <span
                className="flex items-center gap-1.5 text-12 min-w-0 border-l-2 pl-2 py-0.5"
                style={{ borderColor: `var(--dom-${d.key}, var(--line))` }}
              >
                <span className="truncate">{d.label}</span>
              </span>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:contents">
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

                <div className="text-center sm:w-full">
                  <button
                    type="button" role="radio" aria-checked={Boolean(row.wasPrimary)}
                    aria-label={`Make ${d.label} the primary domain`}
                    onClick={() => makePrimary(d.id)}
                    className={cn(
                      "size-5 rounded-full border-2 grid place-items-center transition-colors duration-[var(--d-fast)]",
                      row.wasPrimary
                        ? "border-[var(--accent)]"
                        : "border-[var(--line-strong)] hover:border-[var(--text-tertiary)]",
                    )}
                  >
                    {row.wasPrimary && <span className="size-2 rounded-full bg-[var(--accent)]" />}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
