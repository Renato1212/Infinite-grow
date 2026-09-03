"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, TextButton } from "@/components/ui/button";
import { Field, NumberInput, Select, Input } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import { addLevel, deleteLevel, setLevelInteraction, updateLevel } from "@/app/actions/day";
import { formatPrice, num } from "@/lib/pnl";
import { humanise } from "@/lib/format";
import type { LevelType } from "@/lib/queries/reference";
import type { DayBundle } from "@/lib/queries/day";

type Level = DayBundle["levels"][number];
type Interaction = DayBundle["interactions"][number];

const REACTIONS = [
  { value: "respected", label: "Respected" },
  { value: "broke", label: "Broke" },
  { value: "broke_and_retested", label: "Broke and retested" },
  { value: "no_touch", label: "Never touched" },
];

export function LevelsTable({
  prepId, date, levels, interactions, levelTypes, tickSize, readOnly,
}: {
  prepId: string; date: string; levels: Level[]; interactions: Interaction[];
  levelTypes: LevelType[]; tickSize: number; readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const byLevel = new Map(interactions.map((i) => [i.prepLevelId, i]));
  const typeById = new Map(levelTypes.map((t) => [t.id, t]));

  const [draft, setDraft] = React.useState({ levelTypeId: "", price: "", note: "", strength: "2" });

  const add = () => start(async () => {
    const res = await addLevel(prepId, date, {
      levelTypeId: draft.levelTypeId, price: draft.price,
      strength: draft.strength, note: draft.note, source: "chart",
    });
    if (!res.ok) { toast(res.error); return; }
    setDraft({ levelTypeId: draft.levelTypeId, price: "", note: "", strength: "2" });
    router.refresh();
  });

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-12 border-collapse min-w-[560px]">
          <thead>
            <tr className="text-left">
              {["Type", "Price", "Str", "Note", "What price did", "Ticks"].map((h) => (
                <th key={h} className="label font-[560] pb-1.5 pr-3 whitespace-nowrap">{h}</th>
              ))}
              {!readOnly && <th className="w-6" />}
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => {
              const interaction = byLevel.get(l.id);
              const type = typeById.get(l.levelTypeId);
              return (
                <tr key={l.id} className="border-t border-[var(--line)] align-middle">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{type?.label ?? "—"}</td>
                  <td className="py-1.5 pr-3 mono whitespace-nowrap">
                    {formatPrice(l.price, tickSize)}
                    {l.secondaryPrice && ` – ${formatPrice(l.secondaryPrice, tickSize)}`}
                  </td>
                  <td className="py-1.5 pr-3 num [color:var(--text-tertiary)]">
                    {"•".repeat(l.strength)}
                  </td>
                  <td className="py-1.5 pr-3 [color:var(--text-secondary)] max-w-[220px] truncate">
                    {l.note ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    {readOnly ? (
                      interaction ? <Pill>{humanise(interaction.reaction)}</Pill> : <span className="[color:var(--text-tertiary)]">—</span>
                    ) : (
                      <Select
                        value={interaction?.reaction ?? ""}
                        aria-label={`What price did at ${type?.label ?? "this level"} ${formatPrice(l.price, tickSize)}`}
                        placeholder="—"
                        className="h-7 py-0 text-12 min-w-[150px]"
                        onChange={(e) => start(async () => {
                          if (!e.target.value) return;
                          await setLevelInteraction(date, {
                            prepLevelId: l.id, reaction: e.target.value,
                            reactionTicks: interaction?.reactionTicks ?? null,
                          });
                          router.refresh();
                        })}
                      >
                        {REACTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </Select>
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    {readOnly ? (
                      <span className="num">{interaction?.reactionTicks ?? "—"}</span>
                    ) : (
                      <NumberInput
                        defaultValue={interaction?.reactionTicks ?? ""}
                        aria-label={`Reaction in ticks at ${type?.label ?? "this level"} ${formatPrice(l.price, tickSize)}`}
                        className="h-7 py-0 w-16 text-12"
                        disabled={!interaction}
                        onBlur={(e) => start(async () => {
                          if (!interaction) return;
                          await setLevelInteraction(date, {
                            prepLevelId: l.id, reaction: interaction.reaction,
                            reactionTicks: e.target.value,
                          });
                          router.refresh();
                        })}
                      />
                    )}
                  </td>
                  {!readOnly && (
                    <td className="py-1.5">
                      <button
                        type="button"
                        aria-label={`Remove ${type?.label ?? "level"} at ${formatPrice(l.price, tickSize)}`}
                        onClick={() => start(async () => {
                          const snapshot = { levelTypeId: l.levelTypeId, price: l.price, note: l.note, strength: String(l.strength), source: l.source };
                          await deleteLevel(l.id, date);
                          router.refresh();
                          toast("Level removed.", () => start(async () => {
                            await addLevel(prepId, date, snapshot);
                            router.refresh();
                          }));
                        })}
                        className="[color:var(--text-tertiary)] hover:[color:var(--neg)] px-1"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-end gap-2 mt-2.5">
          <Field label="Level type" className="min-w-[140px]">
            <Select
              value={draft.levelTypeId} placeholder="Choose"
              className="h-8 py-0"
              onChange={(e) => setDraft({ ...draft, levelTypeId: e.target.value })}
            >
              {levelTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Level price" className="w-32">
            <NumberInput
              value={draft.price} className="h-8 py-0"
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && draft.levelTypeId && draft.price) add(); }}
            />
          </Field>
          <Field label="Strength" className="w-20">
            <Select
              value={draft.strength} className="h-8 py-0"
              onChange={(e) => setDraft({ ...draft, strength: e.target.value })}
            >
              <option value="1">1</option><option value="2">2</option><option value="3">3</option>
            </Select>
          </Field>
          <Field label="Level note" className="flex-1 min-w-[140px]">
            <Input
              value={draft.note} className="h-8 py-0"
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && draft.levelTypeId && draft.price) add(); }}
            />
          </Field>
          <Button size="sm" onClick={add} disabled={!draft.levelTypeId || !num(draft.price, NaN)}>
            Add level
          </Button>
        </div>
      )}
    </div>
  );
}
