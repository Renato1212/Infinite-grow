import { describe, it, expect } from "vitest";
import { resolveDatabaseUrl } from "./url";

const DB = "postgresql://postgres.ref:pw@aws-1-eu-west-3.pooler.supabase.com:6543/postgres";

describe("resolveDatabaseUrl", () => {
  it("prefers a hand-set DATABASE_URL", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: DB, POSTGRES_URL: "postgresql://other/x" }))
      .toEqual({ url: DB, source: "DATABASE_URL" });
  });

  it("falls back to what Vercel's Supabase integration writes", () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL: DB })).toEqual({ url: DB, source: "POSTGRES_URL" });
  });

  it("prefers a pooled URL over the non-pooling one", () => {
    // The non-pooling host is IPv6-only, which serverless platforms commonly
    // cannot reach, so it must never win over a pooled URL.
    const resolved = resolveDatabaseUrl({
      POSTGRES_URL_NON_POOLING: "postgresql://direct/x",
      POSTGRES_PRISMA_URL: DB,
    });
    expect(resolved?.source).toBe("POSTGRES_PRISMA_URL");
  });

  it("assembles the parts when no whole URL is set", () => {
    const resolved = resolveDatabaseUrl({
      POSTGRES_USER: "postgres.ref",
      POSTGRES_PASSWORD: "pw",
      POSTGRES_HOST: "aws-1-eu-west-3.pooler.supabase.com:6543",
      POSTGRES_DATABASE: "postgres",
    });
    expect(resolved?.url).toBe(DB);
  });

  it("escapes a password that would otherwise break the URL", () => {
    // Assembling is the forgiving path precisely because of this: a # would
    // truncate the string and a @ would split the host.
    const resolved = resolveDatabaseUrl({
      POSTGRES_USER: "postgres.ref",
      POSTGRES_PASSWORD: "p#a@ss/word",
      POSTGRES_HOST: "host:6543",
    });
    expect(resolved?.url).toContain("p%23a%40ss%2Fword");
    expect(new URL(resolved!.url).password).toBe("p%23a%40ss%2Fword");
  });

  it("ignores blank values rather than treating them as set", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "  ", POSTGRES_URL: DB })?.source)
      .toBe("POSTGRES_URL");
  });

  it("returns null when nothing is configured", () => {
    expect(resolveDatabaseUrl({})).toBeNull();
  });
});
