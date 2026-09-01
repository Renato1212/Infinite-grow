import { describe, it, expect, afterEach, vi } from "vitest";
import {
  checkConnectionShape,
  classifyDbError,
  overall,
  supabaseChecks,
  visibleTo,
  type Check,
} from "./health";

const check = (over: Partial<Check> = {}): Check => ({
  name: "x",
  status: "ok",
  detail: "",
  ...over,
});

describe("overall", () => {
  it("takes the worst verified status", () => {
    expect(overall([check(), check({ status: "warn" })])).toBe("warn");
    expect(overall([check({ status: "warn" }), check({ status: "fail" })])).toBe("fail");
    expect(overall([check(), check()])).toBe("ok");
  });

  it("ignores checks nothing could verify", () => {
    // The redirect allowlist is not readable through any API. If it counted,
    // a correct install could never report ok, and a status that is always
    // yellow is a status nobody reads.
    expect(overall([check(), check({ status: "warn", manual: true })])).toBe("ok");
  });
});

describe("classifyDbError", () => {
  it("names the cause for the failures that actually happen during setup", () => {
    expect(classifyDbError({ code: "28P01" })).toMatch(/password/);
    expect(classifyDbError({ code: "ENOTFOUND" })).toMatch(/does not resolve/);
    expect(classifyDbError({ code: "ECONNREFUSED" })).toMatch(/nothing is listening/);
    expect(classifyDbError({ code: "3D000" })).toMatch(/database name/);
  });

  it("names the circuit breaker rather than calling it a generic failure", () => {
    const said = classifyDbError(new Error("circuit breaker open for operation: auth_error"));
    expect(said).toMatch(/circuit breaker/);
    expect(said).toMatch(/wait/);
  });

  it("recognises a plaintext rejection, which has no code", () => {
    expect(classifyDbError(new Error("The server does not support SSL connections"))).toMatch(
      /TLS/,
    );
  });

  it("never repeats the driver's own message, which carries host and role", () => {
    const leaky = Object.assign(
      new Error("connect ECONNREFUSED db.secret-project.supabase.co:5432 as postgres.admin"),
      { code: "ECONNREFUSED" },
    );
    const said = classifyDbError(leaky);
    expect(said).not.toMatch(/secret-project/);
    expect(said).not.toMatch(/postgres\.admin/);
  });
});

