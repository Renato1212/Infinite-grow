"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full bg-[var(--bg-raised)] text-[var(--text)] border border-[var(--line-strong)] " +
  "rounded-[var(--r-input)] px-2.5 py-1.5 text-13 placeholder:text-[var(--text-tertiary)] " +
  "transition-[border-color,box-shadow] duration-[var(--d-fast)] " +
  "[transition-timing-function:var(--ease)] " +
  "focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-quiet)] " +
  "disabled:opacity-50";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("label block mb-1", className)} {...props} />;
}

export function Field({
  label, hint, htmlFor, children, className,
}: {
  label?: string; hint?: string; htmlFor?: string;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {hint && <p className="mt-1 text-11 text-[var(--text-tertiary)]">{hint}</p>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(control, className)} {...props} />
  ),
);
Input.displayName = "Input";

/** Prices and sizes: monospaced and tabular so a column of them aligns. */
export const NumberInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      inputMode="decimal"
      className={cn(control, "mono text-right", className)}
      {...props}
    />
  ),
);
NumberInput.displayName = "NumberInput";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 3, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(control, "resize-y leading-[1.5]", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }
>(({ className, placeholder, children, ...props }, ref) => (
  <select ref={ref} className={cn(control, "pr-7 appearance-none bg-no-repeat", className)}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M3 4.5 6 7.5 9 4.5' fill='none' stroke='%237b828f' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
      backgroundPosition: "right 8px center",
    }}
    {...props}
  >
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {children}
  </select>
));
Select.displayName = "Select";

export function Checkbox({
  label, className, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = React.useId();
  return (
    <label htmlFor={props.id ?? id} className={cn("flex items-center gap-2 text-13 cursor-pointer select-none", className)}>
      <input
        id={props.id ?? id}
        type="checkbox"
        className="size-[15px] rounded-[4px] border border-[var(--line-strong)] accent-[var(--accent)]"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

/** 1–5 conviction / quality. Radio group under the hood, keyboard-navigable. */
export function Scale({
  value, onChange, max = 5, name, lowLabel, highLabel,
}: {
  value: number | null; onChange: (v: number | null) => void;
  max?: number; name: string; lowLabel?: string; highLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label={name} className="flex gap-1">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${n} of ${max}`}
              onClick={() => onChange(active ? null : n)}
              className={cn(
                "size-7 rounded-[var(--r-input)] text-12 num border transition-colors",
                "duration-[var(--d-fast)] [transition-timing-function:var(--ease)]",
                active
                  ? "bg-[var(--accent)] text-[var(--text-on-accent)] border-transparent"
                  : "border-[var(--line-strong)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(lowLabel || highLabel) && (
        <span className="text-11 text-[var(--text-tertiary)]">
          {lowLabel} → {highLabel}
        </span>
      )}
    </div>
  );
}
