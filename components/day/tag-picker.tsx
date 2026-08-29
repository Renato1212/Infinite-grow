"use client";
import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/lib/cn";
import type { Tag } from "@/lib/queries/reference";

/**
 * Autocomplete over the user's tags. Never free text — a tag that does not
 * exist yet is created in Library, so the same idea can't end up spelled three
 * ways across six months of data.
 */
export function TagPicker({
  tags, selected, onChange, tradeId, emptyHint,
}: {
  tags: Tag[];
  selected: string[];
  onChange: (ids: string[]) => void;
  tradeId?: string;
  emptyHint?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [local, setLocal] = React.useState<string[]>(selected);

  React.useEffect(() => { setLocal(selected); }, [selected.join(","), tradeId]);

  const toggle = (id: string) => {
    const next = local.includes(id) ? local.filter((x) => x !== id) : [...local, id];
    setLocal(next);
    onChange(next);
  };

  const shown = tags.filter((t) => t.label.toLowerCase().includes(query.toLowerCase()));
  const chosen = tags.filter((t) => local.includes(t.id));

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="w-full min-h-[32px] flex flex-wrap items-center gap-1 px-1.5 py-1 text-left
                     bg-[var(--bg-raised)] border border-[var(--line-strong)] rounded-[var(--r-input)]
                     hover:bg-[var(--bg-hover)] transition-colors duration-[var(--d-fast)]"
        >
          {chosen.length === 0 ? (
            <span className="text-12 text-[var(--text-tertiary)] px-1">
              {tags.length === 0 ? (emptyHint ?? "No tags yet") : "Add tags"}
            </span>
          ) : (
            chosen.map((t) => (
              <span
                key={t.id}
                className="px-1.5 py-0.5 rounded-[var(--r-pill)] bg-[var(--bg-hover)] text-11"
              >
                {t.label}
              </span>
            ))
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={4} align="start"
          className="z-50 w-[260px] bg-[var(--bg-raised)] border border-[var(--line-strong)]
                     rounded-[var(--r-std)] elevated p-1.5
                     data-[state=open]:animate-[fade_var(--d-fast)_var(--ease)]"
        >
          <input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tags"
            className="w-full h-7 px-2 mb-1 text-12 bg-transparent border-b border-[var(--line)]
                       focus:outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <ul className="max-h-[200px] overflow-auto">
            {shown.length === 0 && (
              <li className="px-2 py-2 text-11 text-[var(--text-tertiary)]">
                Nothing matches. Create tags in Library.
              </li>
            )}
            {shown.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  aria-pressed={local.includes(t.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 h-7 rounded-[var(--r-input)] text-12 text-left",
                    local.includes(t.id)
                      ? "bg-[var(--accent-quiet)] text-[var(--accent)]"
                      : "hover:bg-[var(--bg-hover)]",
                  )}
                >
                  <span className="flex-1 truncate">{t.label}</span>
                  <span className="text-11 text-[var(--text-tertiary)]">{t.category}</span>
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
