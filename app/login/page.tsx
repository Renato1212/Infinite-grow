import { LoginForm } from "@/components/login-form";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { todayISO } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(`/day/${todayISO()}`);

  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <main className="min-h-dvh grid place-items-center px-4">
      <div className="w-full max-w-[340px]">
        <h1 className="text-20 font-[590] tracking-[-0.015em]">Deliberate practice</h1>
        <p className="text-13 text-[var(--text-secondary)] mt-1 mb-6">
          Prepare, plan, trade, record, debrief, study.
        </p>
        {configured ? (
          <LoginForm />
        ) : (
          <div className="text-13 text-[var(--text-secondary)] leading-[1.55]">
            <p className="text-[var(--text)] font-[590] mb-1">No auth configured yet.</p>
            <p>
              Set <code className="mono text-12">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="mono text-12">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
              <code className="mono text-12">.env.local</code>, or set{" "}
              <code className="mono text-12">DEV_USER_ID</code> to work against a local
              Postgres without Supabase.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
