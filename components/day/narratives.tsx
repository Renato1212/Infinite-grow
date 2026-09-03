"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AutosaveTextarea } from "@/components/ui/autosave";
import { Select } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { TagInput } from "./tag-input";
import { upsertNarrative } from "@/app/actions/day";
import type { DayBundle } from "@/lib/queries/day";

const SOURCES = [
  { key: "google_trends", label: "Google Trends", hint: "Attention, not news" },
  { key: "morning_bid_europe", label: "Morning Bid Europe", hint: "Cumulative since the close" },
  { key: "morning_bid_us", label: "Morning Bid US", hint: "Pre-US reassessment" },
  { key: "news_terminal", label: "News terminal", hint: "Isolated headlines" },
  { key: "options_data", label: "Options data", hint: "Positioning" },
  { key: "other", label: "Other", hint: "" },
] as const;

const SENTIMENT = [
  { value: "-2", label: "−2 strongly negative" },
  { value: "-1", label: "−1 negative" },
  { value: "0", label: "0 neutral" },
  { value: "1", label: "+1 positive" },
  { value: "2", label: "+2 strongly positive" },
];

export function Narratives({
  dayId, date, narratives,
}: { dayId: string; date: string; narratives: DayBundle["narratives"] }) {
  const router = useRouter();
  const bySource = new Map(narratives.map((n) => [n.source, n]));

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {SOURCES.map((s) => {
        const row = bySource.get(s.key);
        const save = async (patch: Record<string, unknown>) => {
          await upsertNarrative(dayId, date, { source: s.key, ...patch });
          router.refresh();
        };
        return (
          <Card key={s.key} className="p-3.5 min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h3 className="text-13 font-[590]">{s.label}</h3>
              {s.hint && <span className="text-11 [color:var(--text-tertiary)]">{s.hint}</span>}
            </div>

            <AutosaveTextarea
              initial={row?.rawContent ?? ""}
              rows={4}
              placeholder="Paste or summarise…"
              draftKey={`narrative:${date}:${s.key}`}
              save={(v) => save({ rawContent: v ?? "" })}
            />

            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div>
                <div className="label mb-1">Sentiment</div>
                <Select
                  aria-label="Sentiment"
                  value={row?.sentiment === null || row?.sentiment === undefined ? "" : String(row.sentiment)}
                  placeholder="—"
                  onChange={(e) => save({ sentiment: e.target.value })}
                >
                  {SENTIMENT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>
              <div className="min-w-0">
                <div className="label mb-1">Key themes</div>
                <TagInput
                  values={row?.keyThemes ?? []}
                  placeholder="Add theme" label="Key themes"
                  onChange={(v) => save({ keyThemes: v })}
                />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
