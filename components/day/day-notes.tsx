"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, TextButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { addNote, deleteNote, reground } from "@/app/actions/day";
import { localTime } from "@/lib/time";
import { humanise } from "@/lib/format";
import type { DayBundle } from "@/lib/queries/day";

const KINDS = [
  { value: "observation", label: "Observation" },
  { value: "emotion", label: "Emotion" },
  { value: "market_event", label: "Market event" },
  { value: "rule_reminder", label: "Rule reminder" },
];

export function DayNotes({
  dayId, date, notes,
}: { dayId: string; date: string; notes: DayBundle["notes"] }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [body, setBody] = React.useState("");
  const [kind, setKind] = React.useState("observation");

  const submit = () => start(async () => {
    const res = await addNote(dayId, date, body, kind as "observation");
    if (!res.ok) { toast(res.error); return; }
    setBody("");
    router.refresh();
  });

  const regroundCount = notes.filter((n) => n.kind === "reground").length;

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="label">Notes through the day</h4>
        <TextButton
          onClick={() => start(async () => {
            await reground(dayId, date);
            toast("Regrounded. Timestamp recorded.");
            router.refresh();
          })}
          title="Records that you went back and reread the plan"
        >
          Reground{regroundCount > 0 ? ` (${regroundCount})` : ""}
        </TextButton>
      </div>

      <ul className="space-y-1 max-h-[240px] overflow-auto">
        {notes.length === 0 && (
          <li className="text-12 [color:var(--text-tertiary)] py-2">
            Nothing noted yet. Catch the observation while it is still true.
          </li>
        )}
        {notes.map((n) => (
          <li key={n.id} className="flex items-start gap-2.5 py-1 border-b border-[var(--line)] last:border-0">
            <time className="mono text-11 [color:var(--text-tertiary)] pt-0.5 w-11 shrink-0">
              {localTime(n.notedAt)}
            </time>
            {n.kind !== "observation" && (
              <Pill tone={n.kind === "reground" ? "accent" : "neutral"} className="mt-0.5 shrink-0">
                {humanise(n.kind)}
              </Pill>
            )}
            <span className="text-12 flex-1 min-w-0">{n.body}</span>
            <button
              type="button" aria-label="Remove note"
              onClick={() => start(async () => { await deleteNote(n.id, date); router.refresh(); })}
              className="[color:var(--text-tertiary)] hover:[color:var(--neg)] px-1 shrink-0"
            >×</button>
          </li>
        ))}
      </ul>

      <div className="flex items-end gap-2 mt-2.5">
        <div className="flex-1 min-w-0">
          <Input
            value={body} placeholder="What you are seeing right now"
            className="h-8 py-0"
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && body.trim()) submit(); }}
          />
        </div>
        <Select
          value={kind} className="h-8 py-0 w-[130px]"
          aria-label="Kind of note"
          onChange={(e) => setKind(e.target.value)}
        >
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
        <Button size="sm" onClick={submit} disabled={!body.trim()}>Add</Button>
      </div>
    </div>
  );
}
