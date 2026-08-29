"use client";
import * as React from "react";
import { Card } from "@/components/ui/surface";
import { Button, TextButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { runQuery, saveQuery, deleteQuery, listQueries } from "@/app/actions/sql";

const EXAMPLES = [
  {
    name: "Conflicting central banks, first 30 minutes of RTH",
    sql: `select day, instrument_symbol, entry_local_hhmm, net_pnl, r_multiple
from trade_facts
where primary_domain_key = 'central_banks'
  and primary_domain_alignment = 'conflicting'
  and entry_local_time between time '14:30' and time '15:00'
order by day desc`,
  },
  {
    name: "Expectancy by day type",
    sql: `select actual_day_type, count(*) as n,
       round(avg(net_pnl), 2) as expectancy,
       round(sum(net_pnl), 2) as net
from trade_facts
group by 1 order by n desc`,
  },
  {
    name: "Levels that keep breaking",
    sql: `select level_type_label, count(*) as n,
       count(*) filter (where reaction = 'broke') as broke
from level_facts
where reaction is not null
group by 1 order by broke desc`,
  },
];

/**
 * Read-only escape hatch. The transaction is read-only, statement-timeout
 * capped, and still runs under the trader's own RLS — so the console cannot see
 * anything the rest of the app could not.
 */
export function SqlConsole() {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(EXAMPLES[0].sql);
  const [rows, setRows] = React.useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<{ id: string; name: string; sql: string }[]>([]);
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    void listQueries().then((r) => { if (r.ok) setSaved(r.data); });
  }, [open]);

  const execute = () => start(async () => {
    setError(null);
    const res = await runQuery(text);
    if (!res.ok) { setError(res.error); setRows(null); return; }
    setRows(res.data);
  });

  if (!open) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-13 font-[590]">SQL console</h3>
            <p className="text-11 text-[var(--text-tertiary)] mt-0.5">
              Read-only, against trade_facts, level_facts and day_facts.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>Open</Button>
        </div>
      </Card>
    );
  }

  const columns = rows?.length ? Object.keys(rows[0]) : [];

  return (
    <Card className="p-4 min-w-0">
      <header className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-13 font-[590]">SQL console</h3>
        <TextButton onClick={() => setOpen(false)}>Close</TextButton>
      </header>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {EXAMPLES.map((e) => (
          <button
            key={e.name}
            type="button"
            onClick={() => setText(e.sql)}
            className="text-11 px-2 h-6 rounded-[var(--r-pill)] bg-[var(--bg-hover)] hover:bg-[var(--bg-active)]"
          >
            {e.name}
          </button>
        ))}
        {saved.map((q) => (
          <span key={q.id} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => setText(q.sql)}
              className="text-11 px-2 h-6 rounded-l-[var(--r-pill)] bg-[var(--accent-quiet)] text-[var(--accent)]"
            >
              {q.name}
            </button>
            <button
              type="button"
              aria-label={`Delete query ${q.name}`}
              onClick={() => start(async () => {
                await deleteQuery(q.id);
                setSaved((s) => s.filter((x) => x.id !== q.id));
              })}
              className="text-11 px-1.5 h-6 rounded-r-[var(--r-pill)] bg-[var(--accent-quiet)]
                         text-[var(--text-tertiary)] hover:text-[var(--neg)]"
            >×</button>
          </span>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); execute(); }
        }}
        rows={8}
        spellCheck={false}
        aria-label="SQL query"
        className="w-full mono text-12 bg-[var(--bg-sunken)] border border-[var(--line-strong)]
                   rounded-[var(--r-input)] p-2.5 leading-[1.5] focus:border-[var(--accent)]
                   focus:outline-none focus:ring-2 focus:ring-[var(--accent-quiet)]"
      />

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <Button variant="primary" size="sm" onClick={execute} disabled={pending}>
          Run
        </Button>
        <span className="text-11 text-[var(--text-tertiary)]">⌘↵</span>
        <span className="flex-1" />
        <Input
          value={name} placeholder="Save as…" className="h-7 py-0 w-[160px] text-12"
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          size="sm" disabled={!name.trim()}
          onClick={() => start(async () => {
            const res = await saveQuery(name, text);
            if (!res.ok) { toast(res.error); return; }
            setSaved((s) => [...s.filter((x) => x.name !== name), { id: res.data, name, sql: text }]);
            setName("");
            toast("Query saved.");
          })}
        >
          Save
        </Button>
      </div>

      {error && (
        <p className="text-12 text-[var(--neg)] mt-3 mono">{error}</p>
      )}

      {rows && (
        <div className="mt-3">
          <p className="text-11 text-[var(--text-tertiary)] mb-1.5 num">
            {rows.length} rows{rows.length === 500 && " (capped at 500)"}
          </p>
          {rows.length === 0 ? (
            <p className="text-12 text-[var(--text-tertiary)]">The query returned nothing.</p>
          ) : (
            <div className="overflow-auto max-h-[420px] border border-[var(--line)] rounded-[var(--r-input)]">
              <table className="w-full text-11 border-collapse">
                <thead className="sticky top-0 bg-[var(--bg-raised)]">
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className="label font-[560] text-left px-2 py-1.5 whitespace-nowrap
                                             border-b border-[var(--line)]">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-[var(--line)] last:border-0">
                      {columns.map((c) => (
                        <td key={c} className="px-2 py-1 mono whitespace-nowrap">
                          {format(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function format(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
