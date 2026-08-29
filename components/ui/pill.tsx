import * as React from "react";
import { cn } from "@/lib/cn";

export function Pill({
  children, tone = "neutral", className, ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "pos" | "neg" | "warn";
}) {
  const tones = {
    neutral: "bg-[var(--bg-hover)] text-[var(--text-secondary)]",
    accent: "bg-[var(--accent-quiet)] text-[var(--accent)]",
    pos: "bg-[var(--pos-quiet)] text-[var(--pos)]",
    neg: "bg-[var(--neg-quiet)] text-[var(--neg)]",
    warn: "bg-[var(--warn-quiet)] text-[var(--warn)]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--r-pill)] text-11 whitespace-nowrap",
        tones[tone], className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Edge domains are identified by a 6px dot, never a filled block. */
export function DomainDot({ domainKey, className }: { domainKey: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-[6px] rounded-full shrink-0", className)}
      style={{ background: `var(--dom-${domainKey}, var(--text-tertiary))` }}
    />
  );
}

export function DomainLabel({ domainKey, label }: { domainKey: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-12">
      <DomainDot domainKey={domainKey} />
      {label}
    </span>
  );
}

/** Direction never relies on colour: the arrow carries it. */
export function DirectionMark({ direction }: { direction: "long" | "short" }) {
  return (
    <span className="inline-flex items-center gap-1 text-12">
      <span aria-hidden>{direction === "long" ? "↑" : "↓"}</span>
      <span>{direction === "long" ? "Long" : "Short"}</span>
    </span>
  );
}
