"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Divider } from "@/components/ui/surface";
import { Button, TextButton } from "@/components/ui/button";
import { Field, Input, NumberInput, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { deleteTemplate, updateSettings } from "@/app/actions/library";

const ZONES = ["Europe/Lisbon", "Europe/London", "Europe/Berlin", "America/New_York", "UTC"];

export function SettingsView({
  email, settings, instruments, templates,
}: {
  email: string | null;
  settings: { timezone: string; minSampleSize: number; defaultInstrumentId: string | null };
  instruments: { id: string; symbol: string; name: string }[];
  templates: { id: string; name: string; kind: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [form, setForm] = React.useState({
    timezone: settings.timezone,
    minSampleSize: String(settings.minSampleSize),
    defaultInstrumentId: settings.defaultInstrumentId ?? "",
  });

  const save = (patch: Record<string, unknown>) => start(async () => {
    const res = await updateSettings(patch);
    if (!res.ok) { toast(res.error); return; }
    router.refresh();
  });

  return (
    <div className="min-w-0 max-w-[720px] space-y-3">
      <header className="mb-1">
        <h1 className="text-24 font-[590] tracking-[-0.018em]">Settings</h1>
        {email && <p className="text-12 [color:var(--text-secondary)] mt-0.5">{email}</p>}
      </header>

      <Card className="p-4 space-y-3">
        <h2 className="label">Defaults</h2>
        <Field label="Timezone" hint="All times are stored in UTC and shown in this zone.">
          <Select
            value={form.timezone}
            onChange={(e) => { setForm({ ...form, timezone: e.target.value }); save({ timezone: e.target.value }); }}
          >
            {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </Select>
        </Field>

        <Field
          label="Minimum sample size"
          hint="Analyses below this grey themselves out. Thirty is the conventional floor; four trades is a story, not a finding."
        >
          <NumberInput
            value={form.minSampleSize}
            onChange={(e) => setForm({ ...form, minSampleSize: e.target.value })}
            onBlur={() => save({ minSampleSize: form.minSampleSize })}
          />
        </Field>

        <Field label="Default instrument" hint="Pre-selected in quick trade entry.">
          <Select
            value={form.defaultInstrumentId} placeholder="ES"
            onChange={(e) => {
              setForm({ ...form, defaultInstrumentId: e.target.value });
              save({ defaultInstrumentId: e.target.value || null });
            }}
          >
            {instruments.map((i) => <option key={i.id} value={i.id}>{i.symbol} — {i.name}</option>)}
          </Select>
        </Field>
      </Card>

      <Card className="p-4">
        <h2 className="label mb-2">Templates</h2>
        {templates.length === 0 ? (
          <p className="text-12 [color:var(--text-secondary)]">
            No templates saved. Save one from an instrument prep or a hypothesis and it can be
            instantiated into any day with one click.
          </p>
        ) : (
          <ul className="space-y-1">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-1 border-b border-[var(--line)] last:border-0">
                <span className="text-13 flex-1">{t.name}</span>
                <span className="text-11 [color:var(--text-tertiary)]">{t.kind.replace(/_/g, " ")}</span>
                <button
                  type="button" aria-label={`Delete template ${t.name}`}
                  onClick={() => start(async () => { await deleteTemplate(t.id); router.refresh(); })}
                  className="[color:var(--text-tertiary)] hover:[color:var(--neg)] px-1"
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="label mb-2">Teaching layer</h2>
        <p className="text-12 [color:var(--text-secondary)] mb-3 max-w-[62ch]">
          The "why this matters" notes collapse themselves once a section has been used five times.
          Resetting brings them all back, expanded.
        </p>
        <Button
          onClick={() => {
            try {
              for (const key of Object.keys(localStorage)) {
                if (key.startsWith("explainer-")) localStorage.removeItem(key);
              }
              toast("Explainers reset. Reload to see them.");
            } catch {
              toast("Local storage is unavailable in this browser.");
            }
          }}
        >
          Reset explainers
        </Button>
      </Card>

      <Card className="p-4">
        <h2 className="label mb-2">Data</h2>
        <p className="text-12 [color:var(--text-secondary)] mb-3 max-w-[62ch]">
          Everything, in the normalised shape the database holds it in. Trades, level interactions
          and day rollups, ready for a notebook.
        </p>
        <div className="flex gap-2">
          <a href="/api/export?format=full" download>
            <Button>Export everything as JSON</Button>
          </a>
          <a href="/api/export?format=csv" download>
            <Button variant="ghost">Trades as CSV</Button>
          </a>
        </div>
      </Card>
    </div>
  );
}
