"use client";
import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Button, TextButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { saveStudyView, deleteStudyView } from "@/app/actions/library";
import { activeCount, serialiseFilter, type StudyFilter } from "@/lib/study/filters";
import { humanise } from "@/lib/format";
import { cn } from "@/lib/cn";

interface Option { value: string; label: string }

export interface FilterBarProps {
  filter: StudyFilter;
  instruments: { id: string; symbol: string }[];
  domains: { key: string; label: string }[];
  tags: { id: string; label: string; category: string }[];
  levelTypes: { key: string; label: string }[];
  savedViews: { id: string; name: string; query: Record<string, unknown> }[];
  resultCount: number;
}

const DAY_TYPES = ["trend_up", "trend_down", "double_distribution", "normal", "normal_variation", "neutral", "non_trend"];
const OPEN_TYPES = ["open_drive", "open_test_drive", "open_rejection_reverse", "open_auction"];
const SESSIONS = ["asia", "europe_pre", "europe_rth", "us_pre", "us_rth", "us_afternoon", "settlement"];
const OUTCOMES = ["played_out", "partial", "invalidated", "never_triggered"];
const ALIGNMENTS = ["supportive", "neutral", "conflicting", "not_applicable"];
const DURATIONS = ["<1m", "1-5m", "5-15m", "15-60m", ">60m"];
const R_BUCKETS = ["<=-2R", "-2R..-1R", "-1R..0", "0..1R", "1R..2R", "2R..3R", ">=3R"];
const FLOW_FLAGS = ["opex", "month_end", "quarter_end", "roll", "auction", "holiday"];
const WEEKDAYS = [
  { value: "1", label: "Mon" }, { value: "2", label: "Tue" }, { value: "3", label: "Wed" },
  { value: "4", label: "Thu" }, { value: "5", label: "Fri" },
];

const asOptions = (values: string[]): Option[] =>
  values.map((v) => ({ value: v, label: humanise(v) }));

/**
 * One bar, every dimension, URL-backed. The URL *is* the study — copy it and
 * the analysis reproduces exactly.
 */
