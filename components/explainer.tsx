"use client";
import * as React from "react";
import { Markdown } from "@/lib/markdown";
import { cn } from "@/lib/cn";

const USE_KEY = (k: string) => `explainer-uses:${k}`;
const OPEN_KEY = (k: string) => `explainer-open:${k}`;
const COLLAPSE_AFTER = 5;

/**
 * "Why this matters", in the trader's own framework language. Expanded while a
 * section is new; collapses itself once the section has been used five times.
 * Never nags: the disclosure stays available forever.
 */
export function Explainer({ id, source }: { id: string; source: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(OPEN_KEY(id));
      if (stored !== null) { setOpen(stored === "1"); setReady(true); return; }
      const uses = Number(localStorage.getItem(USE_KEY(id)) ?? "0");
      localStorage.setItem(USE_KEY(id), String(uses + 1));
      setOpen(uses < COLLAPSE_AFTER);
    } catch { setOpen(true); }
    setReady(true);
  }, [id]);

  if (!source) return null;

  return (
    <div className={cn("mb-3", !ready && "opacity-0")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          try { localStorage.setItem(OPEN_KEY(id), next ? "1" : "0"); } catch { /* ignore */ }
        }}
        className="inline-flex items-center gap-1.5 text-11 uppercase tracking-[0.06em] font-[560]
                   text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]
                   transition-colors duration-[var(--d-fast)] rounded-sm"
      >
        <span
          aria-hidden
          className="inline-block transition-transform duration-[var(--d-fast)]
                     [transition-timing-function:var(--ease)]"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          ›
        </span>
        Why this matters
      </button>
      {open && (
        <div className="mt-2 pl-3 border-l-2 border-[var(--line-strong)] text-12
                        text-[var(--text-secondary)] max-w-[68ch]">
          <Markdown source={source} />
        </div>
      )}
    </div>
  );
}