describe("supabase checks", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  function withSupabaseEnv() {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  }

  it("fails, naming the variable, when a key is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const [auth] = await supabaseChecks();
    expect(auth.status).toBe("fail");
    expect(auth.detail).toMatch(/NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("fails when the project rejects the key", async () => {
    withSupabaseEnv();
    vi.stubGlobal("fetch", async () => new Response("", { status: 403 }));
    const [auth] = await supabaseChecks();
    expect(auth.status).toBe("fail");
    expect(auth.detail).toMatch(/403/);
  });

  it("warns while anyone can still create an account", async () => {
    withSupabaseEnv();
    vi.stubGlobal("fetch", async () =>
      Response.json({ disable_signup: false, mailer_autoconfirm: true }),
    );
    const checks = await supabaseChecks();
    expect(checks[0].status).toBe("ok");
    expect(checks[1]).toMatchObject({ name: "Sign-ups", status: "warn" });
  });

  it("passes once sign-ups are closed and confirmation is off", async () => {
    withSupabaseEnv();
    vi.stubGlobal("fetch", async () =>
      Response.json({ disable_signup: true, mailer_autoconfirm: true }),
    );
    const checks = await supabaseChecks();
    expect(checks.every((c) => c.status === "ok")).toBe(true);
  });

  it("warns that account creation needs an email while confirmation is on", async () => {
    // Password sign-in has no redirect step, but confirmation reintroduces a
    // mail round trip on the very first sign-up — the only time it bites.
    withSupabaseEnv();
    vi.stubGlobal("fetch", async () =>
      Response.json({ disable_signup: false, mailer_autoconfirm: false }),
    );
    const checks = await supabaseChecks();
    expect(checks.find((c) => c.name === "Email confirmation")).toMatchObject({ status: "warn" });
  });

  it("fails rather than throwing when the project is unreachable", async () => {
    withSupabaseEnv();
    vi.stubGlobal("fetch", async () => {
      throw new Error("network");
    });
    const [auth] = await supabaseChecks();
    expect(auth.status).toBe("fail");
  });
});

describe("what an anonymous caller may see", () => {
  const green = { status: "ok" as const, checks: [check(), check()] };
  const broken = { status: "fail" as const, checks: [check({ status: "fail" })] };

  it("hides the detail of a working install", () => {
    expect(visibleTo(green, false)).toEqual({ status: "ok" });
  });

  it("shows a signed-in user everything", () => {
    expect(visibleTo(green, true)).toEqual(green);
  });

  it("shows a broken install to anyone, since that is when it is needed", () => {
    // Nothing can be signed in yet, so there is nothing behind it to protect.
    expect(visibleTo(broken, false)).toEqual(broken);
  });
});


describe("connection string shape", () => {
  const REF = "zggckkxrnaysruvcmqng";
  const POOLER = `aws-0-eu-west-3.pooler.supabase.com:6543`;
  const DIRECT = `db.${REF}.supabase.co:5432`;

  const only = (url: string, serverless = true) => checkConnectionShape(url, serverless);

  it("accepts the string Supabase hands you for the pooler", () => {
    expect(only(`postgresql://postgres.${REF}:s3cret@${POOLER}/postgres`)).toEqual([]);
  });

  it("accepts the direct string off a serverless platform", () => {
    expect(only(`postgresql://postgres:s3cret@${DIRECT}/postgres`, false)).toEqual([]);
  });

  it("catches a bare postgres username against the pooler", () => {
    // The failure this actually produced was "password authentication failed",
    // which sends you looking at the password instead of the username.
    const [c] = only(`postgresql://postgres:s3cret@${POOLER}/postgres`);
    expect(c.status).toBe("fail");
    expect(c.detail).toMatch(/postgres\.<project-ref>/);
  });

  it("catches a pooler username against the direct host", () => {
    const [c] = only(`postgresql://postgres.${REF}:s3cret@${DIRECT}/postgres`);
    expect(c.status).toBe("fail");
    expect(c.detail).toMatch(/plain "postgres"/);
  });

  it("catches the placeholder left in", () => {
    const [c] = only(`postgresql://postgres.${REF}:%5BYOUR-PASSWORD%5D@${POOLER}/postgres`);
    expect(c.status).toBe("fail");
    expect(c.detail).toMatch(/placeholder/);
  });

  it("allows a local database with no password, as trust auth gives", () => {
    // Caught by running it: the shape check failed a perfectly good local
    // connection, which is how every contributor runs the app.
    expect(only("postgresql://postgres@127.0.0.1:5433/journal", false)).toEqual([]);
  });

  it("names the variable the value actually came from", () => {
    // Telling someone to edit DATABASE_URL when the value came from
    // POSTGRES_URL sends them to a variable that is not set.
    const [c] = checkConnectionShape(
      `postgresql://postgres.${REF}:%5BYOUR-PASSWORD%5D@${POOLER}/postgres`,
      true,
      "POSTGRES_URL",
    );
    expect(c.detail).toMatch(/POSTGRES_URL/);
    expect(c.detail).not.toMatch(/DATABASE_URL/);
  });

  it("catches a missing password", () => {
    // Remote, so an absent password is a real fault.
    const [c] = only(`postgresql://postgres.${REF}@${POOLER}/postgres`);
    expect(c.status).toBe("fail");
    expect(c.detail).toMatch(/no password/);
  });

  it("explains an unparseable URL as the encoding problem it usually is", () => {
    const [c] = only("not a url");
    expect(c.status).toBe("fail");
    expect(c.fix).toMatch(/%23/);
  });

  it("warns that the direct host is IPv6 when running serverless", () => {
    const [c] = only(`postgresql://postgres:s3cret@${DIRECT}/postgres`, true);
    expect(c.status).toBe("warn");
    expect(c.detail).toMatch(/IPv6/);
  });

  it("does not mistake another host for Supabase's", () => {
    expect(only("postgresql://someone:pw@db.example.com:5432/app")).toEqual([]);
  });
});

describe("classifyDbError, pooler cases", () => {
  it("names both causes when the pooler rejects the tenant", () => {
    // Supavisor words this two ways, and either the username or the pooler
    // host can be at fault. Naming only the username sent this project's
    // owner to re-check a part that was already right.
    for (const message of [
      "Tenant or user not found",
      "(ENOTFOUND) tenant/user postgres.abcdef not found",
    ]) {
      const said = classifyDbError(new Error(message));
      expect(said).toMatch(/username/);
      expect(said).toMatch(/host/);
    }
  });
});
