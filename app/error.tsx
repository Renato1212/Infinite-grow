"use client";
import { Button } from "@/components/ui/button";

/** Errors say what happened and how to fix it, without apologising. */
export default function Error({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  const noDatabase = /DATABASE_URL|ECONNREFUSED|connect/i.test(error.message);

  return (
    <div className="py-16 text-center">
      <h1 className="text-20 font-[590]">
        {noDatabase ? "The database isn't reachable." : "That didn't load."}
      </h1>
      <p className="text-13 text-[var(--text-secondary)] mt-1.5 max-w-[52ch] mx-auto leading-[1.55]">
        {noDatabase ? (
          <>
            Check <code className="mono text-12">DATABASE_URL</code> in{" "}
            <code className="mono text-12">.env.local</code>, then run{" "}
            <code className="mono text-12">npm run db:push</code>.
          </>
        ) : (
          "Retrying usually works. If it doesn't, the detail below is what went wrong."
        )}
      </p>
      {error.digest && (
        <p className="text-11 text-[var(--text-tertiary)] mono mt-2">{error.digest}</p>
      )}
      <div className="mt-4">
        <Button variant="primary" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
