import * as React from "react";
import { cn } from "@/lib/cn";

/** Hairlines by default; a card only when the grouping is real. */
export function Section({
  title, description, actions, children, className, id,
}: {
  title?: string; description?: string; actions?: React.ReactNode;
  children: React.ReactNode; className?: string; id?: string;
}) {
  return (
    <section id={id} className={cn("min-w-0", className)}>
      {(title || actions) && (
        <header className="flex items-baseline justify-between gap-4 mb-3">
          <div className="min-w-0">
            {title && <h2 className="text-15 font-[590]">{title}</h2>}
            {description && (
              <p className="text-12 text-[var(--text-secondary)] mt-0.5">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Card({
  className, children, ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-[var(--bg-raised)] border border-[var(--line)] rounded-[var(--r-lg)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-[var(--line)]", className)} />;
}

/** Empty states are instructions with a button, never decoration. */
export function EmptyState({
  title, body, action,
}: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="py-8 px-4 text-center">
      <p className="text-13 font-[590]">{title}</p>
      <p className="text-12 text-[var(--text-secondary)] mt-1 max-w-[46ch] mx-auto leading-[1.5]">
        {body}
      </p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/** A number that can change: tabular, right-aligned, with its label above. */
export function Stat({
  label, value, sub, tone = "flat", className,
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  tone?: "pos" | "neg" | "flat" | "muted"; className?: string;
}) {
  const color =
    tone === "pos" ? "text-[var(--pos)]"
    : tone === "neg" ? "text-[var(--neg)]"
    : tone === "muted" ? "text-[var(--text-secondary)]"
    : "text-[var(--text)]";
  return (
    <div className={cn("min-w-0", className)}>
      <div className="label">{label}</div>
      <div className={cn("text-20 num font-[590] mt-0.5 tracking-[-0.015em]", color)}>{value}</div>
      {sub && <div className="text-11 text-[var(--text-tertiary)] mt-0.5 num">{sub}</div>}
    </div>
  );
}

export function SampleSize({ n, min }: { n: number; min: number }) {
  const thin = n < min;
  return (
    <span
      className={cn(
        "text-11 num tabular-nums px-1.5 py-0.5 rounded-[var(--r-pill)]",
        thin
          ? "text-[var(--warn)] bg-[var(--warn-quiet)]"
          : "text-[var(--text-tertiary)] bg-[var(--bg-hover)]",
      )}
      title={thin ? `Below your minimum sample size of ${min}` : undefined}
    >
      n = {n}
    </span>
  );
}
