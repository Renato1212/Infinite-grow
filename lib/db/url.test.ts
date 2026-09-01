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

  it("skips a DATABASE_URL that still holds the placeholder", () => {
    // The failure this actually caused: the integration had set a working
    // POSTGRES_URL, and a half-pasted DATABASE_URL outranked it, so a correct
    // setup kept reporting the same error.
    const resolved = resolveDatabaseUrl({
      DATABASE_URL: "postgresql://postgres.ref:[YOUR-PASSWORD]@host:6543/postgres",
      POSTGRES_URL: DB,
    });
    expect(resolved).toEqual({ url: DB, source: "POSTGRES_URL" });
  });

  it("skips a DATABASE_URL that is not a URL at all", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "paste your string here", POSTGRES_URL: DB })?.source)
      .toBe("POSTGRES_URL");
  });

  it("still reports an unusable value when it is the only one", () => {
    // Reporting "DATABASE_URL still contains the placeholder" beats reporting
    // that nothing is configured, which would be false.
    const only = "postgresql://postgres.ref:[YOUR-PASSWORD]@host:6543/postgres";
    expect(resolveDatabaseUrl({ DATABASE_URL: only })).toEqual({
      url: only,
      source: "DATABASE_URL",
    });
  });

  it("prefers the assembled parts over an unusable whole URL", () => {
    const resolved = resolveDatabaseUrl({
      DATABASE_URL: "postgresql://postgres.ref:[YOUR-PASSWORD]@host:6543/postgres",
      POSTGRES_USER: "postgres.ref",
      POSTGRES_PASSWORD: "pw",
      POSTGRES_HOST: "aws-1-eu-west-3.pooler.supabase.com:6543",
    });
    expect(resolved?.source).toBe("POSTGRES_USER/PASSWORD/HOST");
  });

  it("returns null when nothing is configured", () => {
    expect(resolveDatabaseUrl({})).toBeNull();
  });
});
