"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import { Card, EmptyState } from "@/components/ui/surface";
import { Button, TextButton } from "@/components/ui/button";
import { Field, Input, NumberInput, Select } from "@/components/ui/field";
import { Pill, DomainDot } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import {
  archiveTag, createEdgeDomain, createLevelType, createRule, createTag,
  deleteRule, updateRule, upsertInstrument,
} from "@/app/actions/library";
import { humanise } from "@/lib/format";
import { num } from "@/lib/pnl";
import { cn } from "@/lib/cn";
import type { EdgeDomain, Instrument, LevelType, Rule, Tag } from "@/lib/queries/reference";

const TAB = "px-3 h-8 rounded-[var(--r-input)] text-13 data-[state=active]:bg-[var(--accent-quiet)] " +
  "data-[state=active]:text-[var(--accent)] data-[state=active]:font-[560] " +
  "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors duration-[var(--d-fast)]";

export function LibraryView({
  instruments, domains, levelTypes, tags, rules,
}: {
  instruments: Instrument[]; domains: EdgeDomain[]; levelTypes: LevelType[];
  tags: Tag[]; rules: Rule[];
}) {
  return (
    <div className="min-w-0 max-w-[1000px]">
      <header className="mb-4">
        <h1 className="text-24 font-[590] tracking-[-0.018em]">Library</h1>
        <p className="text-12 text-[var(--text-secondary)] mt-0.5">
          The vocabulary the rest of the app is written in. Nothing here is hard-coded.
        </p>
      </header>

      <Tabs.Root defaultValue="rules">
        <Tabs.List className="flex flex-wrap gap-1 mb-4" aria-label="Library sections">
          {[["rules", "Rules"], ["tags", "Tags"], ["domains", "Edge domains"],
            ["levels", "Level types"], ["instruments", "Instruments"]].map(([value, label]) => (
            <Tabs.Trigger key={value} value={value} className={TAB}>{label}</Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="rules"><RulesPanel rules={rules} /></Tabs.Content>
        <Tabs.Content value="tags"><TagsPanel tags={tags} /></Tabs.Content>
        <Tabs.Content value="domains"><DomainsPanel domains={domains} /></Tabs.Content>
        <Tabs.Content value="levels"><LevelTypesPanel levelTypes={levelTypes} /></Tabs.Content>
        <Tabs.Content value="instruments"><InstrumentsPanel instruments={instruments} /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function RulesPanel({ rules }: { rules: Rule[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [text, setText] = React.useState("");

  return (
    <Card className="p-4">
      <p className="text-12 text-[var(--text-secondary)] mb-3 max-w-[62ch]">
        The rules you hold yourself to. Checked at the end of every day, which is how process
        adherence becomes a number you can plot against results.
      </p>

      {rules.length === 0 ? (
        <EmptyState
          title="No rules yet."
          body='Start with one you actually break: "be flat before any major scheduled release".'
        />
      ) : (
        <ul className="space-y-1 mb-3">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2.5 py-1.5 border-b border-[var(--line)] last:border-0">
              <span className="text-13 flex-1">{r.text}</span>
              <TextButton
                onClick={() => start(async () => {
                  await updateRule(r.id, { active: false });
                  toast("Rule retired. Past checks are untouched.");
                  router.refresh();
                })}
              >
                Retire
              </TextButton>
              <button
                type="button" aria-label={`Delete rule: ${r.text}`}
                onClick={() => start(async () => {
                  await deleteRule(r.id);
                  toast("Rule deleted, with every check of it.");
                  router.refresh();
                })}
                className="text-[var(--text-tertiary)] hover:text-[var(--neg)] px-1"
              >×</button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <Field label="New rule" className="flex-1">
          <Input
            value={text} placeholder="Be flat before any major scheduled release"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) {
                start(async () => {
                  const res = await createRule({ text, sortOrder: rules.length * 10 });
                  if (!res.ok) { toast(res.error); return; }
                  setText(""); router.refresh();
                });
              }
            }}
          />
        </Field>
        <Button
          disabled={!text.trim()}
          onClick={() => start(async () => {
            const res = await createRule({ text, sortOrder: rules.length * 10 });
            if (!res.ok) { toast(res.error); return; }
            setText(""); router.refresh();
          })}
        >
          Add
        </Button>
      </div>
    </Card>
  );
}

const TAG_CATEGORIES = ["setup", "location", "context", "execution", "error", "emotion", "custom"];

function TagsPanel({ tags }: { tags: Tag[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [label, setLabel] = React.useState("");
  const [category, setCategory] = React.useState("setup");

  const add = () => start(async () => {
    const res = await createTag({ label, category });
    if (!res.ok) { toast(res.error); return; }
    setLabel("");
    router.refresh();
  });

  return (
    <Card className="p-4">
      <p className="text-12 text-[var(--text-secondary)] mb-3 max-w-[62ch]">
        One canonical spelling per idea. Autocomplete everywhere means the same mistake never
        ends up recorded three different ways.
      </p>

      <div className="space-y-3 mb-4">
        {TAG_CATEGORIES.map((cat) => {
          const inCategory = tags.filter((t) => t.category === cat);
          if (!inCategory.length) return null;
          return (
            <div key={cat}>
              <div className="label mb-1.5">{humanise(cat)}</div>
              <ul className="flex flex-wrap gap-1.5">
                {inCategory.map((t) => (
                  <li key={t.id}>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-[var(--r-pill)] text-12",
                        cat === "error" ? "bg-[var(--neg-quiet)] text-[var(--neg)]" : "bg-[var(--bg-hover)]",
                      )}
                    >
                      {t.label}
                      <button
                        type="button" aria-label={`Archive ${t.label}`}
                        onClick={() => start(async () => {
                          await archiveTag(t.id, true);
                          toast(`Archived "${t.label}". Trades keep it.`);
                          router.refresh();
                        })}
                        className="text-[var(--text-tertiary)] hover:text-[var(--neg)] px-0.5"
                      >×</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {tags.length === 0 && (
          <EmptyState
            title="No tags yet."
            body="Add the ones you already say out loud: 'chased', 'late entry', 'good location', 'sized down correctly'."
          />
        )}
      </div>

      <div className="flex items-end gap-2">
        <Field label="Label" className="flex-1">
          <Input
            value={label} placeholder="Chased the entry"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && label.trim()) add(); }}
          />
        </Field>
        <Field label="Category" className="w-[160px]">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {TAG_CATEGORIES.map((c) => <option key={c} value={c}>{humanise(c)}</option>)}
          </Select>
        </Field>
        <Button disabled={!label.trim()} onClick={add}>Add</Button>
      </div>
    </Card>
  );
}

function DomainsPanel({ domains }: { domains: EdgeDomain[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [form, setForm] = React.useState({ key: "", label: "", description: "" });

  return (
    <Card className="p-4">
      <p className="text-12 text-[var(--text-secondary)] mb-3 max-w-[62ch]">
        The five Axia domains are rows, not an enum. Adding a sixth leaves every historical
        assessment exactly as it was — nothing is rewritten or reinterpreted.
      </p>

      <ul className="space-y-2 mb-4">
        {domains.map((d) => (
          <li
            key={d.id}
            className="pl-2.5 border-l-2 py-1"
            style={{ borderColor: `var(--dom-${d.key}, var(--line-strong))` }}
          >
            <div className="flex items-baseline gap-2">
              <DomainDot domainKey={d.key} />
              <span className="text-13 font-[590]">{d.label}</span>
              <code className="text-11 mono text-[var(--text-tertiary)]">{d.key}</code>
              {d.userId && <Pill tone="accent">yours</Pill>}
            </div>
            {d.description && (
              <p className="text-12 text-[var(--text-secondary)] mt-0.5">{d.description}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto] items-end">
        <Field label="Key" hint="lower_snake_case">
          <Input
            value={form.key} placeholder="positioning"
            onChange={(e) => setForm({ ...form, key: e.target.value })}
          />
        </Field>
        <Field label="Label">
          <Input
            value={form.label} placeholder="Positioning"
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </Field>
        <Button
          className="mb-5"
          disabled={!form.key || !form.label}
          onClick={() => start(async () => {
            const res = await createEdgeDomain({ ...form, sortOrder: domains.length + 1 });
            if (!res.ok) { toast(res.error); return; }
            setForm({ key: "", label: "", description: "" });
            toast("Domain added. It appears in every future debrief grid.");
            router.refresh();
          })}
        >
          Add domain
        </Button>
      </div>
      <p className="text-11 text-[var(--text-tertiary)] mt-1">
        A new domain has no colour token yet, so it shows in the neutral grey until one is added
        to app/tokens.css as <code className="mono">--dom-&lt;key&gt;</code>.
      </p>
    </Card>
  );
}

function LevelTypesPanel({ levelTypes }: { levelTypes: LevelType[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [form, setForm] = React.useState({ key: "", label: "", grouping: "chart" });

  const groups = [...new Set(levelTypes.map((t) => t.grouping))];

  return (
    <Card className="p-4">
      {groups.map((g) => (
        <div key={g} className="mb-3">
          <div className="label mb-1.5">{humanise(g)}</div>
          <ul className="flex flex-wrap gap-1.5">
            {levelTypes.filter((t) => t.grouping === g).map((t) => (
              <li key={t.id} className="text-12 px-2 py-0.5 rounded-[var(--r-pill)] bg-[var(--bg-hover)]">
                {t.label}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="grid gap-2 sm:grid-cols-[130px_1fr_130px_auto] items-end mt-4">
        <Field label="Key"><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /></Field>
        <Field label="Label"><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
        <Field label="Group">
          <Input value={form.grouping} onChange={(e) => setForm({ ...form, grouping: e.target.value })} />
        </Field>
        <Button
          className="mb-1"
          disabled={!form.key || !form.label}
          onClick={() => start(async () => {
            const res = await createLevelType({ ...form, sortOrder: levelTypes.length + 1 });
            if (!res.ok) { toast(res.error); return; }
            setForm({ key: "", label: "", grouping: "chart" });
            router.refresh();
          })}
        >
          Add
        </Button>
      </div>
    </Card>
  );
}

function InstrumentsPanel({ instruments }: { instruments: Instrument[] }) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [editing, setEditing] = React.useState<Instrument | null>(null);

  return (
    <Card className="p-4 overflow-x-auto">
      <p className="text-12 text-[var(--text-secondary)] mb-3 max-w-[62ch]">
        Tick size and tick value drive every P&L figure in the app. RTH times are exchange-local;
        the app converts them for display.
      </p>
      <table className="w-full text-12 border-collapse min-w-[720px]">
        <thead>
          <tr>
            {["Symbol", "Name", "Exchange", "Group", "Tick size", "Tick value", "Point value", "RTH", ""]
              .map((h) => (
                <th key={h} className="label font-[560] text-left py-1.5 pr-3 whitespace-nowrap">{h}</th>
              ))}
          </tr>
        </thead>
        <tbody>
          {instruments.map((i) => (
            <tr key={i.id} className="border-t border-[var(--line)]">
              <td className="py-1.5 pr-3 mono font-[560]">{i.symbol}</td>
              <td className="py-1.5 pr-3">{i.name}</td>
              <td className="py-1.5 pr-3 text-[var(--text-secondary)]">{i.exchange}</td>
              <td className="py-1.5 pr-3 text-[var(--text-secondary)]">{humanise(i.productGroup)}</td>
              <td className="py-1.5 pr-3 mono">{num(i.tickSize)}</td>
              <td className="py-1.5 pr-3 mono">{num(i.tickValue)}</td>
              <td className="py-1.5 pr-3 mono">{num(i.pointValue)}</td>
              <td className="py-1.5 pr-3 mono text-[var(--text-secondary)]">
                {i.rthOpen.slice(0, 5)}–{i.rthClose.slice(0, 5)}
              </td>
              <td className="py-1.5">
                {i.userId ? <Pill tone="accent">yours</Pill> : (
                  <TextButton onClick={() => setEditing(i)}>Override</TextButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="mt-4 pt-4 border-t border-[var(--line)]">
          <h3 className="text-13 font-[590] mb-2">Your own {editing.symbol}</h3>
          <p className="text-12 text-[var(--text-secondary)] mb-3">
            Saves a copy you own. The shared catalogue entry is left alone.
          </p>
          <InstrumentForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(values) => start(async () => {
              const res = await upsertInstrument(values);
              if (!res.ok) { toast(res.error); return; }
              setEditing(null);
              toast(`${editing.symbol} saved.`);
              router.refresh();
            })}
          />
        </div>
      )}
    </Card>
  );
}

function InstrumentForm({
  initial, onSave, onCancel,
}: {
  initial: Instrument;
  onSave: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = React.useState({
    symbol: initial.symbol, name: initial.name, exchange: initial.exchange,
    productGroup: initial.productGroup,
    tickSize: String(num(initial.tickSize)), tickValue: String(num(initial.tickValue)),
    pointValue: String(num(initial.pointValue)), currency: initial.currency,
    rthOpen: initial.rthOpen.slice(0, 5), rthClose: initial.rthClose.slice(0, 5),
    sortOrder: String(initial.sortOrder),
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <Field label="Symbol"><Input value={form.symbol} onChange={(e) => set({ symbol: e.target.value })} /></Field>
      <Field label="Name" className="sm:col-span-2">
        <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Exchange"><Input value={form.exchange} onChange={(e) => set({ exchange: e.target.value })} /></Field>
      <Field label="Tick size"><NumberInput value={form.tickSize} onChange={(e) => set({ tickSize: e.target.value })} /></Field>
      <Field label="Tick value"><NumberInput value={form.tickValue} onChange={(e) => set({ tickValue: e.target.value })} /></Field>
      <Field label="Point value"><NumberInput value={form.pointValue} onChange={(e) => set({ pointValue: e.target.value })} /></Field>
      <Field label="Currency"><Input value={form.currency} maxLength={3} onChange={(e) => set({ currency: e.target.value })} /></Field>
      <Field label="RTH open"><Input type="time" className="mono" value={form.rthOpen} onChange={(e) => set({ rthOpen: e.target.value })} /></Field>
      <Field label="RTH close"><Input type="time" className="mono" value={form.rthClose} onChange={(e) => set({ rthClose: e.target.value })} /></Field>
      <div className="sm:col-span-2 flex items-end gap-2">
        <Button variant="primary" onClick={() => onSave(form)}>Save override</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
