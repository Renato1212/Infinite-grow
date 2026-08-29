"use client";
import * as React from "react";

type Theme = "system" | "light" | "dark";

/** System preference by default, with a manual override that persists. */
export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>("system");

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("theme") as Theme | null;
      if (stored) setTheme(stored);
    } catch { /* ignore */ }
  }, []);

  const apply = (next: Theme) => {
    setTheme(next);
    try {
      if (next === "system") {
        localStorage.removeItem("theme");
        document.documentElement.removeAttribute("data-theme");
      } else {
        localStorage.setItem("theme", next);
        document.documentElement.setAttribute("data-theme", next);
      }
    } catch { /* ignore */ }
  };

  const cycle = () => apply(theme === "system" ? "light" : theme === "light" ? "dark" : "system");
  const glyph = theme === "system" ? "◐" : theme === "light" ? "○" : "●";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${theme}. Click to change.`}
      title={`Theme: ${theme}`}
      className="size-7 inline-flex items-center justify-center rounded-[var(--r-input)]
                 text-[var(--text-tertiary)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]
                 transition-colors duration-[var(--d-fast)]"
    >
      <span aria-hidden className="text-13">{glyph}</span>
    </button>
  );
}
