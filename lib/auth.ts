import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
}

const supabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * The signed-in user, or null.
 *
 * DEV_USER_ID exists so the app is runnable against a bare Postgres with no
 * Supabase project attached. It is ignored in production builds — an auth
 * bypass that can be switched on by an environment variable in production is
 * not a bypass worth having.
 */
export async function currentUser(): Promise<SessionUser | null> {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_USER_ID) {
    return { id: process.env.DEV_USER_ID, email: process.env.DEV_USER_EMAIL ?? "dev@localhost" };
  }
  if (!supabaseConfigured()) return null;

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
