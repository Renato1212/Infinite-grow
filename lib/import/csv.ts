/**
 * A neutral CSV reader plus a column-name guesser. Broker-specific presets
 * (Rithmic, and whatever comes next) become extra entries in ALIASES or a
 * dedicated preset module — the importer UI never has to change.
 */

export interface Mapping {
  symbol: string;
  side: string;
  price: string;
  quantity: string;
  executedAt: string;
  externalId?: string;
}

export interface ImportRow {
  symbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  executedAt: string;
  externalId: string | null;
}

/** RFC-4180-ish: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);

  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows };
}

const ALIASES: Record<keyof Mapping, string[]> = {
  symbol: ["symbol", "instrument", "contract", "ticker", "product"],
  side: ["side", "b/s", "buysell", "buy/sell", "direction", "action"],
  price: ["price", "fillprice", "avgprice", "executionprice"],
  quantity: ["quantity", "qty", "size", "filledqty", "volume"],
  executedAt: ["time", "timestamp", "datetime", "filltime", "executedat", "date/time", "transactiontime"],
  externalId: ["id", "fillid", "orderid", "executionid", "tradeid"],
};

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z/]/g, "");

export function guessMapping(headers: string[]): Mapping {
  const pick = (key: keyof Mapping): string => {
    const wanted = ALIASES[key];
    const exact = headers.find((h) => wanted.includes(normalise(h)));
    if (exact) return exact;
    const partial = headers.find((h) => wanted.some((w) => normalise(h).includes(w)));
    return partial ?? "";
  };
  return {
    symbol: pick("symbol"), side: pick("side"), price: pick("price"),
    quantity: pick("quantity"), executedAt: pick("executedAt"), externalId: pick("externalId"),
  };
}

export function toRows(
  table: { headers: string[]; rows: string[][] },
  mapping: Mapping,
): ImportRow[] {
  const index = (name: string) => table.headers.indexOf(name);
  const cols = {
    symbol: index(mapping.symbol), side: index(mapping.side),
    price: index(mapping.price), quantity: index(mapping.quantity),
    executedAt: index(mapping.executedAt),
    externalId: mapping.externalId ? index(mapping.externalId) : -1,
  };
  if (Object.entries(cols).some(([k, v]) => v < 0 && k !== "externalId")) return [];

  const out: ImportRow[] = [];
  for (const row of table.rows) {
    const rawSide = (row[cols.side] ?? "").trim().toLowerCase();
    const side = /^(b|buy|bot|bought|long)$/.test(rawSide) ? "buy"
      : /^(s|sell|sld|sold|short)$/.test(rawSide) ? "sell" : null;
    const price = Number((row[cols.price] ?? "").replace(/[^0-9.\-]/g, ""));
    const quantity = Math.abs(Number((row[cols.quantity] ?? "").replace(/[^0-9.\-]/g, "")));
    const symbol = (row[cols.symbol] ?? "").trim();
    const at = (row[cols.executedAt] ?? "").trim();

    if (!side || !symbol || !at || !Number.isFinite(price) || !(quantity > 0)) continue;
    out.push({
      symbol: rootSymbol(symbol), side, price, quantity, executedAt: at,
      externalId: cols.externalId >= 0 ? (row[cols.externalId] ?? "").trim() || null : null,
    });
  }
  return out;
}

/** ESZ5, ES 12-25, ESH2026 → ES. Brokers name contracts, we trade products. */
export function rootSymbol(raw: string): string {
  const cleaned = raw.trim().toUpperCase();
  const m = /^([A-Z0-9]{1,4}?)[ _-]?(?:[FGHJKMNQUVXZ]\d{1,4}|\d{1,2}-\d{2})$/.exec(cleaned);
  return (m?.[1] ?? cleaned).replace(/[^A-Z0-9]/g, "");
}
