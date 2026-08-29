import { describe, it, expect } from "vitest";
import { sslFor } from "./ssl";

describe("sslFor", () => {
  it("requires TLS for a hosted database", () => {
    expect(sslFor("postgresql://u:p@aws-0-eu-west-3.pooler.supabase.com:6543/postgres"))
      .toBe("require");
  });

  it("leaves a local database alone", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(sslFor(`postgresql://postgres@${host}:5432/journal`)).toBeUndefined();
    }
  });

  it("defers to an explicit sslmode, in either direction", () => {
    expect(sslFor("postgresql://u:p@db.example.com/postgres?sslmode=disable")).toBeUndefined();
    expect(sslFor("postgresql://u:p@db.example.com/postgres?sslmode=verify-full")).toBeUndefined();
  });

  it("does not throw on something it cannot parse", () => {
    expect(sslFor("not a url")).toBeUndefined();
    expect(sslFor("")).toBeUndefined();
  });
});
