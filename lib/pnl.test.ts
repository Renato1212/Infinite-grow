import { describe, it, expect } from "vitest";
import {
  computeTrade, computeFromAverages, ticksBetween, roundToTick, decimalsFor,
  expectancy, rollingExpectancy, correlation, formatPrice, num,
} from "./pnl";

const ES = { tickSize: 0.25, tickValue: 12.5, pointValue: 50 };
const ZN = { tickSize: 0.015625, tickValue: 15.625, pointValue: 1000 };
const CL = { tickSize: 0.01, tickValue: 10, pointValue: 1000 };

describe("tick arithmetic", () => {
  it("counts ticks in the direction of the trade", () => {
    expect(ticksBetween(5000, 5001, "long", ES.tickSize)).toBe(4);
    expect(ticksBetween(5000, 5001, "short", ES.tickSize)).toBe(-4);
    expect(ticksBetween(5000, 4999, "short", ES.tickSize)).toBe(4);
  });

  it("handles 32nds on the note complex", () => {
    // ZN moves in 1/64ths: 110'16 → 110'17 is one tick.
    expect(ticksBetween(110.5, 110.515625, "long", ZN.tickSize)).toBeCloseTo(1, 9);
  });

  it("rounds to the tick grid", () => {
    expect(roundToTick(4001.13, ES.tickSize)).toBe(4001.25);
    expect(roundToTick(4001.12, ES.tickSize)).toBe(4001);
    expect(roundToTick(71.234, CL.tickSize)).toBe(71.23);
  });

  it("knows how many decimals a tick needs", () => {
    expect(decimalsFor(0.25)).toBe(2);
    expect(decimalsFor(1)).toBe(0);
    expect(decimalsFor(0.0000005)).toBe(7);
    expect(formatPrice(5000, ES.tickSize)).toBe("5000.00");
    expect(formatPrice(null, ES.tickSize)).toBe("—");
  });

  it("parses numeric strings from Postgres", () => {
    expect(num("12.50")).toBe(12.5);
    expect(num(null)).toBe(0);
    expect(num("", 7)).toBe(7);
    expect(num("nonsense", 3)).toBe(3);
  });
});

describe("computeTrade", () => {
  const at = (m: number) => new Date(Date.UTC(2026, 0, 5, 14, m)).toISOString();

  it("computes a simple two-fill winner", () => {
    const r = computeTrade(
      [
        { price: 5000, quantity: 2, isEntry: true, executedAt: at(0), commission: 4.5 },
        { price: 5002, quantity: 2, isEntry: false, executedAt: at(6), commission: 4.5 },
      ],
      "long", ES, { initialStop: 4998 },
    );
    expect(r.avgEntryPrice).toBe(5000);
    expect(r.avgExitPrice).toBe(5002);
    expect(r.ticksCaptured).toBe(8);
    expect(r.maxSize).toBe(2);
    expect(r.grossPnl).toBe(200);        // 8 ticks × $12.50 × 2
    expect(r.commissions).toBe(9);
    expect(r.netPnl).toBe(191);
    expect(r.rMultiple).toBe(1);         // 8 ticks captured / 8 ticks risked
  });

  it("weights scale-ins by quantity and peaks max size correctly", () => {
    const r = computeTrade(
      [
        { price: 5000, quantity: 1, isEntry: true, executedAt: at(0) },
        { price: 5002, quantity: 3, isEntry: true, executedAt: at(1) },
        { price: 5004, quantity: 2, isEntry: false, executedAt: at(3) },
        { price: 5006, quantity: 2, isEntry: false, executedAt: at(5) },
      ],
      "long", ES,
    );
    expect(r.avgEntryPrice).toBe(5001.5);   // (5000 + 3×5002) / 4
    expect(r.avgExitPrice).toBe(5005);
    expect(r.maxSize).toBe(4);
    expect(r.matchedQuantity).toBe(4);
    expect(r.ticksCaptured).toBe(14);
    expect(r.grossPnl).toBe(700);           // 14 × 12.50 × 4
  });

  it("takes max size from the peak, not the total, when scaling out then back in", () => {
    const r = computeTrade(
      [
        { price: 5000, quantity: 3, isEntry: true, executedAt: at(0) },
        { price: 5001, quantity: 2, isEntry: false, executedAt: at(1) },
        { price: 5000, quantity: 2, isEntry: true, executedAt: at(2) },
        { price: 5003, quantity: 3, isEntry: false, executedAt: at(4) },
      ],
      "long", ES,
    );
    expect(r.maxSize).toBe(3);
  });

  it("scores a short that loses", () => {
    const r = computeTrade(
      [
        { price: 71.5, quantity: 1, isEntry: true, executedAt: at(0), commission: 2.2 },
        { price: 71.62, quantity: 1, isEntry: false, executedAt: at(9), commission: 2.2 },
      ],
      "short", CL, { initialStop: 71.7 },
    );
    expect(r.ticksCaptured).toBeCloseTo(-12, 6);
    expect(r.grossPnl).toBe(-120);
    expect(r.netPnl).toBe(-124.4);
    expect(r.rMultiple).toBeCloseTo(-0.6, 6);   // -12 ticks / 20 ticks risked
  });

  it("leaves an open trade without exit maths", () => {
    const r = computeTrade(
      [{ price: 5000, quantity: 1, isEntry: true, executedAt: at(0) }], "long", ES,
    );
    expect(r.avgExitPrice).toBeNull();
    expect(r.ticksCaptured).toBeNull();
    expect(r.rMultiple).toBeNull();
    expect(r.netPnl).toBe(0);
  });

  it("has no R multiple without an initial stop", () => {
    const r = computeTrade(
      [
        { price: 5000, quantity: 1, isEntry: true, executedAt: at(0) },
        { price: 5001, quantity: 1, isEntry: false, executedAt: at(1) },
      ], "long", ES,
    );
    expect(r.rMultiple).toBeNull();
  });
});

