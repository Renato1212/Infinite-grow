"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { CommandPalette } from "./command-palette";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: (d: string) => `/day/${d}`, label: "Today", match: (p: string) => p.startsWith("/day") },
  { href: () => "/trades", label: "Trades", match: (p: string) => p.startsWith("/trades") },
  { href: () => "/study", label: "Study", match: (p: string) => p.startsWith("/study") },
  { href: () => "/reviews", label: "Reviews", match: (p: string) => p.startsWith("/reviews") },
  { href: () => "/library", label: "Library", match: (p: string) => p.startsWith("/library") },
];

export function AppFrame({
  children, userEmail, today,
}: { children: React.ReactNode; userEmail: string | null; today: string }) {
  const pathname = usePathname() ?? "";
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  // The companion view is meant to sit on a second monitor with no chrome.
  const bare = pathname.includes("/companion") || pathname === "/login";

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (bare) return <>{children}</>;

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[70] focus:top-2 focus:left-2
                   focus:bg-[var(--bg-raised)] focus:border focus:border-[var(--line-strong)]
                   focus:rounded-[var(--r-input)] focus:px-3 focus:py-2 text-13"
      >
        Skip to content
      </a>

      <header
        data-app-header
        className="sticky top-0 z-30 bg-[var(--bg)]/85 backdrop-blur-md border-b border-[var(--line)]"
      >
        <div className="mx-auto max-w-[1400px] px-4 h-12 flex items-center gap-1">
          <Link
            href={`/day/${today}`}
            className="text-13 font-[590] tracking-[-0.01em] pr-3 mr-1 shrink-0"
          >
            Deliberate practice
          </Link>

          <nav aria-label="Main" className="flex items-center gap-0.5 min-w-0 overflow-x-auto">
            {NAV.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.label}
                  href={item.href(today)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "px-2.5 h-7 inline-flex items-center rounded-[var(--r-input)] text-13",
                    "transition-colors duration-[var(--d-fast)] [transition-timing-function:var(--ease)]",
                    active
                      ? "bg-[var(--accent-quiet)] text-[var(--accent)] font-[560]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden sm:inline-flex items-center gap-2 h-7 pl-2.5 pr-1.5 rounded-[var(--r-input)]
                       border border-[var(--line-strong)] text-12 text-[var(--text-tertiary)]
                       hover:bg-[var(--bg-hover)] transition-colors duration-[var(--d-fast)]"
            aria-keyshortcuts="Meta+K"
          >
            Search
            <kbd className="mono text-11 px-1 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--line)]">
              ⌘K
            </kbd>
          </button>

          <ThemeToggle />

          <Link
            href="/settings"
            aria-label="Settings"
            title={userEmail ?? "Settings"}
            className="size-7 inline-flex items-center justify-center rounded-[var(--r-pill)]
                       border border-[var(--line-strong)] text-11 text-[var(--text-secondary)]
                       hover:bg-[var(--bg-hover)] transition-colors duration-[var(--d-fast)] ml-1"
          >
            {(userEmail ?? "?").slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} today={today} />
    </>
  );
}
