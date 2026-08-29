"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput, Select, Checkbox } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { useToast } from "@/components/ui/toast";
import { createQuickTrade } from "@/app/actions/trades";
import { computeFromAverages, num } from "@/lib/pnl";
import { signedMoney, pnlTone } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { CockpitProps } from "./types";

const nowHHMM = () => new Date().toLocaleTimeString("en-GB", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon",
});

/**
 * Six trades in under a minute of typing. Instrument, direction, size, prices,
 * times — and nothing else. Tags, domains and the debrief happen later.
 */
export function QuickTrade({
  dayId, date, instruments, hypotheses, sessions, autoFocus, onCreated,
}: {
  dayId: string; date: string;
  instruments: CockpitProps["instruments"];
  hypotheses: CockpitProps["bundle"]["hypotheses"];
  sessions: CockpitProps["bundle"]["sessions"];
  autoFocus?: boolean;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = React.useTransition();
  const firstField = React.useRef<HTMLSelectElement>(null);

  const [form, setForm] = React.useState({
    instrumentId: "", direction: "long", size: "1",
    entryPrice: "", exitPrice: "", entryTime: "", exitTime: "",
    planned: true, commissions: "",
  });

  React.useEffect(() => {
    setForm((f) => ({
      ...f,
      instrumentId: f.instrumentId || instruments.find((i) => i.symbol === "ES")?.id || instruments[0]?.id || "",
      entryTime: f.entryTime || nowHHMM(),
    }));
  }, [instruments]);

  React.useEffect(() => { if (autoFocus) firstField.current?.focus(); }, [autoFocus]);

  const instrument = instruments.find((i) => i.id === form.instrumentId);
  const preview = instrument && form.entryPrice
    ? computeFromAverages(
        num(form.entryPrice), form.exitPrice ? num(form.exitPrice) : null,
        num(form.size, 1), form.direction as "long" | "short",
        { tickSize: num(instrument.tickSize), tickValue: num(instrument.tickValue) },
        { commissions: num(form.commissions) },
      )
    : null;

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => start(async () => {
    const res = await createQuickTrade(dayId, date, {
      ...form,
      exitTime: form.exitTime || null,
      exitPrice: form.exitPrice || null,
    });
    if (!res.ok) { toast(res.error); return; }
    toast("Trade logged. Tag and debrief it later from the queue.");
    setForm((f) => ({
      ...f, entryPrice: "", exitPrice: "", entryTime: nowHHMM(), exitTime: "",
    }));
    firstField.current?.focus();
    onCreated?.();
    router.refresh();
  });

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && form.entryPrice && form.instrumentId) { e.preventDefault(); submit(); }
  };

  return (
    <Card className="p-3.5">
      <div className="flex flex-wrap items-end gap-2.5" onKeyDown={onEnter}>
        <Field label="Instrument" className="w-[112px]">
          <Select
            ref={firstField} value={form.instrumentId} className="h-8 py-0"
            onChange={(e) => set({ instrumentId: e.target.value })}
          >
            {instruments.map((i) => <option key={i.id} value={i.id}>{i.symbol}</option>)}
          </Select>
        </Field>

        <Field label="Side" className="w-[92px]">
          <Select
            value={form.direction} className="h-8 py-0"
            onChange={(e) => set({ direction: e.target.value })}
          >
            <option value="long">↑ Long</option>
            <option value="short">↓ Short</option>
          </Select>
        </Field>

        <Field label="Size" className="w-[68px]">
          <NumberInput value={form.size} className="h-8 py-0" onChange={(e) => set({ size: e.target.value })} />
        </Field>

        <Field label="Entry" className="w-[104px]">
          <NumberInput value={form.entryPrice} className="h-8 py-0" onChange={(e) => set({ entryPrice: e.target.value })} />
        </Field>

        <Field label="Exit" className="w-[104px]">
          <NumberInput value={form.exitPrice} className="h-8 py-0" onChange={(e) => set({ exitPrice: e.target.value })} />
        </Field>

        <Field label="In" className="w-[84px]">
          <Input type="time" value={form.entryTime} className="h-8 py-0 mono" onChange={(e) => set({ entryTime: e.target.value })} />
        </Field>

        <Field label="Out" className="w-[84px]">
          <Input type="time" value={form.exitTime} className="h-8 py-0 mono" onChange={(e) => set({ exitTime: e.target.value })} />
        </Field>

        <Field label="Comms" className="w-[76px]">
          <NumberInput value={form.commissions} className="h-8 py-0" onChange={(e) => set({ commissions: e.target.value })} />
        </Field>

        <div className="pb-1.5">
          <Checkbox
            label="In the plan"
            checked={form.planned}
            onChange={(e) => set({ planned: e.target.checked })}
          />
        </div>

        {preview?.avgExitPrice !== null && preview && (
          <div className="pb-0.5 min-w-[110px]">
            <div className="label">Net</div>
            <div className={cn(
              "text-15 num font-[590]",
              pnlTone(preview.netPnl) === "pos" && "[color:var(--pos)]",
              pnlTone(preview.netPnl) === "neg" && "[color:var(--neg)]",
            )}>
              {signedMoney(preview.netPnl)}
            </div>
            <div className="text-11 [color:var(--text-tertiary)] num">
              {preview.ticksCaptured} ticks
            </div>
          </div>
        )}

        <Button
          variant="primary" onClick={submit}
          disabled={pending || !form.instrumentId || !form.entryPrice || !form.entryTime}
          className="h-8"
        >
          Log trade
        </Button>
      </div>
      <p className="text-11 [color:var(--text-tertiary)] mt-2">
        Enter submits. Leave the exit blank for a position that is still open.
      </p>
    </Card>
  );
}
