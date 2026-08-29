import { describe, it, expect } from "vitest";
import { parseCsv, guessMapping, toRows, rootSymbol } from "./csv";

describe("csv parsing", () => {
  it("handles quoted fields, doubled quotes and CRLF", () => {
    const { headers, rows } = parseCsv(
      'Symbol,Note,Qty\r\n"ES","he said ""buy""",2\r\nNQ,plain,1\r\n',
    );
    expect(headers).toEqual(["Symbol", "Note", "Qty"]);
    expect(rows).toEqual([["ES", 'he said "buy"', "2"], ["NQ", "plain", "1"]]);
  });

  it("drops trailing blank lines", () => {
    expect(parseCsv("A,B\n1,2\n\n\n").rows).toEqual([["1", "2"]]);
  });
});

describe("column guessing", () => {
  it("finds the usual broker column names", () => {
    const m = guessMapping(["Fill Id", "Instrument", "B/S", "Fill Price", "Filled Qty", "Transaction Time"]);
    expect(m.symbol).toBe("Instrument");
    expect(m.side).toBe("B/S");
    expect(m.price).toBe("Fill Price");
    expect(m.quantity).toBe("Filled Qty");
    expect(m.executedAt).toBe("Transaction Time");
    expect(m.externalId).toBe("Fill Id");
  });
});

describe("row conversion", () => {
  const table = parseCsv(
    [
      "Symbol,Side,Price,Qty,Time",
      "ESZ5,Bought,5000.25,2,2026-01-05T14:00:00Z",
      "ESZ5,Sold,5002.00,2,2026-01-05T14:06:00Z",
      "NQ,nonsense,1,1,2026-01-05T14:00:00Z",
      "CLG6,S,71.50,-1,2026-01-05T15:00:00Z",
    ].join("\n"),
  );
  const mapping = guessMapping(table.headers);

  it("normalises sides and drops rows it cannot read", () => {
    const rows = toRows(table, mapping);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ symbol: "ES", side: "buy", price: 5000.25, quantity: 2 });
    expect(rows[1].side).toBe("sell");
    expect(rows[2]).toMatchObject({ symbol: "CL", side: "sell", quantity: 1 });
  });

  it("returns nothing when a required column is unmapped", () => {
    expect(toRows(table, { ...mapping, price: "" })).toEqual([]);
  });
});

describe("rootSymbol", () => {
  it("strips contract months", () => {
    expect(rootSymbol("ESZ5")).toBe("ES");
    expect(rootSymbol("ESH2026")).toBe("ES");
    expect(rootSymbol("ES 12-25")).toBe("ES");
    expect(rootSymbol("6EM6")).toBe("6E");
    expect(rootSymbol("ES")).toBe("ES");
  });
});
