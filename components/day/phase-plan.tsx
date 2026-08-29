"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PhaseShell } from "./cockpit";
import { Explainer } from "@/components/explainer";
import { Button, TextButton } from "@/components/ui/button";
import { Card, Divider, EmptyState } from "@/components/ui/surface";
import { AutosaveTextarea, AutosaveInput, AutosaveSelect } from "@/components/ui/autosave";
import { Field, Input, NumberInput, Select, Checkbox } from "@/components/ui/field";
import { Pill, DomainDot } from "@/components/ui/pill";
import { Sheet, ConfirmDelete } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import {
  addHypothesis, addOpportunity, deleteHypothesis, deleteOpportunity,
  setHypothesisPath, updateHypothesis, updateOpportunity, upsertSessionPrep,
} from "@/app/actions/day";
import { formatPrice, num } from "@/lib/pnl";
import { humanise } from "@/lib/format";
import type { Phase } from "@/lib/completion";
import type { CockpitProps } from "./types";

export function PhasePlan(props: CockpitProps & { phase: Phase }) {
  const { bundle, date, instruments, domains, phase, explainers, levelTypes } = props;
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [newHypOpen, setNewHypOpen] = React.useState(false);
  const [newOppOpen, setNewOppOpen] = React.useState(false);

  const preppedInstruments = instruments.filter((i) =>
    bundle.preps.some((p) => p.instrumentId === i.id));
  const instrumentChoices = preppedInstruments.length ? preppedInstruments : instruments;

  return (
    <PhaseShell
      id="plan" index={2} title="Plan"
      description="Ranked hypotheses as routes through your levels, the opportunities on them, and the session reassessments."
      ratio={phase.ratio} checks={phase.checks}
      actions={
        <>
          <Button size="sm" onClick={() => setNewOppOpen(true)}>Add opportunity</Button>
          <Button size="sm" variant="primary" onClick={() => setNewHypOpen(true)}>Add hypothesis</Button>
        </>
      }
    >
      <div className="space-y-8">
        <div>
          <h3 className="text-13 font-[590] mb-2">Hypotheses</h3>
          <Explainer id="hypotheses" source={explainers.hypotheses} />
          {bundle.hypotheses.length === 0 ? (
            <Card>
              <EmptyState
                title="No hypotheses yet."
                body="A direction is not a hypothesis. Write the path: where price goes, what it does when it gets there, and what tells you you are wrong."
                action={<Button variant="primary" onClick={() => setNewHypOpen(true)}>Write the primary hypothesis</Button>}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {bundle.hypotheses.map((h) => (
                <HypothesisCard
                  key={h.id} hypothesis={h} date={date}
                  instrument={instruments.find((i) => i.id === h.instrumentId)}
                  levels={bundle.levels}
                  preps={bundle.preps}
                  levelTypes={levelTypes}
                  path={bundle.paths.filter((p) => p.hypothesisId === h.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-13 font-[590] mb-2">Opportunities</h3>
          <Explainer id="opportunities" source={explainers.opportunities} />
          {bundle.opportunities.length === 0 ? (
            <Card>
              <EmptyState
                title="No opportunities identified."
                body="A hypothesis is a path; an opportunity is a tradeable location on it. Score each one and the chop sorts itself to the bottom."
                action={<Button onClick={() => setNewOppOpen(true)}>Add an opportunity</Button>}
              />
            </Card>
          ) : (
            <Card className="p-1 overflow-x-auto">
              <table className="w-full text-12 border-collapse min-w-[720px]">
                <thead>
                  <tr>
                    {["Asym.", "Setup", "Instrument", "Hypothesis", "Primary domain", "Ticks", "Prob.", ""].map((h) => (
                      <th key={h} className="label font-[560] text-left px-2.5 py-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bundle.opportunities.map((o) => {
                    const domain = domains.find((d) => d.id === o.primaryEdgeDomainId);
                    const hyp = bundle.hypotheses.find((h) => h.id === o.hypothesisId);
                    const traded = bundle.trades.some((t) => t.opportunityId === o.id);
                    return (
                      <tr key={o.id} className="border-t border-[var(--line)]">
                        <td className="px-2.5 py-2 num font-[590] tabular-nums">
                          {o.asymmetryScore === null ? "—" : num(o.asymmetryScore).toFixed(1)}
                        </td>
                        <td className="px-2.5 py-2">
                          <span className="font-[560]">{o.setupName}</span>
                          {traded && <Pill tone="accent" className="ml-1.5">traded</Pill>}
                          {o.locationNote && (
                            <div className="text-11 text-[var(--text-tertiary)] truncate max-w-[260px]">
                              {o.locationNote}
                            </div>
                          )}
                        </td>
                        <td className="px-2.5 py-2 mono">
                          {instruments.find((i) => i.id === o.instrumentId)?.symbol ?? "—"}
                        </td>
                        <td className="px-2.5 py-2 text-[var(--text-secondary)] max-w-[160px] truncate">
                          {hyp?.label ?? "—"}
                        </td>
                        <td className="px-2.5 py-2">
                          {domain ? (
                            <span className="inline-flex items-center gap-1.5">
                              <DomainDot domainKey={domain.key} />{domain.label}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-2.5 py-2 num">{o.potentialTicks ?? "—"}</td>
                        <td className="px-2.5 py-2 num">
                          {o.estimatedProbability === null ? "—" : `${o.estimatedProbability}%`}
                        </td>
                        <td className="px-2.5 py-2">
                          <button
                            type="button" aria-label={`Remove ${o.setupName}`}
                            onClick={() => start(async () => { await deleteOpportunity(o.id, date); router.refresh(); })}
                            className="text-[var(--text-tertiary)] hover:text-[var(--neg)] px-1"
                          >×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div>
          <h3 className="text-13 font-[590] mb-2">Session reassessments</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {bundle.sessions
              .filter((s) => ["europe_pre", "europe_rth", "us_pre", "us_rth"].includes(s.key))
              .map((s) => {
                const prep = bundle.sessionPreps.find((p) => p.sessionId === s.id);
                const save = async (patch: Record<string, unknown>) => {
                  await upsertSessionPrep(s.id, date, patch);
                  router.refresh();
                };
                return (
                  <Card key={s.id} className="p-3.5 min-w-0">
                    <div className="flex items-baseline justify-between mb-2">
                      <h4 className="text-13 font-[590]">{s.label}</h4>
                      <span className="text-11 mono text-[var(--text-tertiary)]">
                        {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
                      </span>
                    </div>
                    <AutosaveTextarea
                      label="What changed" initial={prep?.whatChanged ?? ""} rows={2}
                      draftKey={`sess:${s.id}:changed`}
                      save={(v) => save({ whatChanged: v })}
                    />
                    <AutosaveTextarea
                      className="mt-2.5"
                      label="Reassessment" initial={prep?.reassessment ?? ""} rows={3}
                      draftKey={`sess:${s.id}:reassess`}
                      save={(v) => save({ reassessment: v })}
                    />
                    <div className="grid grid-cols-2 gap-2 mt-2.5">
                      <AutosaveSelect
                        label="Bias now" initial={prep?.updatedBias ?? ""}
                        options={[
                          { value: "short_bias", label: "Short bias" },
                          { value: "neutral", label: "Neutral" },
                          { value: "long_bias", label: "Long bias" },
                        ]}
                        save={(v) => save({ updatedBias: v })}
                      />
                      <AutosaveSelect
                        label="Energy" initial={prep?.energyLevel === null || prep?.energyLevel === undefined ? "" : String(prep.energyLevel)}
                        options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                        save={(v) => save({ energyLevel: v })}
                      />
                    </div>
                  </Card>
                );
              })}
          </div>
        </div>
      </div>

      <NewHypothesisSheet
        open={newHypOpen} onOpenChange={setNewHypOpen}
        dayId={bundle.day.id} date={date} instruments={instrumentChoices}
        nextRank={bundle.hypotheses.length + 1}
      />
      <NewOpportunitySheet
        open={newOppOpen} onOpenChange={setNewOppOpen}
        dayId={bundle.day.id} date={date} instruments={instrumentChoices}
        hypotheses={bundle.hypotheses} domains={domains}
      />
    </PhaseShell>
  );
}

function HypothesisCard({
  hypothesis: h, date, instrument, levels, preps, levelTypes, path,
}: {
  hypothesis: CockpitProps["bundle"]["hypotheses"][number];
  date: string;
  instrument?: CockpitProps["instruments"][number];
  levels: CockpitProps["bundle"]["levels"];
  preps: CockpitProps["bundle"]["preps"];
  levelTypes: CockpitProps["levelTypes"];
  path: CockpitProps["bundle"]["paths"];
}) {
  const router = useRouter();
  const [, start] = React.useTransition();
  const [confirming, setConfirming] = React.useState(false);
  const [pathOpen, setPathOpen] = React.useState(false);

  const save = async (patch: Record<string, unknown>) => {
    await updateHypothesis(h.id, date, patch);
    router.refresh();
  };

  const prepForInstrument = preps.find((p) => p.instrumentId === h.instrumentId);
  const candidateLevels = levels.filter((l) => l.instrumentPrepId === prepForInstrument?.id);
  const chosen = path.map((p) => p.prepLevelId);
  const tickSize = num(instrument?.tickSize, 0.25);

  return (
    <Card className={`p-4 min-w-0 ${h.rank === 1 ? "border-l-2 border-l-[var(--accent)]" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <Pill tone={h.rank === 1 ? "accent" : "neutral"}>Rank {h.rank}</Pill>
            <span className="mono text-13">{instrument?.symbol}</span>
            <h4 className="text-15 font-[590] truncate">{h.label}</h4>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {h.outcome && <Pill tone={h.outcome === "played_out" ? "pos" : h.outcome === "invalidated" ? "neg" : "neutral"}>
            {humanise(h.outcome)}
          </Pill>}
          <button
            type="button" aria-label={`Remove ${h.label}`}
            onClick={() => setConfirming(true)}
            className="text-[var(--text-tertiary)] hover:text-[var(--neg)] px-1"
          >×</button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 mt-3">
        <AutosaveTextarea
          label="Narrative — how price travels" initial={h.narrative} rows={4}
          draftKey={`hyp:${h.id}:narrative`}
          save={(v) => save({ narrative: v })}
        />
        <div className="space-y-3">
          <AutosaveTextarea
            label="Trigger conditions" initial={h.triggerConditions} rows={2}
            draftKey={`hyp:${h.id}:trigger`}
            save={(v) => save({ triggerConditions: v })}
          />
          <AutosaveTextarea
            label="Invalidation" initial={h.invalidation} rows={2}
            draftKey={`hyp:${h.id}:invalid`}
            placeholder="Write this now. You will not write an honest one at 15:00."
            save={(v) => save({ invalidation: v })}
          />
        </div>
      </div>

      <AutosaveTextarea
        className="mt-3"
        label="Planned response — size, entry style, management" initial={h.plannedResponse} rows={3}
        draftKey={`hyp:${h.id}:response`}
        save={(v) => save({ plannedResponse: v })}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <AutosaveInput
          label="Rank" initial={String(h.rank)} numeric save={(v) => save({ rank: v })}
        />
        <AutosaveInput
          label="Probability" initial={h.assignedProbability === null ? "" : String(h.assignedProbability)}
          numeric hint="%" save={(v) => save({ assignedProbability: v })}
        />
        <AutosaveInput
          label="Expected move" initial={h.expectedMoveTicks === null ? "" : String(h.expectedMoveTicks)}
          numeric hint="ticks" save={(v) => save({ expectedMoveTicks: v })}
        />
        <div>
          <div className="label mb-1">Path</div>
          <button
            type="button"
            onClick={() => setPathOpen(true)}
            className="w-full text-left text-12 h-[30px] px-2.5 rounded-[var(--r-input)]
                       border border-[var(--line-strong)] hover:bg-[var(--bg-hover)] truncate"
          >
            {chosen.length ? `${chosen.length} levels` : "Choose levels"}
          </button>
        </div>
      </div>

      {chosen.length > 0 && (
        <ol className="flex flex-wrap items-center gap-1.5 mt-2.5 text-11">
          {path.map((p, i) => {
            const level = levels.find((l) => l.id === p.prepLevelId);
            const type = levelTypes.find((t) => t.id === level?.levelTypeId);
            return (
              <li key={p.prepLevelId} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden className="text-[var(--text-tertiary)]">→</span>}
                <span className="px-1.5 py-0.5 rounded-[var(--r-pill)] bg-[var(--bg-hover)] mono">
                  {type?.label} {level ? formatPrice(level.price, tickSize) : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <Sheet
        open={pathOpen} onOpenChange={setPathOpen}
        title="Path through the levels"
        description="Pick the levels in the order price visits them. Order is the order you tick them."
      >
        {candidateLevels.length === 0 ? (
          <EmptyState
            title="No levels marked for this instrument yet."
            body="Go back to Prepare, add the instrument and mark the levels first — a hypothesis is a route through them."
          />
        ) : (
          <PathPicker
            levels={candidateLevels} levelTypes={levelTypes} tickSize={tickSize}
            initial={chosen}
            onSave={(ids) => start(async () => {
              await setHypothesisPath(h.id, date, ids);
              setPathOpen(false);
              router.refresh();
            })}
          />
        )}
      </Sheet>

      <ConfirmDelete
        open={confirming} onOpenChange={setConfirming}
        what="hypothesis" phrase="delete"
        onConfirm={() => start(async () => { await deleteHypothesis(h.id, date); router.refresh(); })}
      />
    </Card>
  );
}

function PathPicker({
  levels, levelTypes, tickSize, initial, onSave,
}: {
  levels: CockpitProps["bundle"]["levels"];
  levelTypes: CockpitProps["levelTypes"];
  tickSize: number;
  initial: string[];
  onSave: (ids: string[]) => void;
}) {
  const [chosen, setChosen] = React.useState<string[]>(initial);
  const toggle = (id: string) =>
    setChosen((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  return (
    <div>
      <ul className="space-y-0.5 max-h-[46vh] overflow-auto">
        {levels.map((l) => {
          const type = levelTypes.find((t) => t.id === l.levelTypeId);
          const index = chosen.indexOf(l.id);
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => toggle(l.id)}
                aria-pressed={index >= 0}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--r-input)] text-13 text-left
                  ${index >= 0 ? "bg-[var(--accent-quiet)] text-[var(--accent)]" : "hover:bg-[var(--bg-hover)]"}`}
              >
                <span className="num w-5 text-11 text-[var(--text-tertiary)]">
                  {index >= 0 ? index + 1 : ""}
                </span>
                <span className="w-32 shrink-0">{type?.label}</span>
                <span className="mono">{formatPrice(l.price, tickSize)}</span>
                <span className="text-11 text-[var(--text-tertiary)] truncate">{l.note}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={() => setChosen([])}>Clear</Button>
        <Button variant="primary" onClick={() => onSave(chosen)}>Save path</Button>
      </div>
    </div>
  );
}

function NewHypothesisSheet({
  open, onOpenChange, dayId, date, instruments, nextRank,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  dayId: string; date: string;
  instruments: CockpitProps["instruments"]; nextRank: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [form, setForm] = React.useState({
    instrumentId: "", label: "", rank: String(nextRank), narrative: "", invalidation: "",
  });

  React.useEffect(() => {
    if (open) setForm((f) => ({
      ...f, rank: String(nextRank),
      instrumentId: f.instrumentId || instruments[0]?.id || "",
    }));
  }, [open, nextRank, instruments]);

  const submit = () => start(async () => {
    const res = await addHypothesis(dayId, date, form);
    if (!res.ok) { toast(res.error); return; }
    setForm({ instrumentId: form.instrumentId, label: "", rank: String(nextRank + 1), narrative: "", invalidation: "" });
    onOpenChange(false);
    router.refresh();
  });

  return (
    <Sheet
      open={open} onOpenChange={onOpenChange}
      title="New hypothesis"
      description="Name it, rank it, say how price travels. The rest can be filled in on the card."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!form.label || !form.instrumentId}>
            Add hypothesis
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_80px] gap-3">
          <Field label="Instrument">
            <Select
              value={form.instrumentId}
              onChange={(e) => setForm({ ...form, instrumentId: e.target.value })}
            >
              {instruments.map((i) => <option key={i.id} value={i.id}>{i.symbol} — {i.name}</option>)}
            </Select>
          </Field>
          <Field label="Rank">
            <NumberInput value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} />
          </Field>
        </div>
        <Field label="Short name">
          <Input
            autoFocus value={form.label} placeholder="Rotation back through value"
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </Field>
        <Field label="Narrative">
          <textarea
            rows={4} value={form.narrative}
            onChange={(e) => setForm({ ...form, narrative: e.target.value })}
            placeholder="Opens above value, fails to find sellers at the ONH, rotates down to the POC…"
            className="w-full bg-[var(--bg-raised)] border border-[var(--line-strong)] rounded-[var(--r-input)]
                       px-2.5 py-1.5 text-13 focus:border-[var(--accent)] focus:outline-none
                       focus:ring-2 focus:ring-[var(--accent-quiet)]"
          />
        </Field>
        <Field label="Invalidation">
          <Input
            value={form.invalidation}
            placeholder="Acceptance above the ONH for more than 15 minutes"
            onChange={(e) => setForm({ ...form, invalidation: e.target.value })}
          />
        </Field>
      </div>
    </Sheet>
  );
}

function NewOpportunitySheet({
  open, onOpenChange, dayId, date, instruments, hypotheses, domains,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  dayId: string; date: string;
  instruments: CockpitProps["instruments"];
  hypotheses: CockpitProps["bundle"]["hypotheses"];
  domains: CockpitProps["domains"];
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [form, setForm] = React.useState({
    instrumentId: "", hypothesisId: "", setupName: "", locationNote: "",
    entryTrigger: "", invalidation: "", target: "", primaryEdgeDomainId: "",
    potentialTicks: "", estimatedProbability: "",
  });

  React.useEffect(() => {
    if (open) setForm((f) => ({ ...f, instrumentId: f.instrumentId || instruments[0]?.id || "" }));
  }, [open, instruments]);

  const asymmetry = num(form.potentialTicks) * num(form.estimatedProbability) / 100;

  const submit = () => start(async () => {
    const res = await addOpportunity(dayId, date, {
      ...form,
      hypothesisId: form.hypothesisId || null,
      primaryEdgeDomainId: form.primaryEdgeDomainId || null,
    });
    if (!res.ok) { toast(res.error); return; }
    onOpenChange(false);
    setForm({ ...form, setupName: "", locationNote: "", entryTrigger: "", target: "", potentialTicks: "", estimatedProbability: "" });
    router.refresh();
  });

  return (
    <Sheet
      open={open} onOpenChange={onOpenChange}
      title="New opportunity"
      description="A tradeable location on one of your paths."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!form.setupName || !form.instrumentId}>
            Add opportunity
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Instrument">
            <Select value={form.instrumentId} onChange={(e) => setForm({ ...form, instrumentId: e.target.value })}>
              {instruments.map((i) => <option key={i.id} value={i.id}>{i.symbol}</option>)}
            </Select>
          </Field>
          <Field label="On which hypothesis">
            <Select
              value={form.hypothesisId} placeholder="Standalone"
              onChange={(e) => setForm({ ...form, hypothesisId: e.target.value })}
            >
              {hypotheses.map((h) => <option key={h.id} value={h.id}>{h.rank}. {h.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Setup">
          <Input
            autoFocus value={form.setupName} placeholder="Failed auction at the ONH"
            onChange={(e) => setForm({ ...form, setupName: e.target.value })}
          />
        </Field>
        <Field label="Location">
          <Input value={form.locationNote} onChange={(e) => setForm({ ...form, locationNote: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entry trigger">
            <Input value={form.entryTrigger} onChange={(e) => setForm({ ...form, entryTrigger: e.target.value })} />
          </Field>
          <Field label="Target">
            <Input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          </Field>
        </div>
        <Field label="Primary edge domain">
          <Select
            value={form.primaryEdgeDomainId} placeholder="—"
            onChange={(e) => setForm({ ...form, primaryEdgeDomainId: e.target.value })}
          >
            {domains.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <Field label="Potential" hint="ticks">
            <NumberInput value={form.potentialTicks} onChange={(e) => setForm({ ...form, potentialTicks: e.target.value })} />
          </Field>
          <Field label="Probability" hint="%">
            <NumberInput value={form.estimatedProbability} onChange={(e) => setForm({ ...form, estimatedProbability: e.target.value })} />
          </Field>
          <div className="pb-5">
            <div className="label mb-1">Asymmetry</div>
            <div className="text-20 num font-[590] tabular-nums">{asymmetry.toFixed(1)}</div>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