export function FilterBar(props: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [viewName, setViewName] = React.useState("");

  const { filter } = props;
  const count = activeCount(filter);

  const apply = React.useCallback((next: StudyFilter) => {
    const params = serialiseFilter(next);
    router.push(`${pathname.startsWith("/study/") ? "/study" : pathname}?${params.toString()}`);
  }, [router, pathname]);

  const patch = (values: Partial<StudyFilter>) => apply({ ...filter, ...values });

  const toggleIn = (key: keyof StudyFilter, value: string) => {
    const current = (filter[key] as string[] | undefined) ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    patch({ [key]: next.length ? next : undefined } as Partial<StudyFilter>);
  };

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <DateRange filter={filter} onChange={patch} />

        <MultiSelect
          label="Instrument"
          options={props.instruments.map((i) => ({ value: i.id, label: i.symbol }))}
          selected={filter.instrumentIds ?? []}
          onToggle={(v) => toggleIn("instrumentIds", v)}
        />
        <MultiSelect
          label="Weekday" options={WEEKDAYS}
          selected={(filter.daysOfWeek ?? []).map(String)}
          onToggle={(v) => {
            const current = filter.daysOfWeek ?? [];
            const n = Number(v);
            const next = current.includes(n) ? current.filter((x) => x !== n) : [...current, n];
            patch({ daysOfWeek: next.length ? next : undefined });
          }}
        />
        <MultiSelect
          label="Session" options={asOptions(SESSIONS)}
          selected={filter.sessions ?? []} onToggle={(v) => toggleIn("sessions", v)}
        />
        <MultiSelect
          label="Day type" options={asOptions(DAY_TYPES)}
          selected={filter.dayTypes ?? []} onToggle={(v) => toggleIn("dayTypes", v)}
        />
        <MultiSelect
          label="Open type" options={asOptions(OPEN_TYPES)}
          selected={filter.openTypes ?? []} onToggle={(v) => toggleIn("openTypes", v)}
        />
        <MultiSelect
          label="Volume" options={asOptions(["low", "average", "high"])}
          selected={filter.volumeRegimes ?? []} onToggle={(v) => toggleIn("volumeRegimes", v)}
        />
        <MultiSelect
          label="Volatility" options={asOptions(["low", "average", "high", "extreme"])}
          selected={filter.volatilityRegimes ?? []} onToggle={(v) => toggleIn("volatilityRegimes", v)}
        />
        <MultiSelect
          label="Primary domain"
          options={props.domains.map((d) => ({ value: d.key, label: d.label }))}
          selected={filter.primaryDomains ?? []} onToggle={(v) => toggleIn("primaryDomains", v)}
        />
        <MultiSelect
          label="Alignment" options={asOptions(ALIGNMENTS)}
          selected={filter.primaryAlignments ?? []} onToggle={(v) => toggleIn("primaryAlignments", v)}
        />
        <MultiSelect
          label="Hypothesis" options={asOptions(OUTCOMES)}
          selected={filter.hypothesisOutcomes ?? []} onToggle={(v) => toggleIn("hypothesisOutcomes", v)}
        />
        <MultiSelect
          label="Duration" options={DURATIONS.map((v) => ({ value: v, label: v }))}
          selected={filter.durationBuckets ?? []} onToggle={(v) => toggleIn("durationBuckets", v)}
        />
        <MultiSelect
          label="R" options={R_BUCKETS.map((v) => ({ value: v, label: v }))}
          selected={filter.rBuckets ?? []} onToggle={(v) => toggleIn("rBuckets", v)}
        />
        <MultiSelect
          label="Flow" options={asOptions(FLOW_FLAGS)}
          selected={filter.flowFlags ?? []} onToggle={(v) => toggleIn("flowFlags", v)}
        />
        <MultiSelect
          label="Level touched"
          options={props.levelTypes.map((t) => ({ value: t.key, label: t.label }))}
          selected={filter.levelTypes ?? []} onToggle={(v) => toggleIn("levelTypes", v)}
        />
        <MultiSelect
          label="Tags — any"
          options={props.tags.map((t) => ({ value: t.label, label: `${t.label} · ${t.category}` }))}
          selected={filter.tagsAny ?? []} onToggle={(v) => toggleIn("tagsAny", v)}
        />
        <MultiSelect
          label="Tags — none"
          options={props.tags.map((t) => ({ value: t.label, label: t.label }))}
          selected={filter.tagsNone ?? []} onToggle={(v) => toggleIn("tagsNone", v)}
        />

        <Segmented
          label="Plan"
          value={filter.planned ?? ""}
          options={[
            { value: "planned", label: "Planned" },
            { value: "unplanned", label: "Improvised" },
          ]}
          onChange={(v) => patch({ planned: (v || undefined) as StudyFilter["planned"] })}
        />
        <Segmented
          label="Direction"
          value={(filter.directions ?? [])[0] ?? ""}
          options={[{ value: "long", label: "Long" }, { value: "short", label: "Short" }]}
          onChange={(v) => patch({ directions: v ? [v] : undefined })}
        />
        <Segmented
          label="Conflicting domain"
          value={filter.conflicting ?? ""}
          options={[{ value: "any", label: "Present" }, { value: "none", label: "Absent" }]}
          onChange={(v) => patch({ conflicting: (v || undefined) as StudyFilter["conflicting"] })}
        />

        <NumberFilter
          label="Conviction ≥" value={filter.convictionMin}
          onChange={(v) => patch({ convictionMin: v })}
        />
        <NumberFilter
          label="Execution ≥" value={filter.executionQualityMin}
          onChange={(v) => patch({ executionQualityMin: v })}
        />
        <NumberFilter
          label="MAE ≤" value={filter.maeMax} onChange={(v) => patch({ maeMax: v })}
        />
        <NumberFilter
          label="MFE ≥" value={filter.mfeMin} onChange={(v) => patch({ mfeMin: v })}
        />
        <NumberFilter
          label="Within mins of event" value={filter.eventWithinMinutes}
          onChange={(v) => patch({ eventWithinMinutes: v })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-2.5">
        <span className="text-12 [color:var(--text-secondary)] num">
          {props.resultCount} trades match
          {count > 0 && ` · ${count} filter${count === 1 ? "" : "s"}`}
        </span>

        {count > 1 && (
          <label className="flex items-center gap-1.5 text-12 cursor-pointer">
            <input
              type="checkbox" checked={Boolean(filter.any)}
              onChange={(e) => patch({ any: e.target.checked || undefined })}
              className="size-[14px] rounded-[3px] accent-[var(--accent)]"
            />
            Match any instead of all
          </label>
        )}

        {count > 0 && <TextButton onClick={() => apply({})}>Clear</TextButton>}
        <TextButton onClick={() => setSaveOpen(true)}>Save as a view</TextButton>

        {props.savedViews.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="label">Saved</span>
            {props.savedViews.map((v) => (
              <span key={v.id} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => apply(v.query as StudyFilter)}
                  className="text-12 px-2 h-6 rounded-l-[var(--r-pill)] bg-[var(--bg-hover)]
                             hover:bg-[var(--bg-active)]"
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete view ${v.name}`}
                  onClick={() => start(async () => {
                    await deleteStudyView(v.id);
                    toast(`Deleted "${v.name}".`);
                    router.refresh();
                  })}
                  className="text-11 px-1.5 h-6 rounded-r-[var(--r-pill)] bg-[var(--bg-hover)]
                             [color:var(--text-tertiary)] hover:[color:var(--neg)]"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={saveOpen} onOpenChange={setSaveOpen}
        title="Save this view"
        description="The filter is stored with the name. Opening it restores exactly this slice."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button
              variant="primary" disabled={!viewName.trim()}
              onClick={() => start(async () => {
                const res = await saveStudyView(viewName, filter as Record<string, unknown>);
                if (!res.ok) { toast(res.error); return; }
                toast(`Saved "${viewName}".`);
                setViewName("");
                setSaveOpen(false);
                router.refresh();
              })}
            >
              Save view
            </Button>
          </>
        }
      >
        <Input
          autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)}
          placeholder="Conflicting central banks, first 30 minutes"
        />
      </Sheet>
    </div>
  );
}

function DateRange({
  filter, onChange,
}: { filter: StudyFilter; onChange: (v: Partial<StudyFilter>) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Input
        type="date" aria-label="From" value={filter.from ?? ""}
        onChange={(e) => onChange({ from: e.target.value || undefined })}
        className="h-7 py-0 w-[132px] text-12 mono"
      />
      <span aria-hidden className="[color:var(--text-tertiary)]">–</span>
      <Input
        type="date" aria-label="To" value={filter.to ?? ""}
        onChange={(e) => onChange({ to: e.target.value || undefined })}
        className="h-7 py-0 w-[132px] text-12 mono"
      />
    </div>
  );
}

function MultiSelect({
  label, options, selected, onToggle,
}: { label: string; options: Option[]; selected: string[]; onToggle: (value: string) => void }) {
  const [query, setQuery] = React.useState("");
  const shown = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "h-7 px-2.5 rounded-[var(--r-pill)] text-12 border transition-colors duration-[var(--d-fast)]",
            selected.length
              ? "bg-[var(--accent-quiet)] [color:var(--accent)] border-transparent font-[560]"
              : "border-[var(--line-strong)] [color:var(--text-secondary)] hover:bg-[var(--bg-hover)]",
          )}
        >
          {label}
          {selected.length > 0 && <span className="num ml-1">{selected.length}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={4} align="start"
          className="z-50 w-[240px] bg-[var(--bg-raised)] border border-[var(--line-strong)]
                     rounded-[var(--r-std)] elevated p-1.5"
        >
          {options.length > 8 && (
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter"
              className="w-full h-7 px-2 mb-1 text-12 bg-transparent border-b border-[var(--line)]
                         focus:outline-none placeholder:[color:var(--text-tertiary)]"
            />
          )}
          <ul className="max-h-[240px] overflow-auto">
            {shown.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => onToggle(o.value)}
                  aria-pressed={selected.includes(o.value)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 h-7 rounded-[var(--r-input)] text-12 text-left",
                    selected.includes(o.value)
                      ? "bg-[var(--accent-quiet)] [color:var(--accent)]"
                      : "hover:bg-[var(--bg-hover)]",
                  )}
                >
                  <span className="w-3">{selected.includes(o.value) ? "✓" : ""}</span>
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Segmented({
  label, value, options, onChange,
}: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? "" : o.value)}
          className={cn(
            "h-7 px-2.5 rounded-[var(--r-pill)] text-12 border transition-colors duration-[var(--d-fast)]",
            value === o.value
              ? "bg-[var(--accent-quiet)] [color:var(--accent)] border-transparent font-[560]"
              : "border-[var(--line-strong)] [color:var(--text-secondary)] hover:bg-[var(--bg-hover)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumberFilter({
  label, value, onChange,
}: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-[var(--r-pill)] text-12 border",
        value !== undefined
          ? "bg-[var(--accent-quiet)] [color:var(--accent)] border-transparent"
          : "border-[var(--line-strong)] [color:var(--text-secondary)]",
      )}
    >
      {label}
      <input
        type="number" value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="w-11 bg-transparent text-12 num text-center focus:outline-none"
      />
    </label>
  );
}
