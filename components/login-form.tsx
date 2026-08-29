"use client";
import * as React from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";

export function LoginForm() {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <p className="text-13 leading-[1.55]">
        A sign-in link is on its way to <span className="font-[590]">{email}</span>. It opens
        this app directly — no password.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Email" htmlFor="email">
        <Input
          id="email" type="email" required autoComplete="email" autoFocus
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>
      <Button type="submit" variant="primary" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? "Sending" : "Send a sign-in link"}
      </Button>
      {state === "error" && (
        <p className="text-12 [color:var(--neg)]">{message}</p>
      )}
    </form>
  );
}
