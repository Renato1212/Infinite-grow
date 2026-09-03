import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { runHealth, visibleTo } from "@/lib/health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * What this deployment can see of its own configuration.
 *
 * Detail is readable without signing in only while the app is not yet working
 * — which is exactly when you need it and when there is nothing behind it to
 * protect, since no session can exist until the setup is finished. Once it is
 * green, an anonymous caller gets the summary and nothing else.
 *
 * No check returns a secret, a connection string or a driver message; see
 * lib/health.ts.
 */
export async function GET() {
  const health = await runHealth();

  let signedIn = false;
  try {
    signedIn = Boolean(await currentUser());
  } catch {
    // A broken auth config is itself one of the failures reported below.
  }

  return NextResponse.json(visibleTo(health, signedIn), {
    status: health.status === "fail" ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
