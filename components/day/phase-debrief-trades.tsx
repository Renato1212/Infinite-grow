"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PhaseShell } from "./cockpit";
import { Explainer } from "@/components/explainer";
import { Card, EmptyState, Divider } from "@/components/ui/surface";
import { Button, TextButton } from "@/components/ui/button";
import { Pill, DirectionMark } from "@/components/ui/pill";
import { Scale, Select } from "@/components/ui/field";
import { AutosaveTextarea } from "@/components/ui/autosave";
import { EdgeGrid } from "./edge-grid";
import { TagPicker } from "./tag-picker";
import { setMistakeTags, setTradeTags, updateTrade, upsertTradeDebrief } from "@/app/actions/trades";
import { localTime } from "@/lib/time";
import { formatPrice, num } from "@/lib/pnl";
import { signedMoney, signedNumber, duration, pnlTone, humanise } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Phase } from "@/lib/completion";
import type { CockpitProps } from "./types";

export function PhaseDebriefTrades(props: CockpitProps & { phase: Phase }) {
  const { bundle, date, phase, explainers, domains, tags, instruments } = props;
  const [showDone, setShowDone] = React.useState(false);

  const isDone = (tradeId: string) =>
    props.assessments.some((a) => a.tradeId === tradeId && a.wasPrimary) &&
    props.tradeDebriefs.some((d) => d.tradeId === tradeId && d.repeatable !== null);

  const queue = bundle.trades.filter((t) => showDone || !isDone(t.id));
  const remaining = bundle.trades.filter((t) => !isDone(t.id)).length;

  return (
    <PhaseShell
      id="debrief-trades" index={4} title="Debrief trades"
      description="Score every trade across the five domains, then say what you saw and what was actually there."
      ratio={phase.ratio} checks={phase.checks}
      actions={
        bundle.trades.length > 0 ? (
          <TextButton onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Show only what's left" : `Show all ${bundle.trades.length}`}
          </TextButton>
        ) : undefined
      }
    >
      <Explainer id="edge-grid" source={explainers.edgeGrid} />

      {bundle.trades.length === 0 ? (
        <Card>
          <EmptyState
            title="No trades to debrief."
            body="A day without trades is still a day worth closing — go straight to the day debrief."
          />
        </Card>
      ) : queue.length === 0 ? (
        <Card>
          <EmptyState
            title="Every trade is scored."
            body="Nothing left in the queue. Close the day when the day debrief is written."
            action={<TextButton onClick={() => setShowDone(true)}>Show them anyway</TextButton>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {remaining > 0 && (
            <p className="text-12 [color:var(--text-secondary)]">
              {remaining} of {bundle.trades.length} still to score.
            </p>
          )}
          {queue.map((trade) => (
            <TradeDebriefCard
              key={trade.id}
              trade={trade}
              date={date}
              instrument={instruments.find((i) => i.id === trade.instrumentId)}
              hypotheses={bundle.hypotheses}
              domains={domains}
              tags={tags}
              assessments={props.assessments}
              debrief={props.tradeDebriefs.find((d) => d.tradeId === trade.id) ?? null}
              tradeTagIds={props.tradeTagLinks.filter((l) => l.tradeId === trade.id).map((l) => l.tagId)}
              mistakeTagIds={(() => {
                const dbf = props.tradeDebriefs.find((d) => d.tradeId === trade.id);
                return dbf ? props.mistakeTagLinks.filter((l) => l.tradeDebriefId === dbf.id).map((l) => l.tagId) : [];
              })()}
              explainer={explainers.tradeDebrief}
              done={isDone(trade.id)}
            />
          ))}
        </div>
      )}
    </PhaseShell>
  );
}

export function TradeDebriefCard({
  trade, date, instrument, hypotheses, domains, tags, assessments, debrief,
  tradeTagIds, mistakeTagIds, explainer, done,
}: {
  trade: CockpitProps["bundle"]["trades"][number];
  date: string;
  instrument?: CockpitProps["instruments"][number];
  hypotheses: CockpitProps["bundle"]["hypotheses"];
  domains: CockpitProps["domains"];
  tags: CockpitProps["tags"];
  assessments: CockpitProps["assessments"];
  debrief: CockpitProps["tradeDebriefs"][number] | null;
  tradeTagIds: string[];
  mistakeTagIds: string[];
  explainer: string | null;
  done: boolean;
}) {
  const router = useRouter();
  const [, start] = React.useTransition();
  const [open, setOpen] = React.useState(!done);
  const tickSize = num(instrument?.tickSize, 0.25);
  const tone = pnlTone(trade.netPnl);

  const save = async (patch: Record<string, unknown>) => {
    await upsertTradeDebrief(trade.id, date, patch);
    router.refresh();
  };

  return (
    <Card className={cn("p-4 min-w-0", done && "opacity-70")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 text-left"
      >
        <span aria-hidden className="[color:var(--text-tertiary)] text-12">{open ? "▾" : "▸"}</span>
        <time className="mono text-12">{localTime(trade.entryAt)}</time>
        <span className="mono text-13 font-[590]">{instrument?.symbol}</span>
        <DirectionMark direction={trade.direction} />
        <span className="mono text-12 [color:var(--text-secondary)]">
          {formatPrice(trade.avgEntryPrice, tickSize)} → {formatPrice(trade.avgExitPrice, tickSize)}
        </span>
        <span className="text-12 [color:var(--text-tertiary)] num">{duration(trade.durationSeconds)}</span>
        <span className={cn(
          "num font-[560] text-13",
          tone === "pos" && "[color:var(--pos)]", tone === "neg" && "[color:var(--neg)]",
        )}>
          {signedMoney(trade.netPnl)}
        </span>
        {trade.rMultiple !== null && (
          <span className="text-12 num [color:var(--text-secondary)]">
            {signedNumber(trade.rMultiple, 2)}R
          </span>
        )}
        {!trade.planned && <Pill tone="warn">improvised</Pill>}
        <span className="flex-1" />
        {done && <Pill tone="pos">scored</Pill>}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <EdgeGrid
            tradeId={trade.id} date={date} domains={domains} assessments={assessments}
          />

          <Divider />

          <div className="grid gap-3 md:grid-cols-3">
            <AutosaveTextarea
              label="Context" initial={debrief?.contextNote ?? ""} rows={3}
              draftKey={`td:${trade.id}:context`}
              placeholder="What the day and the location actually were."
              save={(v) => save({ contextNote: v })}
            />
            <AutosaveTextarea
              label="Edge" initial={debrief?.edgeNote ?? ""} rows={3}
              draftKey={`td:${trade.id}:edge`}
              placeholder="Why this was a trade, or why it wasn't."
              save={(v) => save({ edgeNote: v })}
            />
            <AutosaveTextarea
              label="Process" initial={debrief?.processNote ?? ""} rows={3}
              draftKey={`td:${trade.id}:process`}
              placeholder="How you executed and managed it."
              save={(v) => save({ processNote: v })}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <AutosaveTextarea
              label="What I saw" initial={debrief?.whatISaw ?? ""} rows={3}
              draftKey={`td:${trade.id}:saw`}
              save={(v) => save({ whatISaw: v })}
            />
            <AutosaveTextarea
              label="What was actually there" initial={debrief?.whatWasActuallyThere ?? ""} rows={3}
              draftKey={`td:${trade.id}:actual`}
              save={(v) => save({ whatWasActuallyThere: v })}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <AutosaveTextarea
              label="Lesson" initial={debrief?.lesson ?? ""} rows={2}
              draftKey={`td:${trade.id}:lesson`}
              save={(v) => save({ lesson: v })}
            />
            <AutosaveTextarea
              label="Action" initial={debrief?.action ?? ""} rows={2}
              draftKey={`td:${trade.id}:action`}
              save={(v) => save({ action: v })}
            />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {([
              ["entryQuality", "Entry"], ["exitQuality", "Exit"],
              ["executionQuality", "Execution"], ["managementQuality", "Management"],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <div className="label mb-1">{label}</div>
                <Scale
                  name={label}
                  value={(debrief?.[key] as number | null) ?? null}
                  onChange={(v) => start(async () => { await save({ [key]: v }); })}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-start">
            <div>
              <div className="label mb-1">Tags</div>
              <TagPicker
                tags={tags.filter((t) => t.category !== "error")}
                selected={tradeTagIds}
                onChange={(ids) => start(async () => { await setTradeTags(trade.id, date, ids); })}
                tradeId={trade.id}
              />
            </div>
            <div>
              <div className="label mb-1">Mistakes</div>
              <TagPicker
                tags={tags.filter((t) => t.category === "error")}
                selected={mistakeTagIds}
                onChange={(ids) => start(async () => { await setMistakeTags(trade.id, date, ids); })}
                tradeId={trade.id}
                emptyHint="No error tags yet — add them in Library."
              />
            </div>
            <div>
              <div className="label mb-1">Would I take it again?</div>
              <div className="flex gap-1">
                {[
                  { value: true, label: "Yes, identically" },
                  { value: false, label: "No" },
                ].map((o) => (
                  <button
                    key={String(o.value)}
                    type="button"
                    aria-pressed={debrief?.repeatable === o.value}
                    onClick={() => start(async () => { await save({ repeatable: o.value }); })}
                    className={cn(
                      "h-7 px-2.5 rounded-[var(--r-input)] text-12 border transition-colors duration-[var(--d-fast)]",
                      debrief?.repeatable === o.value
                        ? "bg-[var(--accent-quiet)] [color:var(--accent)] border-transparent font-[560]"
                        : "border-[var(--line-strong)] [color:var(--text-secondary)] hover:bg-[var(--bg-hover)]",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="label mb-1">Against which hypothesis</div>
              <Select
                aria-label="Against which hypothesis"
                value={trade.hypothesisId ?? ""} placeholder="None"
                onChange={(e) => start(async () => {
                  await updateTrade(trade.id, date, { hypothesisId: e.target.value || null });
                  router.refresh();
                })}
              >
                {hypotheses.map((h) => (
                  <option key={h.id} value={h.id}>{h.rank}. {h.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <div className="label mb-1">Exit reason</div>
              <Select
                aria-label="Exit reason"
                value={trade.exitReason ?? ""} placeholder="—"
                onChange={(e) => start(async () => {
                  await updateTrade(trade.id, date, { exitReason: e.target.value || null });
                  router.refresh();
                })}
              >
                {["target", "stop", "trail", "time", "discretionary", "news", "management_error"]
                  .map((v) => <option key={v} value={v}>{humanise(v)}</option>)}
              </Select>
            </div>
            <div>
              <div className="label mb-1">Size versus plan</div>
              <Select
                aria-label="Size versus plan"
                value={trade.sizeVsPlan ?? ""} placeholder="—"
                onChange={(e) => start(async () => {
                  await updateTrade(trade.id, date, { sizeVsPlan: e.target.value || null });
                  router.refresh();
                })}
              >
                {["under", "as_planned", "over"].map((v) => (
                  <option key={v} value={v}>{humanise(v)}</option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
