"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Divider, EmptyState, Stat } from "@/components/ui/surface";
import { Button, TextButton } from "@/components/ui/button";
import { Pill, DirectionMark } from "@/components/ui/pill";
import { Field, Input, NumberInput, Scale, Select } from "@/components/ui/field";
import { AutosaveTextarea, AutosaveInput } from "@/components/ui/autosave";
import { ConfirmDelete } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { Explainer } from "@/components/explainer";
import { EdgeGrid } from "@/components/day/edge-grid";
import { TagPicker } from "@/components/day/tag-picker";
import { MediaPanel } from "./media";
import {
  addExecution, deleteExecution, deleteTrade, setMistakeTags, setTradeTags,
  updateTrade, upsertTradeDebrief,
} from "@/app/actions/trades";
import { localTime, localDateTime, dayLabel } from "@/lib/time";
import { formatPrice, num } from "@/lib/pnl";
import { signedMoney, signedNumber, duration, pnlTone, humanise } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { TradeDetail } from "@/lib/queries/trade";
import type { EdgeDomain, Tag } from "@/lib/queries/reference";

export function TradeDetailView({
  detail, domains, tags, edgeExplainer, debriefExplainer,
}: {
  detail: TradeDetail;
  domains: EdgeDomain[];
  tags: Tag[];
  edgeExplainer: string | null;
  debriefExplainer: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);

  const { trade, day, instrument, executions, debrief } = detail;
  const date = day.date;
  const tickSize = num(instrument?.tickSize, 0.25);
  const tone = pnlTone(trade.netPnl);

  const saveTrade = (patch: Record<string, unknown>) =>
    start(async () => { await updateTrade(trade.id, date, patch); router.refresh(); });
  const saveDebrief = async (patch: Record<string, unknown>) => {
    await upsertTradeDebrief(trade.id, date, patch);
    router.refresh();
  };

  return (
    <div className="min-w-0 max-w-[1200px]">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <Link
            href={`/day/${date}`}
            className="text-12 [color:var(--text-secondary)] hover:[color:var(--accent)]"
          >
            ← {dayLabel(date)}
          </Link>
          <div className="flex flex-wrap items-baseline gap-3 mt-1">
            <h1 className="text-24 font-[590] tracking-[-0.018em] mono">{instrument?.symbol}</h1>
            <DirectionMark direction={trade.direction} />
            <span className="mono text-15 [color:var(--text-secondary)]">
              {formatPrice(trade.avgEntryPrice, tickSize)} → {formatPrice(trade.avgExitPrice, tickSize)}
            </span>
            <span className="text-12 [color:var(--text-tertiary)] num">
              {localTime(trade.entryAt)}–{trade.exitAt ? localTime(trade.exitAt) : "open"}
              {" · "}{duration(trade.durationSeconds)}
            </span>
            {!trade.planned && <Pill tone="warn">improvised</Pill>}
          </div>
        </div>
        <div className="flex items-start gap-6">
          <Stat
            label="Net" value={signedMoney(trade.netPnl)}
            tone={tone === "flat" ? "muted" : tone}
            sub={`${trade.ticksCaptured === null ? "—" : signedNumber(trade.ticksCaptured, 0)} ticks`}
          />
          <Stat
            label="R" value={trade.rMultiple === null ? "—" : signedNumber(trade.rMultiple, 2)}
            tone="muted" sub={trade.maxSize ? `${num(trade.maxSize)} lots` : undefined}
          />
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>Delete</Button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3 min-w-0">
          <Card className="p-4">
            <h2 className="label mb-2.5">The five domains</h2>
            <Explainer id="edge-grid" source={edgeExplainer} />
            <EdgeGrid
              tradeId={trade.id} date={date} domains={domains} assessments={detail.assessments}
            />
          </Card>

          <Card className="p-4">
            <h2 className="label mb-2.5">Debrief</h2>
            <Explainer id="trade-debrief" source={debriefExplainer} />
            <div className="grid gap-3 md:grid-cols-3">
              <AutosaveTextarea
                label="Context" initial={debrief?.contextNote ?? ""} rows={3}
                draftKey={`t:${trade.id}:context`} save={(v) => saveDebrief({ contextNote: v })}
              />
              <AutosaveTextarea
                label="Edge" initial={debrief?.edgeNote ?? ""} rows={3}
                draftKey={`t:${trade.id}:edge`} save={(v) => saveDebrief({ edgeNote: v })}
              />
              <AutosaveTextarea
                label="Process" initial={debrief?.processNote ?? ""} rows={3}
                draftKey={`t:${trade.id}:process`} save={(v) => saveDebrief({ processNote: v })}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2 mt-3">
              <AutosaveTextarea
                label="What I saw" initial={debrief?.whatISaw ?? ""} rows={3}
                draftKey={`t:${trade.id}:saw`} save={(v) => saveDebrief({ whatISaw: v })}
              />
              <AutosaveTextarea
                label="What was actually there" initial={debrief?.whatWasActuallyThere ?? ""} rows={3}
                draftKey={`t:${trade.id}:actual`}
                save={(v) => saveDebrief({ whatWasActuallyThere: v })}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2 mt-3">
              <AutosaveTextarea
                label="Lesson" initial={debrief?.lesson ?? ""} rows={2}
                draftKey={`t:${trade.id}:lesson`} save={(v) => saveDebrief({ lesson: v })}
              />
              <AutosaveTextarea
                label="Action" initial={debrief?.action ?? ""} rows={2}
                draftKey={`t:${trade.id}:action`} save={(v) => saveDebrief({ action: v })}
              />
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 mt-4">
              {([
                ["entryQuality", "Entry"], ["exitQuality", "Exit"],
                ["executionQuality", "Execution"], ["managementQuality", "Management"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <div className="label mb-1">{label}</div>
                  <Scale
                    name={label}
                    value={(debrief?.[key] as number | null) ?? null}
                    onChange={(v) => start(async () => { await saveDebrief({ [key]: v }); })}
                  />
                </div>
              ))}
              <div>
                <div className="label mb-1">Repeatable</div>
                <div className="flex gap-1">
                  {[{ value: true, label: "Yes" }, { value: false, label: "No" }].map((o) => (
                    <button
                      key={String(o.value)}
                      type="button"
                      aria-pressed={debrief?.repeatable === o.value}
                      onClick={() => start(async () => { await saveDebrief({ repeatable: o.value }); })}
                      className={cn(
                        "h-7 px-3 rounded-[var(--r-input)] text-12 border",
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

            <div className="grid gap-3 md:grid-cols-2 mt-4">
              <div>
                <div className="label mb-1">Tags</div>
                <TagPicker
                  tags={tags.filter((t) => t.category !== "error")}
                  selected={detail.tagIds}
                  tradeId={trade.id}
                  onChange={(ids) => start(async () => {
                    await setTradeTags(trade.id, date, ids);
                    router.refresh();
                  })}
                />
              </div>
              <div>
                <div className="label mb-1">Mistakes</div>
                <TagPicker
                  tags={tags.filter((t) => t.category === "error")}
                  selected={detail.mistakeTagIds}
                  tradeId={trade.id}
                  emptyHint="No error tags yet — add them in Library."
                  onChange={(ids) => start(async () => {
                    await setMistakeTags(trade.id, date, ids);
                    router.refresh();
                  })}
                />
              </div>
            </div>
          </Card>

          <MediaPanel tradeId={trade.id} media={detail.media} entryAt={trade.entryAt} />
        </div>

        <div className="space-y-3 min-w-0">
          <Card className="p-4">
            <h2 className="label mb-2.5">Execution</h2>
            <div className="grid grid-cols-2 gap-3">
              <AutosaveInput
                label="Initial stop" numeric
                initial={trade.initialStop ?? ""}
                save={(v) => { saveTrade({ initialStop: v }); return Promise.resolve(); }}
                hint="Sets the R multiple"
              />
              <AutosaveInput
                label="Initial target" numeric
                initial={trade.initialTarget ?? ""}
                save={(v) => { saveTrade({ initialTarget: v }); return Promise.resolve(); }}
              />
              <AutosaveInput
                label="MAE" numeric hint="ticks"
                initial={trade.maeTicks === null ? "" : String(trade.maeTicks)}
                save={(v) => { saveTrade({ maeTicks: v }); return Promise.resolve(); }}
              />
              <AutosaveInput
                label="MFE" numeric hint="ticks"
                initial={trade.mfeTicks === null ? "" : String(trade.mfeTicks)}
                save={(v) => { saveTrade({ mfeTicks: v }); return Promise.resolve(); }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Entry style">
                <Select
                  value={trade.entryStyle ?? ""} placeholder="—"
                  onChange={(e) => saveTrade({ entryStyle: e.target.value || null })}
                >
                  {["limit", "market", "stop", "scaled"].map((v) => (
                    <option key={v} value={v}>{humanise(v)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Exit reason">
                <Select
                  value={trade.exitReason ?? ""} placeholder="—"
                  onChange={(e) => saveTrade({ exitReason: e.target.value || null })}
                >
                  {["target", "stop", "trail", "time", "discretionary", "news", "management_error"].map((v) => (
                    <option key={v} value={v}>{humanise(v)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Size versus plan">
                <Select
                  value={trade.sizeVsPlan ?? ""} placeholder="—"
                  onChange={(e) => saveTrade({ sizeVsPlan: e.target.value || null })}
                >
                  {["under", "as_planned", "over"].map((v) => (
                    <option key={v} value={v}>{humanise(v)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="In the plan">
                <Select
                  value={trade.planned ? "yes" : "no"}
                  onChange={(e) => saveTrade({ planned: e.target.value === "yes" })}
                >
                  <option value="yes">Planned</option>
                  <option value="no">Improvised</option>
                </Select>
              </Field>
            </div>

            <div className="mt-3">
              <div className="label mb-1">Against which hypothesis</div>
              <Select
                aria-label="Against which hypothesis"
                value={trade.hypothesisId ?? ""} placeholder="None"
                onChange={(e) => saveTrade({ hypothesisId: e.target.value || null })}
              >
                {detail.hypotheses.map((h) => (
                  <option key={h.id} value={h.id}>{h.rank}. {h.label}</option>
                ))}
              </Select>
            </div>

            <div className="mt-3">
              <div className="label mb-1">Which opportunity</div>
              <Select
                aria-label="Which opportunity"
                value={trade.opportunityId ?? ""} placeholder="None"
                onChange={(e) => saveTrade({ opportunityId: e.target.value || null })}
              >
                {detail.opportunities.map((o) => (
                  <option key={o.id} value={o.id}>{o.setupName}</option>
                ))}
              </Select>
            </div>

            <div className="mt-3">
              <div className="label mb-1">Conviction</div>
              <Scale
                name="Conviction" value={trade.conviction}
                onChange={(v) => saveTrade({ conviction: v })}
              />
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="label mb-2.5">Fills</h2>
            <Executions
              tradeId={trade.id} date={date} executions={executions} tickSize={tickSize}
            />
          </Card>

          {detail.levels.length > 0 && (
            <Card className="p-4">
              <h2 className="label mb-2.5">Levels marked that morning</h2>
              <ul className="space-y-0.5">
                {[...detail.levels]
                  .sort((a, b) => Number(b.price) - Number(a.price))
                  .map((l) => {
                    const entry = num(trade.avgEntryPrice);
                    const near = entry > 0 &&
                      Math.abs(Number(l.price) - entry) / tickSize <= 8;
                    return (
                      <li
                        key={l.id}
                        className={cn(
                          "flex items-baseline gap-2 text-12 py-0.5 px-1.5 rounded-[4px]",
                          near && "bg-[var(--accent-quiet)]",
                        )}
                      >
                        <span className="mono w-[76px] tabular-nums">
                          {formatPrice(l.price, tickSize)}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{l.typeLabel}</span>
                        {near && <span className="text-11 [color:var(--accent)]">near entry</span>}
                      </li>
                    );
                  })}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDelete
        open={confirming} onOpenChange={setConfirming}
        what="this trade" phrase={instrument?.symbol ?? "delete"}
        onConfirm={() => start(async () => {
          await deleteTrade(trade.id, date);
          toast("Trade deleted.");
          router.push(`/day/${date}`);
        })}
      />
    </div>
  );
}

function Executions({
  tradeId, date, executions, tickSize,
}: {
  tradeId: string; date: string;
  executions: TradeDetail["executions"];
  tickSize: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [draft, setDraft] = React.useState({
    side: "buy", price: "", quantity: "1", time: "", isEntry: "true", commission: "",
  });

  const add = () => start(async () => {
    const res = await addExecution(tradeId, date, {
      ...draft, isEntry: draft.isEntry === "true",
    });
    if (!res.ok) { toast(res.error); return; }
    setDraft({ ...draft, price: "", time: "" });
    router.refresh();
  });

  return (
    <div>
      {executions.length === 0 ? (
        <p className="text-12 [color:var(--text-tertiary)]">
          No fills recorded. Add them and every money column recomputes from them.
        </p>
      ) : (
        <table className="w-full text-12 border-collapse">
          <thead>
            <tr>
              {["Time", "Side", "In/out", "Price", "Qty", "Comm.", ""].map((h) => (
                <th key={h} className="label font-[560] text-left py-1 pr-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {executions.map((e) => (
              <tr key={e.id} className="border-t border-[var(--line)]">
                <td className="py-1 pr-2 mono">{localTime(e.executedAt)}</td>
                <td className="py-1 pr-2">{e.side === "buy" ? "Buy" : "Sell"}</td>
                <td className="py-1 pr-2 [color:var(--text-secondary)]">
                  {e.isEntry ? "In" : "Out"}
                </td>
                <td className="py-1 pr-2 mono">{formatPrice(e.price, tickSize)}</td>
                <td className="py-1 pr-2 num">{num(e.quantity)}</td>
                <td className="py-1 pr-2 num [color:var(--text-tertiary)]">{num(e.commission)}</td>
                <td className="py-1">
                  <button
                    type="button" aria-label="Remove fill"
                    onClick={() => start(async () => {
                      await deleteExecution(e.id, date, tradeId);
                      router.refresh();
                    })}
                    className="[color:var(--text-tertiary)] hover:[color:var(--neg)] px-1"
                  >×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3">
        <Field label="Side">
          <Select
            value={draft.side} className="h-8 py-0"
            onChange={(e) => setDraft({ ...draft, side: e.target.value })}
          >
            <option value="buy">Buy</option><option value="sell">Sell</option>
          </Select>
        </Field>
        <Field label="In or out">
          <Select
            value={draft.isEntry} className="h-8 py-0"
            onChange={(e) => setDraft({ ...draft, isEntry: e.target.value })}
          >
            <option value="true">In</option><option value="false">Out</option>
          </Select>
        </Field>
        <Field label="Time">
          <Input
            type="time" value={draft.time} className="h-8 py-0 mono"
            onChange={(e) => setDraft({ ...draft, time: e.target.value })}
          />
        </Field>
        <Field label="Price">
          <NumberInput
            value={draft.price} className="h-8 py-0"
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
          />
        </Field>
        <Field label="Quantity">
          <NumberInput
            value={draft.quantity} className="h-8 py-0"
            onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
          />
        </Field>
        <Field label="Commission">
          <NumberInput
            value={draft.commission} className="h-8 py-0"
            onChange={(e) => setDraft({ ...draft, commission: e.target.value })}
          />
        </Field>
      </div>
      <Button
        size="sm" className="mt-2.5"
        onClick={add} disabled={!draft.price || !draft.time}
      >
        Add fill
      </Button>
    </div>
  );
}
