"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Divider, EmptyState } from "@/components/ui/surface";
import { AutosaveTextarea } from "@/components/ui/autosave";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, NumberInput, Select } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { addEvent, deleteEvent, updateEvent, upsertEnvironment } from "@/app/actions/day";
import { localTime, countdownLabel } from "@/lib/time";
import type { DayBundle } from "@/lib/queries/day";

const FLAGS = [
  { key: "flagOpex", label: "OPEX" },
  { key: "flagMonthEnd", label: "Month end" },
  { key: "flagQuarterEnd", label: "Quarter end" },
  { key: "flagRoll", label: "Roll" },
  { key: "flagAuction", label: "Auction" },
  { key: "flagHoliday", label: "Holiday" },
] as const;

export function Environment({
  dayId, date, environment, events,
}: {
  dayId: string; date: string;
  environment: DayBundle["environment"];
  events: DayBundle["events"];
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [draft, setDraft] = React.useState({ name: "", time: "", importance: "2" });

  const save = async (patch: Record<string, unknown>) => {
    await upsertEnvironment(dayId, date, patch);
    router.refresh();
  };

  const addRelease = () => start(async () => {
    const res = await addEvent(dayId, date, {
      name: draft.name, time: draft.time, importance: draft.importance,
    });
    if (!res.ok) { toast(res.error); return; }
    setDraft({ name: "", time: "", importance: "2" });
    router.refresh();
  });

  return (
    <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
      <Card className="p-4 min-w-0">
        <h4 className="label mb-2">Scheduled releases</h4>

        {events.length === 0 ? (
          <EmptyState
            title="Nothing on the calendar yet."
            body="Add the releases that matter. Anything at importance 2 or 3 shows up on the brief with a countdown, and Study can slice trades by their distance from it."
          />
        ) : (
          <ul className="space-y-1">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-2.5 py-1 border-b border-[var(--line)] last:border-0">
                <time className="mono text-12 w-11 shrink-0">{localTime(e.scheduledAt)}</time>
                <span className="text-12 flex-1 min-w-0 truncate">{e.name}</span>
                <span
                  aria-label={`Importance ${e.importance} of 3`}
                  className="text-11 text-[var(--text-tertiary)] shrink-0"
                >
                  {"•".repeat(e.importance)}
                </span>
                <span className="text-11 text-[var(--text-tertiary)] shrink-0 num w-[70px] text-right">
                  {countdownLabel(e.scheduledAt)}
                </span>
                <button
                  type="button" aria-label={`Remove ${e.name}`}
                  onClick={() => start(async () => { await deleteEvent(e.id, date); router.refresh(); })}
                  className="text-[var(--text-tertiary)] hover:text-[var(--neg)] px-1 shrink-0"
                >×</button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2 mt-3">
          <Field label="Release" className="flex-1 min-w-[150px]">
            <Input
              value={draft.name} className="h-8 py-0" placeholder="US CPI"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && draft.name && draft.time) addRelease(); }}
            />
          </Field>
          <Field label="Release time" className="w-24">
            <Input
              type="time" value={draft.time} className="h-8 py-0 mono"
              onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            />
          </Field>
          <Field label="Importance" className="w-24">
            <Select
              value={draft.importance} className="h-8 py-0"
              onChange={(e) => setDraft({ ...draft, importance: e.target.value })}
            >
              <option value="1">1 low</option><option value="2">2</option><option value="3">3 high</option>
            </Select>
          </Field>
          <Button size="sm" onClick={addRelease} disabled={!draft.name || !draft.time}>Add</Button>
        </div>

        <Divider className="my-4" />

        <h4 className="label mb-2">Flow calendar</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FLAGS.map((f) => (
            <Checkbox
              key={f.key}
              label={f.label}
              checked={Boolean(environment?.[f.key])}
              onChange={(e) => start(async () => { await save({ [f.key]: e.target.checked }); })}
            />
          ))}
        </div>
        <AutosaveTextarea
          className="mt-3"
          label="Flow note" initial={environment?.flowNote ?? ""} rows={2}
          placeholder="Index rebalance, auction size, anything that moves size around."
          save={(v) => save({ flowNote: v })}
        />
      </Card>

      <Card className="p-4 min-w-0 space-y-3.5">
        <AutosaveTextarea
          label="Dynamic calendar" initial={environment?.dynamicCalendarNote ?? ""} rows={2}
          draftKey={`env:${date}:calendar`}
          placeholder="G7, Davos, central bank speakers."
          save={(v) => save({ dynamicCalendarNote: v })}
        />
        <AutosaveTextarea
          label="Options" initial={environment?.optionsNote ?? ""} rows={2}
          draftKey={`env:${date}:options`}
          placeholder="Gamma, walls, expiry pinning. Mark the actual levels on the instrument as options-sourced."
          save={(v) => save({ optionsNote: v })}
        />
        <AutosaveTextarea
          label="Expected environment" initial={environment?.expectedEnvironment ?? ""} rows={6}
          draftKey={`env:${date}:expected`}
          placeholder="Your synthesis: context, themes, events, prior day, open, volume, volatility, ladder behaviour. The paragraph you would say out loud."
          save={(v) => save({ expectedEnvironment: v })}
        />
      </Card>
    </div>
  );
}
