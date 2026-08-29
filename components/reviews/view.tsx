"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Stat } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { AutosaveTextarea } from "@/components/ui/autosave";
import { TagInput } from "@/components/day/tag-input";
import { useToast } from "@/components/ui/toast";
import { upsertReview } from "@/app/actions/library";
import { Markdown } from "@/lib/markdown";
import { expectancy, num } from "@/lib/pnl";
import { signedMoney, percent, humanise } from "@/lib/format";
import { shortDayLabel } from "@/lib/time";
import { cn } from "@/lib/cn";

interface Review {
  id: string; type: string; periodStart: string; periodEnd: string;
  summary: string | null; themes: string[]; focusNextPeriod: string | null;
}

interface Day {
  day: string; net_pnl: string; trade_count: number; win_count: number;
  process_adherence_pct: string | null; focus_rating: number | null;
  primary_hypothesis_outcome: string | null;
}

export function ReviewsView({
  reviews, days, thisWeek,
}: { reviews: Review[]; days: Day[]; thisWeek: { start: string; end: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [form, setForm] = React.useState({
    type: "weekly", periodStart: thisWeek.start, periodEnd: thisWeek.end,
  });

  const inPeriod = (from: string, to: string) =>
    days.filter((d) => d.day >= from && d.day <= to);

  return (
    <div className="min-w-0 max-w-[900px]">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-24 font-[590] tracking-[-0.018em]">Reviews</h1>
          <p className="text-12 [color:var(--text-secondary)] mt-0.5">
            The weekly and monthly step back from the day-by-day.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Field label="Type" className="w-[110px]">
            <Select
              value={form.type} className="h-8 py-0"
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </Field>
          <Field label="From" className="w-[140px]">
            <Input
              type="date" value={form.periodStart} className="h-8 py-0 mono"
              onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
            />
          </Field>
          <Field label="To" className="w-[140px]">
            <Input
              type="date" value={form.periodEnd} className="h-8 py-0 mono"
              onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
            />
          </Field>
          <Button
            variant="primary"
            onClick={() => start(async () => {
              const res = await upsertReview(form);
              if (!res.ok) { toast(res.error); return; }
              router.refresh();
            })}
          >
            Start review
          </Button>
        </div>
      </header>

      {reviews.length === 0 ? (
        <Card>
          <EmptyState
            title="No reviews yet."
            body="A week of debriefed days is enough to see a pattern the individual days hide. Start one above."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => {
            const periodDays = inPeriod(r.periodStart, r.periodEnd);
            const stats = expectancy(periodDays.map((d) => ({ netPnl: num(d.net_pnl) })));
            const trades = periodDays.reduce((a, d) => a + d.trade_count, 0);
            const wins = periodDays.reduce((a, d) => a + d.win_count, 0);
            const adherence = periodDays
              .map((d) => (d.process_adherence_pct === null ? null : Number(d.process_adherence_pct)))
              .filter((v): v is number => v !== null);

            return (
              <Card key={r.id} className="p-4">
                <header className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <h2 className="text-15 font-[590]">
                    {humanise(r.type)} · {shortDayLabel(r.periodStart)} – {shortDayLabel(r.periodEnd)}
                  </h2>
                  <span className="text-11 [color:var(--text-tertiary)] num">
                    {periodDays.length} sessions
                  </span>
                </header>

                <div className="flex flex-wrap gap-x-7 gap-y-3 mb-4">
                  <Stat
                    label="Net" value={signedMoney(stats.netPnl)}
                    tone={stats.netPnl >= 0 ? "pos" : "neg"}
                  />
                  <Stat label="Trades" value={String(trades)} tone="muted" />
                  <Stat
                    label="Win rate" value={trades ? percent(wins / trades) : "—"} tone="muted"
                  />
                  <Stat
                    label="Green days"
                    value={periodDays.length ? percent(stats.wins / periodDays.length) : "—"}
                    tone="muted"
                  />
                  <Stat
                    label="Rule adherence"
                    value={adherence.length
                      ? `${Math.round(adherence.reduce((a, b) => a + b, 0) / adherence.length)}%`
                      : "—"}
                    tone="muted"
                  />
                </div>

                <div className="flex flex-wrap gap-1 mb-4">
                  {periodDays.map((d) => (
                    <Link
                      key={d.day}
                      href={`/day/${d.day}`}
                      title={`${d.day} · ${signedMoney(d.net_pnl)} · ${d.trade_count} trades`}
                      className={cn(
                        "px-1.5 py-1 rounded-[4px] text-11 mono tabular-nums",
                        Number(d.net_pnl) > 0 && "bg-[var(--pos-quiet)] [color:var(--pos)]",
                        Number(d.net_pnl) < 0 && "bg-[var(--neg-quiet)] [color:var(--neg)]",
                        Number(d.net_pnl) === 0 && "bg-[var(--bg-hover)] [color:var(--text-tertiary)]",
                      )}
                    >
                      {d.day.slice(8)}
                    </Link>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <AutosaveTextarea
                    label="Summary" initial={r.summary} rows={5}
                    draftKey={`review:${r.id}:summary`}
                    placeholder="What the week actually was, not what you hoped it would be."
                    save={async (v) => {
                      await upsertReview({ ...r, summary: v, themes: r.themes });
                      router.refresh();
                    }}
                  />
                  <div className="space-y-3">
                    <AutosaveTextarea
                      label="Focus for next period" initial={r.focusNextPeriod} rows={3}
                      draftKey={`review:${r.id}:focus`}
                      save={async (v) => {
                        await upsertReview({ ...r, focusNextPeriod: v, themes: r.themes });
                        router.refresh();
                      }}
                    />
                    <div>
                      <div className="label mb-1">Themes</div>
                      <TagInput
                        values={r.themes}
                        placeholder="Add theme"
                        label="Review themes"
                        onChange={(themes) => start(async () => {
                          await upsertReview({ ...r, themes });
                          router.refresh();
                        })}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
