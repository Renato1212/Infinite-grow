"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { Button, TextButton } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { importExecutions } from "@/app/actions/trades";
import { parseCsv, guessMapping, toRows, type Mapping } from "@/lib/import/csv";

const FIELDS: { key: keyof Mapping; label: string; required: boolean }[] = [
  { key: "symbol", label: "Symbol", required: true },
  { key: "side", label: "Side (buy/sell)", required: true },
  { key: "price", label: "Price", required: true },
  { key: "quantity", label: "Quantity", required: true },
  { key: "executedAt", label: "Timestamp", required: true },
  { key: "externalId", label: "Fill id (optional)", required: false },
];

/**
 * Preview-and-confirm import of fills. The parser is generic over column names;
 * a Rithmic-specific preset drops into lib/import/ without touching this.
 */
export function CsvImport({ dayId, date }: { dayId: string; date: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [, start] = React.useTransition();
  const [table, setTable] = React.useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = React.useState<Mapping | null>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.headers.length) { toast("That file has no header row."); return; }
    setTable(parsed);
    setMapping(guessMapping(parsed.headers));
  };

  const preview = table && mapping ? toRows(table, mapping).slice(0, 8) : [];
  const total = table && mapping ? toRows(table, mapping).length : 0;

  return (
    <>
      <TextButton onClick={() => setOpen(true)}>Import fills</TextButton>
      <Sheet
        open={open} onOpenChange={setOpen} wide
        title="Import fills"
        description="Drop a CSV of executions. Fills are grouped into trades by symbol, closing a trade whenever the position goes flat."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary" disabled={!total}
              onClick={() => start(async () => {
                if (!table || !mapping) return;
                const res = await importExecutions(dayId, date, toRows(table, mapping));
                if (!res.ok) { toast(res.error); return; }
                toast(`Imported ${res.data.created} trades${res.data.skipped ? `, skipped ${res.data.skipped} rows with unknown symbols` : ""}.`);
                setOpen(false);
                setTable(null);
                router.refresh();
              })}
            >
              Import {total || ""} fills
            </Button>
          </>
        }
      >
        {!table ? (
          <label
            className="block border border-dashed border-[var(--line-strong)] rounded-[var(--r-lg)]
                       p-8 text-center cursor-pointer hover:bg-[var(--bg-hover)]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) void onFile(file);
            }}
          >
            <span className="text-13">Drop a CSV here, or choose a file</span>
            <input
              type="file" accept=".csv,text/csv" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            />
          </label>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <div className="label mb-1">{f.label}</div>
                  <Select
                    value={mapping?.[f.key] ?? ""}
                    placeholder="—"
                    onChange={(e) => setMapping((m) => ({ ...(m as Mapping), [f.key]: e.target.value }))}
                  >
                    {table.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </div>
              ))}
            </div>

            <div>
              <div className="label mb-1.5">Preview — first {preview.length} of {total}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-12 border-collapse">
                  <thead>
                    <tr>
                      {["Symbol", "Side", "Price", "Qty", "At"].map((h) => (
                        <th key={h} className="label font-[560] text-left px-2 py-1">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-t border-[var(--line)]">
                        <td className="px-2 py-1 mono">{r.symbol}</td>
                        <td className="px-2 py-1">{r.side}</td>
                        <td className="px-2 py-1 mono">{r.price}</td>
                        <td className="px-2 py-1 num">{r.quantity}</td>
                        <td className="px-2 py-1 mono">{r.executedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <TextButton onClick={() => { setTable(null); setMapping(null); }}>
              Choose a different file
            </TextButton>
          </div>
        )}
      </Sheet>
    </>
  );
}
