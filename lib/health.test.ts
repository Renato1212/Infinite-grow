import { describe, it, expect, afterEach, vi } from "vitest";
import { classifyDbError, overall, supabaseChecks, visibleTo, type Check } from "./health";

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
    vi.stubGlobal("fetch", async () => Response.json({ disable_signup: false }));
    const checks = await supabaseChecks();
    expect(checks[0].status).toBe("ok");
    expect(checks[1]).toMatchObject({ name: "Sign-ups", status: "warn" });
  });

  it("passes once sign-ups are closed", async () => {
    withSupabaseEnv();
    vi.stubGlobal("fetch", async () => Response.json({ disable_signup: true }));
    const checks = await supabaseChecks();
    expect(checks.every((c) => c.status === "ok")).toBe(true);
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
