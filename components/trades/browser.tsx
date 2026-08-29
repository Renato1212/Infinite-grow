"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilterBar } from "@/components/study/filter-bar";
import { Card, EmptyState, Stat } from "@/components/ui/surface";
import { Pill, DirectionMark } from "@/components/ui/pill";
import { cn } from "@/lib/cn";
import { localTime } from "@/lib/time";
import { signedMoney, signedNumber, duration, percent, humanise } from "@/lib/format";
import { summarise, type Fact } from "@/lib/study/aggregate";
import { serialiseFilter, type StudyFilter } from "@/lib/study/filters";

type SortKey = "entry_at" | "net_pnl" | "r_multiple" | "duration_seconds" | "instrument_symbol";

interface Props {
  facts: (Fact & { trade_id: string; entry_at: string; exit_at: string | null; entry_local_hhmm: string | null })[];
  filter: StudyFilter;
  instruments: { id: string; symbol: string }[];
  domains: { key: string; label: string }[];
  tags: { id: string; label: string; category: string }[];
  levelTypes: { key: string; label: string }[];
  savedViews: { id: string; name: string; query: Record<string, unknown> }[];
  minSampleSize: number;
}

const COLUMNS: { key: SortKey | null; label: string; align?: "right" }[] = [
  { key: "entry_at", label: "Date" },
  { key: null, label: "In" },
  { key: "instrument_symbol", label: "Instr." },
  { key: null, label: "Side" },
  { key: "duration_seconds", label: "Held", align: "right" },
  { key: null, label: "Ticks", align: "right" },
  { key: "r_multiple", label: "R", align: "right" },
  { key: "net_pnl", label: "Net", align: "right" },
  { key: null, label: "Plan" },
  { key: null, label: "Primary domain" },
  { key: null, label: "Hypothesis" },
  { key: null, label: "Tags" },
];

/** j/k move the selection, Enter opens it — the list is keyboard-first. */
export function TradesBrowser(props: Props) {
  const router = useRouter();
  const [sort, setSort] = React.useState<SortKey>("entry_at");
  const [descending, setDescending] = React.useState(true);
  const [cursor, setCursor] = React.useState(0);

  const rows = React.useMemo(() => {
    const sorted = [...props.facts].sort((a, b) => {
      const av = a[sort as keyof typeof a];
      const bv = b[sort as keyof typeof b];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return descending ? -cmp : cmp;
    });
    return sorted;
  }, [props.facts, sort, descending]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j") { e.preventDefault(); setCursor((c) => Math.min(rows.length - 1, c + 1)); }
      if (e.key === "k") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      if (e.key === "Enter" && rows[cursor]) {
        e.preventDefault();
        router.push(`/trades/${rows[cursor].trade_id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor, router]);

  React.useEffect(() => {
    document.getElementById(`row-${cursor}`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const stats = summarise(props.facts);

  const toggleSort = (key: SortKey) => {
    if (key === sort) setDescending((d) => !d);
    else { setSort(key); setDescending(true); }
  };

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="text-24 font-[590] tracking-[-0.018em]">Trades</h1>
          <p className="text-12 [color:var(--text-secondary)] mt-0.5">
            j and k move, Enter opens. The filter is in the URL.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-7 gap-y-2">
          <Stat label="Net" value={signedMoney(stats.netPnl)} tone={stats.netPnl >= 0 ? "pos" : "neg"} />
          <Stat label="Trades" value={String(stats.count)} tone="muted" />
          <Stat label="Win rate" value={stats.winRate === null ? "—" : percent(stats.winRate)} tone="muted" />
          <Stat
            label="Expectancy"
            value={stats.expectancy === null ? "—" : signedMoney(stats.expectancy)}
            tone="muted"
          />
        </div>
      </header>

      <FilterBar
        filter={props.filter}
        instruments={props.instruments}
        domains={props.domains}
        tags={props.tags}
        levelTypes={props.levelTypes}
        savedViews={props.savedViews}
        resultCount={props.facts.length}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No trades match."
            body="Clear the filter to see everything, or log a trade from today's cockpit."
          />
        </Card>
      ) : (
        <Card className="p-1 overflow-x-auto">
          <table className="w-full text-12 border-collapse min-w-[980px]">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.label}
                    className={cn(
                      "label font-[560] px-2 py-2 whitespace-nowrap",
                      c.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {c.key ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key!)}
                        className="hover:[color:var(--text)] inline-flex items-center gap-1"
                      >
                        {c.label}
                        {sort === c.key && <span aria-hidden>{descending ? "↓" : "↑"}</span>}
                      </button>
                    ) : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr
                  key={t.trade_id}
                  id={`row-${i}`}
                  onMouseEnter={() => setCursor(i)}
                  className={cn(
                    "border-t border-[var(--line)] border-l-2",
                    i === cursor
                      ? "bg-[var(--bg-active)] border-l-[var(--accent)]"
                      : "border-l-transparent hover:bg-[var(--bg-hover)]",
                  )}
                >
                  <td className="px-2 py-1.5 mono whitespace-nowrap">
                    <Link href={`/day/${t.day}`} className="hover:underline underline-offset-2">
                      {t.day}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 mono">{t.entry_local_hhmm ?? localTime(t.entry_at)}</td>
                  <td className="px-2 py-1.5 mono">
                    <Link href={`/trades/${t.trade_id}`} className="hover:underline underline-offset-2">
                      {t.instrument_symbol}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">
                    <DirectionMark direction={t.direction as "long" | "short"} />
                  </td>
                  <td className="px-2 py-1.5 text-right num [color:var(--text-secondary)]">
                    {duration(t.duration_seconds)}
                  </td>
                  <td className="px-2 py-1.5 text-right num">
                    {t.ticks_captured === null ? "—" : signedNumber(Number(t.ticks_captured), 0)}
                  </td>
                  <td className="px-2 py-1.5 text-right num">
                    {t.r_multiple === null ? "—" : signedNumber(Number(t.r_multiple), 2)}
                  </td>
                  <td className={cn(
                    "px-2 py-1.5 text-right num font-[560]",
                    Number(t.net_pnl) > 0 && "[color:var(--pos)]",
                    Number(t.net_pnl) < 0 && "[color:var(--neg)]",
                  )}>
                    {signedMoney(t.net_pnl)}
                  </td>
                  <td className="px-2 py-1.5">
                    {t.planned
                      ? <span className="[color:var(--text-tertiary)]">planned</span>
                      : <Pill tone="warn">improvised</Pill>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {t.primary_domain_key ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden className="inline-block size-[6px] rounded-full"
                          style={{ background: `var(--dom-${t.primary_domain_key})` }}
                        />
                        {t.primary_domain_label}
                        {t.primary_domain_alignment === "conflicting" && (
                          <Pill tone="neg">against</Pill>
                        )}
                      </span>
                    ) : <span className="[color:var(--warn)]">not scored</span>}
                  </td>
                  <td className="px-2 py-1.5 [color:var(--text-secondary)]">
                    {t.hypothesis_outcome ? humanise(t.hypothesis_outcome) : "—"}
                  </td>
                  <td className="px-2 py-1.5 max-w-[180px] truncate [color:var(--text-tertiary)]">
                    {(t.tag_labels ?? []).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
