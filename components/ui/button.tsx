"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium " +
  "transition-[background-color,border-color,color,opacity] duration-[var(--d-fast)] " +
  "[transition-timing-function:var(--ease)] disabled:opacity-40 disabled:pointer-events-none " +
  "select-none";

const variants: Record<Variant, string> = {
  // One filled button per screen. Everything else is quieter than this.
  primary:
    "bg-[var(--accent)] text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)] " +
    "rounded-[var(--r-input)]",
  secondary:
    "bg-[var(--bg-raised)] text-[var(--text)] border border-[var(--line-strong)] " +
    "hover:bg-[var(--bg-hover)] rounded-[var(--r-input)]",
  ghost:
    "text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] " +
    "rounded-[var(--r-input)]",
  danger:
    "text-[var(--neg)] hover:bg-[var(--neg-quiet)] rounded-[var(--r-input)]",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-12",
  md: "h-9 px-3.5 text-13",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

/** A text button. Secondary actions never compete with the primary one. */
export function TextButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "text-13 text-[var(--text-secondary)] hover:text-[var(--accent)] underline-offset-2",
        "hover:underline transition-colors duration-[var(--d-fast)] rounded-sm",
        className,
      )}
      {...props}
    />
  );
}
