import { describe, it, expect } from "vitest";
import {
  summarise, groupBy, matrix, domainMatrix, plannedSplit, rHistogram, timeOfDay,
  mistakesOverTime, consistency, correlate, CORRELATION_FIELDS, type Fact,
} from "./aggregate";

const base: Fact = {
  net_pnl: "0", r_multiple: null, ticks_captured: null, duration_seconds: 300,
  planned: true, direction: "long", day: "2026-03-02", instrument_symbol: "ES",
  primary_domain_key: "technicals", primary_domain_label: "Technicals",
  primary_domain_alignment: "supportive", hypothesis_outcome: "played_out",
  entry_bucket_15m: 58, mae_ticks: 4, mfe_ticks: 12, conviction: 4,
  execution_quality: 4, actual_day_type: "trend_up", volume_regime: "high",
  volatility_regime: "average", any_conflicting_domain: false,
  tag_labels: null, mistake_labels: null, r_bucket: "1R..2R", duration_bucket: "5-15m", session_key: "us_rth",
};

const fact = (patch: Partial<Fact>): Fact => ({ ...base, ...patch });

describe("summarise", () => {
  it("reads numeric-as-string columns straight from Postgres", () => {
    const e = summarise([fact({ net_pnl: "250.00", r_multiple: "2.0" }), fact({ net_pnl: "-100.00", r_multiple: "-1.0" })]);
    expect(e.netPnl).toBe(150);
    expect(e.count).toBe(2);
    expect(e.expectancyR).toBe(0.5);
  });
});

describe("groupBy", () => {
  it("buckets and orders by size, folding nulls into a single group", () => {
    const groups = groupBy(
      [
        fact({ instrument_symbol: "ES", net_pnl: "100" }),
        fact({ instrument_symbol: "ES", net_pnl: "-50" }),
        fact({ instrument_symbol: "NQ", net_pnl: "20" }),
      ],
      (f) => f.instrument_symbol,
    );
    expect(groups.map((g) => g.key)).toEqual(["ES", "NQ"]);
    expect(groups[0].count).toBe(2);
    expect(groups[0].netPnl).toBe(50);
  });

  it("labels a missing dimension rather than dropping the trade", () => {
    const groups = groupBy([fact({}), fact({})], () => null);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("—");
    expect(groups[0].count).toBe(2);
  });
});

describe("matrix", () => {
  it("keeps groups apart even when labels contain spaces", () => {
    const m = matrix(
      [
        fact({ primary_domain_label: "Central banks", primary_domain_alignment: "conflicting", net_pnl: "-300" }),
        fact({ primary_domain_label: "Central banks", primary_domain_alignment: "supportive", net_pnl: "400" }),
        fact({ primary_domain_label: "Flow events", primary_domain_alignment: "conflicting", net_pnl: "-50" }),
      ],
      (f) => f.primary_domain_label ?? "—",
      (f) => f.primary_domain_alignment ?? "—",
    );
    expect(m.rows).toEqual(["Central banks", "Flow events"]);
    expect(m.cells).toHaveLength(3);
    const conflictingCB = m.cells.find((c) => c.row === "Central banks" && c.col === "conflicting")!;
    expect(conflictingCB.netPnl).toBe(-300);
    expect(conflictingCB.count).toBe(1);
  });
});

describe("domainMatrix", () => {
  it("orders alignments meaningfully and names unscored trades", () => {
    const m = domainMatrix([
      fact({ primary_domain_alignment: "conflicting" }),
      fact({ primary_domain_alignment: "supportive" }),
      fact({ primary_domain_label: null, primary_domain_alignment: null }),
    ]);
    expect(m.cols).toEqual(["supportive", "conflicting", "unscored"]);
    expect(m.rows).toContain("Not scored");
  });
});

describe("plannedSplit", () => {
  it("separates the improvised trades — the most confronting chart", () => {
    const split = plannedSplit([
      fact({ planned: true, net_pnl: "300" }),
      fact({ planned: false, net_pnl: "-200" }),
      fact({ planned: false, net_pnl: "-100" }),
    ]);
    expect(split.planned.count).toBe(1);
    expect(split.unplanned.count).toBe(2);
    expect(split.unplanned.netPnl).toBe(-300);
  });
});

describe("rHistogram", () => {
  it("always returns every bucket so the axis never jumps", () => {
    const h = rHistogram([fact({ r_bucket: ">=3R" }), fact({ r_bucket: ">=3R" })]);
    expect(h).toHaveLength(7);
    expect(h.find((b) => b.bucket === ">=3R")!.n).toBe(2);
    expect(h.find((b) => b.bucket === "0..1R")!.n).toBe(0);
  });
});

describe("timeOfDay", () => {
  it("turns 15-minute buckets back into local clock labels, in order", () => {
    const t = timeOfDay([
      fact({ entry_bucket_15m: 58 }), // 14:30
      fact({ entry_bucket_15m: 33 }), // 08:15
      fact({ entry_bucket_15m: null }),
    ]);
    expect(t.map((b) => b.label)).toEqual(["08:15", "14:30"]);
  });
});

describe("mistakesOverTime", () => {
  it("counts each error tag per month, most frequent first", () => {
    const m = mistakesOverTime([
      fact({ day: "2026-01-05", mistake_labels: ["chased", "oversized"] }),
      fact({ day: "2026-01-20", mistake_labels: ["chased"] }),
      fact({ day: "2026-02-03", mistake_labels: ["chased"] }),
    ]);
    expect(m.months).toEqual(["2026-01", "2026-02"]);
    expect(m.labels[0]).toBe("chased");
    expect(m.series[0].total).toBe(3);
    expect(m.series[1].counts.chased).toBe(1);
  });
});

describe("consistency", () => {
  it("emits nothing until the window is full", () => {
    const facts = Array.from({ length: 24 }, (_, i) => fact({ net_pnl: String(i % 2 ? 100 : -50) }));
    expect(consistency(facts, 20)).toHaveLength(5);
  });
});

describe("correlate", () => {
  const field = (key: string) => CORRELATION_FIELDS.find((f) => f.key === key)!;

  it("drops pairs where either side is missing", () => {
    const r = correlate(
      [fact({ conviction: 5, r_multiple: "2" }), fact({ conviction: null, r_multiple: "1" })],
      field("conviction"), field("r_multiple"),
    );
    expect(r.n).toBe(1);
    expect(r.r).toBeNull(); // one pair is not a correlation
  });

  it("finds a real relationship when there is one", () => {
    const facts = [1, 2, 3, 4, 5].map((n) =>
      fact({ conviction: n, r_multiple: String(n * 0.5) }));
    expect(correlate(facts, field("conviction"), field("r_multiple")).r).toBe(1);
  });
});
