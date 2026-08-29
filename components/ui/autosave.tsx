"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { Input, NumberInput, Select, Textarea, Label } from "./field";

type SaveFn = (value: string | null) => Promise<unknown>;
type Status = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Autosave on blur, with the half-written value mirrored into localStorage so a
 * refresh mid-debrief never loses it. No Save button anywhere on a long form.
 */
export function useAutosave(initial: string, save: SaveFn, draftKey?: string) {
  const [value, setValue] = React.useState(initial);
  const [status, setStatus] = React.useState<Status>("idle");
  const committed = React.useRef(initial);

  // Restore a draft that survived a refresh, but only if it differs from the
  // value the server just gave us.
  React.useEffect(() => {
    if (!draftKey) return;
    try {
      const draft = localStorage.getItem(`draft:${draftKey}`);
      if (draft !== null && draft !== initial) {
        setValue(draft);
        setStatus("dirty");
      }
    } catch { /* storage unavailable */ }
  }, [draftKey, initial]);

  const onChange = React.useCallback((v: string) => {
    setValue(v);
    setStatus("dirty");
    if (draftKey) { try { localStorage.setItem(`draft:${draftKey}`, v); } catch { /* ignore */ } }
  }, [draftKey]);

  const commitWith = React.useCallback(async (v: string) => {
    if (v === committed.current) { setStatus("idle"); return; }
    setStatus("saving");
    try {
      await save(v === "" ? null : v);
      committed.current = v;
      setStatus("saved");
      if (draftKey) { try { localStorage.removeItem(`draft:${draftKey}`); } catch { /* ignore */ } }
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1600);
    } catch {
      setStatus("error");
    }
  }, [save, draftKey]);

  const commit = React.useCallback(() => commitWith(value), [commitWith, value]);

  return { value, onChange, commit, commitWith, status };
}

export function SaveMark({ status }: { status: Status }) {
  const text =
    status === "saving" ? "Saving" :
    status === "saved" ? "Saved" :
    status === "error" ? "Not saved — retry" :
    status === "dirty" ? "Unsaved" : "";
  return (
    <span
      aria-live="polite"
      className={cn(
        "text-11 tabular-nums transition-opacity duration-[var(--d-base)]",
        status === "error" ? "text-[var(--neg)]" : "text-[var(--text-tertiary)]",
        text ? "opacity-100" : "opacity-0",
      )}
    >
      {text || " "}
    </span>
  );
}

function Wrap({
  label, status, children, className, hint,
}: {
  label?: string; status: Status; children: React.ReactNode;
  className?: string; hint?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <Label className="mb-0">{label}</Label>
          <SaveMark status={status} />
        </div>
      )}
      {children}
      {hint && <p className="mt-1 text-11 text-[var(--text-tertiary)]">{hint}</p>}
    </div>
  );
}

export function AutosaveTextarea({
  label, initial, save, draftKey, rows, placeholder, className, hint,
}: {
  label?: string; initial: string | null; save: SaveFn; draftKey?: string;
  rows?: number; placeholder?: string; className?: string; hint?: string;
}) {
  const a = useAutosave(initial ?? "", save, draftKey);
  return (
    <Wrap label={label} status={a.status} className={className} hint={hint}>
      <Textarea
        value={a.value} rows={rows} placeholder={placeholder}
        onChange={(e) => a.onChange(e.target.value)}
        onBlur={a.commit}
      />
    </Wrap>
  );
}

export function AutosaveInput({
  label, initial, save, draftKey, placeholder, className, numeric, hint,
}: {
  label?: string; initial: string | null; save: SaveFn; draftKey?: string;
  placeholder?: string; className?: string; numeric?: boolean; hint?: string;
}) {
  const a = useAutosave(initial ?? "", save, draftKey);
  const C = numeric ? NumberInput : Input;
  return (
    <Wrap label={label} status={a.status} className={className} hint={hint}>
      <C
        value={a.value} placeholder={placeholder}
        onChange={(e) => a.onChange(e.target.value)}
        onBlur={a.commit}
      />
    </Wrap>
  );
}

export function AutosaveSelect({
  label, initial, save, options, placeholder, className,
}: {
  label?: string; initial: string | null; save: SaveFn;
  options: { value: string; label: string }[];
  placeholder?: string; className?: string;
}) {
  const a = useAutosave(initial ?? "", save);
  return (
    <Wrap label={label} status={a.status} className={className}>
      <Select
        value={a.value}
        placeholder={placeholder ?? "—"}
        onChange={(e) => { a.onChange(e.target.value); void a.commitWith(e.target.value); }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </Wrap>
  );
}
