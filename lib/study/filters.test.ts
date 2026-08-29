import { describe, it, expect } from "vitest";
import { compileFilter, parseFilter, serialiseFilter, activeCount } from "./filters";

describe("filter serialisation", () => {
  it("round-trips through URL params", () => {
    const filter = {
      from: "2026-01-01", to: "2026-06-30",
      instrumentIds: ["a", "b"], dayTypes: ["trend_up"], daysOfWeek: [1, 5],
      planned: "unplanned" as const, convictionMin: 4, any: true,
    };
    const back = parseFilter(serialiseFilter(filter));
    expect(back).toEqual(filter);
  });

  it("ignores junk", () => {
    const f = parseFilter(new URLSearchParams("daysOfWeek=9,1&convictionMin=abc&planned=maybe"));
    expect(f.daysOfWeek).toEqual([1]);
    expect(f.convictionMin).toBeUndefined();
    expect(f.planned).toBeUndefined();
  });

  it("counts constrained dimensions, not the OR switch", () => {
    expect(activeCount({ from: "2026-01-01", dayTypes: [], any: true })).toBe(1);
  });
});

describe("filter compilation", () => {
  it("matches everything when empty", () => {
    expect(compileFilter({})).toEqual({ where: "true", params: [] });
  });

  it("ANDs clauses and parameterises every value", () => {
    const { where, params } = compileFilter({
      from: "2026-01-01", instrumentIds: ["id-1"], planned: "planned",
    });
    expect(where).toBe("day >= $1::date and instrument_id::uuid = any($2::uuid[]) and planned");
    expect(params).toEqual(["2026-01-01", ["id-1"]]);
    expect(where).not.toContain("2026-01-01");
  });

  it("keeps date bounds as AND even in OR mode", () => {
    const { where } = compileFilter({
      from: "2026-01-01", dayTypes: ["trend_up"], directions: ["long"], any: true,
    });
    expect(where).toBe(
      "day >= $1::date and (actual_day_type::text = any($2::text[]) or direction::text = any($3::text[]))",
    );
  });

  it("falls back to the date bounds when OR mode has nothing else", () => {
    expect(compileFilter({ from: "2026-01-01", any: true }).where).toBe("day >= $1::date");
  });

  it("translates flow flags to their columns", () => {
    expect(compileFilter({ flowFlags: ["opex", "roll", "nonsense"] }).where)
      .toBe("(flag_opex or flag_roll)");
  });

  it("distinguishes any / all / none on tags", () => {
    const { where } = compileFilter({ tagsAny: ["a"], tagsAll: ["b"], tagsNone: ["c"] });
    expect(where).toContain("tag_labels && $1::text[]");
    expect(where).toContain("tag_labels @> $2::text[]");
    expect(where).toContain("not coalesce(tag_labels, '{}'::text[]) && $3::text[]");
  });

  it("handles the conflicting-domain question both ways", () => {
    expect(compileFilter({ conflicting: "any" }).where).toBe("any_conflicting_domain");
    expect(compileFilter({ conflicting: "none" }).where).toBe("not any_conflicting_domain");
  });
});
