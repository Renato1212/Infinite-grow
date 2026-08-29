"use client";
import * as React from "react";

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

const Ctx = React.createContext<{
  toast: (message: string, undo?: () => void) => void;
}>({ toast: () => {} });

export function useToast() {
  return React.useContext(Ctx).toast;
}

/** Destructive actions offer undo here rather than a confirmation dialog. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const next = React.useRef(0);

  const toast = React.useCallback((message: string, undo?: () => void) => {
    const id = next.current++;
    setItems((v) => [...v, { id, message, undo }]);
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), undo ? 7000 : 4000);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center"
        role="status" aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 bg-[var(--bg-raised)] border border-[var(--line-strong)]
                       elevated rounded-[var(--r-std)] pl-3.5 pr-2 py-2 text-13 min-w-[220px]
                       animate-[toast-in_var(--d-base)_var(--ease)]"
          >
            <span className="flex-1">{t.message}</span>
            {t.undo && (
              <button
                type="button"
                onClick={() => { t.undo?.(); setItems((v) => v.filter((x) => x.id !== t.id)); }}
                className="text-[var(--accent)] text-12 font-medium px-2 py-1 rounded-[var(--r-input)]
                           hover:bg-[var(--accent-quiet)]"
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
