"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { Input, NumberInput, Select, Textarea } from "./field";

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
  const dirty = status === "dirty" || status === "saving" || status === "error";

  // Adopt a value the server changed underneath us — applying a template,
  // carrying levels forward — but never over an edit that is not yet saved.
  // Without this, useState's seed wins forever and a server-side write appears
  // to have done nothing until a full page reload.
  React.useEffect(() => {
    if (dirty) return;
    if (initial === committed.current) return;
    committed.current = initial;
    setValue(initial);
  }, [initial, dirty]);

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
        status === "error" ? "[color:var(--neg)]" : "[color:var(--text-tertiary)]",
        text ? "opacity-100" : "opacity-0",
      )}
    >
      {text || " "}
    </span>
  );
}

function Wrap({
  label, status, children, className, hint, id, hintId,
}: {
  label?: string; status: Status; children: React.ReactNode;
  className?: string; hint?: string; id: string; hintId?: string;
}) {
  // The status line is always present, labelled or not — a field that saves
  // silently is a field you cannot trust. It sits *beside* the <label> rather
  // than inside it: in the label, the field's accessible name would change from
  // "Structure" to "Structure Saved" every time it saved.
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-2 mb-1 min-h-[15px]">
        <label htmlFor={id} className="label">{label ?? ""}</label>
        <SaveMark status={status} />
      </div>
      {children}
      {hint && <p id={hintId} className="mt-1 text-11 [color:var(--text-tertiary)]">{hint}</p>}
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
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <Wrap label={label} status={a.status} className={className} hint={hint} id={id} hintId={hintId}>
      <Textarea
        id={id} aria-describedby={hintId}
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
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <Wrap label={label} status={a.status} className={className} hint={hint} id={id} hintId={hintId}>
      <C
        id={id} aria-describedby={hintId}
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
  const id = React.useId();
  return (
    <Wrap label={label} status={a.status} className={className} id={id}>
      <Select
        id={id}
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
