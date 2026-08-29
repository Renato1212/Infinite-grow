"use client";
import * as React from "react";
import { Sheet } from "./sheet";
import { Button } from "./button";
import { Input } from "./field";

/** Asks for one name and nothing else. Used by "save as template". */
export function NamePrompt({
  open, onOpenChange, title, description, placeholder, initial, confirmLabel, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  onConfirm: (name: string) => void;
}) {
  const [value, setValue] = React.useState(initial ?? "");
  React.useEffect(() => { if (open) setValue(initial ?? ""); }, [open, initial]);

  const submit = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!value.trim()} onClick={submit}>
            {confirmLabel ?? "Save"}
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        aria-label={title}
      />
    </Sheet>
  );
}