describe("computeFromAverages (quick entry)", () => {
  it("matches the fill-level result for a single-fill trade", () => {
    const quick = computeFromAverages(5000, 5002, 2, "long", ES, { commissions: 9, initialStop: 4998 });
    const full = computeTrade(
      [
        { price: 5000, quantity: 2, isEntry: true, executedAt: "2026-01-05T14:00:00Z", commission: 4.5 },
        { price: 5002, quantity: 2, isEntry: false, executedAt: "2026-01-05T14:06:00Z", commission: 4.5 },
      ],
      "long", ES, { initialStop: 4998 },
    );
    expect(quick.netPnl).toBe(full.netPnl);
    expect(quick.ticksCaptured).toBe(full.ticksCaptured);
    expect(quick.rMultiple).toBe(full.rMultiple);
  });

  it("carries commissions on a still-open trade", () => {
    const r = computeFromAverages(5000, null, 1, "long", ES, { commissions: 2.25 });
    expect(r.netPnl).toBe(-2.25);
  });
});

describe("expectancy", () => {
  const t = (netPnl: number, rMultiple: number | null = null) => ({ netPnl, rMultiple });

  it("summarises a mixed sample", () => {
    const e = expectancy([t(200, 2), t(-100, -1), t(150, 1.5), t(-100, -1), t(0, 0)]);
    expect(e.count).toBe(5);
    expect(e.wins).toBe(2);
    expect(e.losses).toBe(2);
    expect(e.scratches).toBe(1);
    expect(e.winRate).toBe(0.4);
    expect(e.grossWin).toBe(350);
    expect(e.grossLoss).toBe(200);
    expect(e.profitFactor).toBe(1.75);
    expect(e.netPnl).toBe(150);
    expect(e.avgWin).toBe(175);
    expect(e.avgLoss).toBe(-100);
    expect(e.expectancy).toBe(30);
    expect(e.expectancyR).toBe(0.3);
  });

  it("is empty-safe", () => {
    const e = expectancy([]);
    expect(e.count).toBe(0);
    expect(e.winRate).toBeNull();
    expect(e.expectancy).toBeNull();
    expect(e.profitFactor).toBeNull();
  });

  it("returns no profit factor when there are no losses to divide by", () => {
    expect(expectancy([t(100), t(50)]).profitFactor).toBeNull();
  });

  it("rolls a window and leaves the head undefined", () => {
    const series = Array.from({ length: 25 }, (_, i) => t(i % 2 ? 100 : -50));
    const rolled = rollingExpectancy(series, 20);
    expect(rolled.slice(0, 19).every((v) => v === null)).toBe(true);
    expect(rolled[19]).not.toBeNull();
    expect(rolled).toHaveLength(25);
  });
});

describe("correlation", () => {
  it("finds a perfect positive relationship", () => {
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBe(1);
  });
  it("finds a perfect negative relationship", () => {
    expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBe(-1);
  });
  it("refuses fewer than three pairs", () => {
    expect(correlation([1, 2], [2, 4])).toBeNull();
  });
  it("refuses a constant series", () => {
    expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
  });
});
