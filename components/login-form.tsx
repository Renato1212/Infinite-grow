"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";

type Mode = "sign-in" | "create";

/**
 * Email and password, rather than a magic link.
 *
 * The link flow needed a mail round trip on every sign-in and an allowlisted
 * redirect URL that nothing could verify. A password needs neither: the session
 * comes back on the same request.
 *
 * The first visit has no account, so creating one is offered here rather than
 * requiring a trip to the Supabase dashboard. Close sign-ups once yours exists
 * — see docs/DEPLOYMENT.md.
 */
export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("sign-in");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  /**
   * Supabase's messages are written for developers. These are the three a
   * first-time setup actually hits, and the raw text does not say what to do.
   */
  function explain(message: string): string {
    if (/Invalid login credentials/i.test(message)) {
      return mode === "sign-in"
        ? "That email and password do not match an account. If you have not made one yet, choose Create account."
        : message;
    }
    if (/Email not confirmed/i.test(message)) {
      return "The account exists but its email is unconfirmed. Either click the link Supabase sent you, or turn off Authentication → Sign In / Providers → Email → Confirm email in the Supabase dashboard.";
    }
    if (/Signups not allowed|signup is disabled/i.test(message)) {
      return "Sign-ups are closed on this project. Re-enable them in Supabase → Authentication → Sign In / Providers → Email to create an account.";
    }
    if (/Password should be at least/i.test(message)) return message;
    return message;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    const supabase = supabaseBrowser();
    const credentials = { email, password };

    const { data, error: failure } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (failure) {
      setError(explain(failure.message));
      setBusy(false);
      return;
    }

    // Sign-up returns a user with no session when the project still requires
    // email confirmation. Saying so beats appearing to hang.
    if (!data.session) {
      setNotice(
        "Account created. Confirm the email Supabase just sent you, then sign in — or turn off Confirm email in the Supabase dashboard and sign in now.",
      );
      setMode("sign-in");
      setBusy(false);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy
          ? mode === "sign-in"
            ? "Signing in"
            : "Creating"
          : mode === "sign-in"
            ? "Sign in"
            : "Create account"}
      </Button>

      {error && (
        <p role="alert" className="text-12 [color:var(--neg)] leading-[1.5]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-12 [color:var(--text-secondary)] leading-[1.5]">
          {notice}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign-in" ? "create" : "sign-in");
          setError("");
          setNotice("");
        }}
        className="text-12 [color:var(--text-secondary)] hover:[color:var(--text)] underline underline-offset-2"
      >
        {mode === "sign-in" ? "Create the first account" : "I already have an account"}
      </button>
    </form>
  );
}
