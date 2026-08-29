"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

/** Free text themes: comma or Enter commits, Backspace on empty removes the last. */
export function TagInput({
  values, onChange, placeholder, suggestions, label,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  /** Accessible name — the visible heading sits outside this control. */
  label?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const listId = React.useId();

  const commit = (raw: string) => {
    const label = raw.trim().replace(/,$/, "");
    if (!label) return;
    if (values.some((v) => v.toLowerCase() === label.toLowerCase())) { setDraft(""); return; }
    onChange([...values, label]);
    setDraft("");
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1 min-h-[32px] w-full bg-[var(--bg-raised)]
                 border border-[var(--line-strong)] rounded-[var(--r-input)] px-1.5 py-1
                 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-quiet)]"
    >
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-[var(--r-pill)]
                     bg-[var(--bg-hover)] text-11"
        >
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="[color:var(--text-tertiary)] hover:[color:var(--neg)] leading-none px-0.5"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        aria-label={label ?? placeholder ?? "Add a tag"}
        list={suggestions ? listId : undefined}
        placeholder={values.length ? "" : placeholder}
        onChange={(e) => {
          if (e.target.value.endsWith(",")) commit(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(draft); }
          if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={() => commit(draft)}
        className={cn(
          "flex-1 min-w-[70px] bg-transparent text-12 px-1 py-0.5",
          "placeholder:[color:var(--text-tertiary)] focus:outline-none",
        )}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </div>
  );
}
