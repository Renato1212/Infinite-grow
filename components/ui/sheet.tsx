"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/** Dialogs are sheets: they slide, they do not pop. */
export function Sheet({
  open, onOpenChange, title, description, children, footer, wide,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  title: string; description?: string;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] data-[state=open]:animate-[fade_var(--d-base)_var(--ease)]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 left-1/2 -translate-x-1/2 bottom-0 sm:bottom-auto sm:top-[8vh]",
            "w-full sm:w-[min(100%-32px,var(--sheet-w))] max-h-[88vh] overflow-auto",
            "bg-[var(--bg-raised)] border border-[var(--line)] elevated",
            "rounded-t-[var(--r-lg)] sm:rounded-[var(--r-lg)]",
            "data-[state=open]:animate-[sheet-in_var(--d-slow)_var(--ease)]",
          )}
          style={{ ["--sheet-w" as string]: wide ? "860px" : "560px" }}
        >
          <header className="sticky top-0 bg-[var(--bg-raised)] px-5 pt-4 pb-3 border-b border-[var(--line)]">
            <Dialog.Title className="text-15 font-[590]">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="text-12 text-[var(--text-secondary)] mt-0.5">
                {description}
              </Dialog.Description>
            )}
          </header>
          <div className="px-5 py-4">{children}</div>
          {footer && (
            <footer className="sticky bottom-0 bg-[var(--bg-raised)] px-5 py-3 border-t border-[var(--line)] flex justify-end gap-2">
              {footer}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SheetClose({ children }: { children: React.ReactNode }) {
  return <Dialog.Close asChild>{children}</Dialog.Close>;
}

/** Typed confirmation only where data loss is real. */
export function ConfirmDelete({
  open, onOpenChange, what, phrase, onConfirm,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  what: string; phrase: string; onConfirm: () => void;
}) {
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => { if (!open) setTyped(""); }, [open]);
  return (
    <Sheet
      open={open} onOpenChange={onOpenChange}
      title={`Delete ${what}`}
      description={`This removes the record and everything attached to it. Type ${phrase} to confirm.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} variant="ghost">Cancel</Button>
          <Button
            variant="danger" disabled={typed !== phrase}
            onClick={() => { onConfirm(); onOpenChange(false); }}
          >
            Delete
          </Button>
        </>
      }
    >
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        aria-label={`Type ${phrase} to confirm`}
        placeholder={phrase}
        className="w-full bg-[var(--bg)] border border-[var(--line-strong)] rounded-[var(--r-input)] px-2.5 py-1.5 text-13"
      />
    </Sheet>
  );
}
