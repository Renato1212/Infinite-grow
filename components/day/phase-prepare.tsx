"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PhaseShell } from "./cockpit";
import { Explainer } from "@/components/explainer";
import { Narratives } from "./narratives";
import { LevelsTable } from "./levels-table";
import { Environment } from "./environment";
import { Button, TextButton } from "@/components/ui/button";
import { Card, EmptyState, Divider } from "@/components/ui/surface";
import { AutosaveTextarea, AutosaveSelect, AutosaveInput } from "@/components/ui/autosave";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ConfirmDelete } from "@/components/ui/sheet";
import { TagInput } from "./tag-input";
import {
  addInstrumentPrep, carryLevelsForward, deleteInstrumentPrep, updateInstrumentPrep,
} from "@/app/actions/day";
import { num } from "@/lib/pnl";
import { humanise } from "@/lib/format";
import type { Phase } from "@/lib/completion";
import type { CockpitProps } from "./types";

const DAY_TYPES = [
  "trend_up", "trend_down", "double_distribution", "normal",
  "normal_variation", "neutral", "non_trend",
].map((v) => ({ value: v, label: humanise(v) }));

const BIASES = [
  { value: "short_bias", label: "Short bias" },
  { value: "neutral", label: "Neutral" },
  { value: "long_bias", label: "Long bias" },
];

const SLOPES = [
  { value: "up", label: "Up" }, { value: "flat", label: "Flat" }, { value: "down", label: "Down" },
];

export function PhasePrepare(props: CockpitProps & { phase: Phase }) {
  const { bundle, date, instruments, levelTypes, phase, explainers } = props;
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [adding, setAdding] = React.useState("");

  const used = new Set(bundle.preps.map((p) => p.instrumentId));
  const available = instruments.filter((i) => !used.has(i.id));

  return (
    <PhaseShell
      id="prepare" index={1} title="Prepare"
      description="Narratives, the chart routine, marked levels, and the environment the day sits in."
      ratio={phase.ratio} checks={phase.checks}
    >
      <div className="space-y-8">
        <div>
          <h3 className="text-13 font-[590] mb-2">Narratives</h3>
          <Explainer id="prep-narratives" source={explainers.narratives} />
          <Narratives dayId={bundle.day.id} date={date} narratives={bundle.narratives} />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="text-13 font-[590]">Instruments</h3>
            {available.length > 0 && (
              <div className="flex items-center gap-2">
                <Select
                  value={adding} placeholder="Add an instrument" className="h-8 py-0 w-[180px]"
                  onChange={(e) => {
                    const id = e.target.value;
                    setAdding("");
                    if (!id) return;
                    start(async () => {
                      await addInstrumentPrep(bundle.day.id, date, id);
                      router.refresh();
                    });
                  }}
                >
                  {available.map((i) => (
                    <option key={i.id} value={i.id}>{i.symbol} — {i.name}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <Explainer id="instrument-prep" source={explainers.instrumentPrep} />

          {bundle.preps.length === 0 ? (
            <Card>
              <EmptyState
                title="No instruments analysed yet."
                body="Start with ES. Add it, write what the structure is doing, then mark the levels you will trade against."
                action={
                  <Button
                    variant="primary"
                    onClick={() => {
                      const es = instruments.find((i) => i.symbol === "ES") ?? instruments[0];
                      if (!es) return;
                      start(async () => {
                        await addInstrumentPrep(bundle.day.id, date, es.id);
                        router.refresh();
                      });
                    }}
                  >
                    Add {instruments.find((i) => i.symbol === "ES")?.symbol ?? "an instrument"}
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {bundle.preps.map((prep) => {
                const instrument = instruments.find((i) => i.id === prep.instrumentId);
                const levels = bundle.levels.filter((l) => l.instrumentPrepId === prep.id);
                return (
                  <InstrumentPrepCard
                    key={prep.id}
                    prep={prep}
                    date={date}
                    symbol={instrument?.symbol ?? "?"}
                    name={instrument?.name ?? ""}
                    tickSize={num(instrument?.tickSize, 0.25)}
                    levels={levels}
                    interactions={bundle.interactions}
                    levelTypes={levelTypes}
                    explainer={explainers.levels}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-13 font-[590] mb-2">Environment</h3>
          <Explainer id="environment" source={explainers.environment} />
          <Environment
            dayId={bundle.day.id} date={date}
            environment={bundle.environment} events={bundle.events}
          />
        </div>
      </div>
    </PhaseShell>
  );
}

function InstrumentPrepCard({
  prep, date, symbol, name, tickSize, levels, interactions, levelTypes, explainer,
}: {
  prep: CockpitProps["bundle"]["preps"][number];
  date: string; symbol: string; name: string; tickSize: number;
  levels: CockpitProps["bundle"]["levels"];
  interactions: CockpitProps["bundle"]["interactions"];
  levelTypes: CockpitProps["levelTypes"];
  explainer: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);
  const [open, setOpen] = React.useState(true);

  const save = async (patch: Record<string, unknown>) => {
    await updateInstrumentPrep(prep.id, date, patch);
    router.refresh();
  };

  return (
    <Card className="p-4 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-baseline gap-2 text-left min-w-0"
        >
          <span aria-hidden className="text-[var(--text-tertiary)] text-12">{open ? "▾" : "▸"}</span>
          <span className="text-15 font-[590] mono">{symbol}</span>
          <span className="text-12 text-[var(--text-secondary)] truncate">{name}</span>
          <span className="text-11 text-[var(--text-tertiary)] num">
            {levels.length} level{levels.length === 1 ? "" : "s"}
          </span>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          <TextButton
            onClick={() => start(async () => {
              const res = await carryLevelsForward(prep.id, date, prep.instrumentId);
              toast(res.ok ? "Levels carried forward from the last session you prepped." : res.error);
              router.refresh();
            })}
          >
            Carry levels forward
          </TextButton>
          <button
            type="button"
            aria-label={`Remove ${symbol} prep`}
            onClick={() => setConfirming(true)}
            className="text-[var(--text-tertiary)] hover:text-[var(--neg)] px-1"
          >
            ×
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3.5 space-y-3.5">
          <div className="grid gap-3 md:grid-cols-2">
            <AutosaveTextarea
              label="Structure" initial={prep.structureNote} rows={4}
              draftKey={`prep:${prep.id}:structure`}
              placeholder="Where is value, what is the auction doing, what did the prior session leave behind…"
              save={(v) => save({ structureNote: v })}
            />
            <AutosaveTextarea
              label="Ladder behaviour" initial={prep.ladderBehaviour} rows={4}
              draftKey={`prep:${prep.id}:ladder`}
              placeholder="Absorption, initiative, passivity — what the tape is showing."
              save={(v) => save({ ladderBehaviour: v })}
            />
          </div>

          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
            <AutosaveSelect
              label="VWAP slope" initial={prep.vwapSlope} options={SLOPES}
              save={(v) => save({ vwapSlope: v })}
            />
            <AutosaveSelect
              label="Prior day type" initial={prep.priorDayType} options={DAY_TYPES}
              save={(v) => save({ priorDayType: v })}
            />
            <AutosaveSelect
              label="Bias" initial={prep.directionalBias} options={BIASES}
              save={(v) => save({ directionalBias: v })}
            />
            <AutosaveInput
              label="Expected range" initial={prep.expectedRangeTicks === null ? "" : String(prep.expectedRangeTicks)}
              numeric hint="ticks"
              save={(v) => save({ expectedRangeTicks: v })}
            />
            <AutosaveSelect
              label="Conviction" initial={prep.conviction === null ? "" : String(prep.conviction)}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
              save={(v) => save({ conviction: v })}
            />
            <div className="min-w-0">
              <div className="label mb-1">Chart patterns</div>
              <TagInput
                values={prep.chartPattern}
                placeholder="Add"
                onChange={(v) => start(async () => { await save({ chartPattern: v }); })}
              />
            </div>
          </div>

          <Divider />

          <div>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h4 className="label">Levels</h4>
            </div>
            <Explainer id="prep-levels" source={explainer} />
            <LevelsTable
              prepId={prep.id} date={date} levels={levels} interactions={interactions}
              levelTypes={levelTypes} tickSize={tickSize}
            />
          </div>
        </div>
      )}

      <ConfirmDelete
        open={confirming} onOpenChange={setConfirming}
        what={`${symbol} prep`} phrase={symbol}
        onConfirm={() => start(async () => {
          await deleteInstrumentPrep(prep.id, date);
          router.refresh();
        })}
      />
    </Card>
  );
}
