"use client";
import * as React from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { shiftDay, todayISO, isValidISODate } from "@/lib/time";

interface PaletteData {
  instruments: { id: string; symbol: string; name: string }[];
  savedViews: { id: string; name: string }[];
  recentDays: { date: string; netPnl: string; tradeCount: number }[];
}

export function CommandPalette({
  open, onOpenChange, today,
}: { open: boolean; onOpenChange: (v: boolean) => void; today: string }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");

  const { data } = useQuery<PaletteData>({
    queryKey: ["palette"],
    queryFn: async () => (await fetch("/api/palette")).json(),
    enabled: open,
  });

  const go = (href: string) => {
    onOpenChange(false);
    setSearch("");
    router.push(href);
  };

  // "2026-03-14" typed straight into the box jumps to that day.
  const typedDate = isValidISODate(search.trim()) ? search.trim() : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-label="Command palette"
          className="fixed z-50 left-1/2 top-[14vh] -translate-x-1/2 w-[min(100%-24px,600px)]
                     bg-[var(--bg-raised)] border border-[var(--line-strong)] elevated
                     rounded-[var(--r-lg)] overflow-hidden
                     data-[state=open]:animate-[sheet-in_var(--d-base)_var(--ease)]"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command shouldFilter={!typedDate} loop>
            <Command.Input
              value={search}
              onValueChange={setSearch}
              autoFocus
              placeholder="Jump to a day, an instrument, a study…"
              className="w-full h-12 px-4 bg-transparent text-15 border-b border-[var(--line)]
                         placeholder:text-[var(--text-tertiary)] focus:outline-none"
            />
            <Command.List className="max-h-[52vh] overflow-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-12 text-[var(--text-secondary)]">
                Nothing matches. Type a date as 2026-03-14 to jump straight to it.
              </Command.Empty>

              {typedDate && (
                <Group heading="Jump">
                  <Item onSelect={() => go(`/day/${typedDate}`)} hint={typedDate}>
                    Open that day
                  </Item>
                </Group>
              )}

              <Group heading="Days">
                <Item onSelect={() => go(`/day/${today}`)} hint="Today">Today</Item>
                <Item onSelect={() => go(`/day/${shiftDay(todayISO(), -1)}`)} hint="Yesterday">
                  Yesterday
                </Item>
                {data?.recentDays?.slice(0, 5).map((d) => (
                  <Item key={d.date} onSelect={() => go(`/day/${d.date}`)} hint={`${d.tradeCount} trades`}>
                    {d.date}
                  </Item>
                ))}
              </Group>

              <Group heading="Actions">
                <Item onSelect={() => go(`/day/${today}?action=trade`)} hint="n">New trade</Item>
                <Item onSelect={() => go(`/day/${today}?action=note`)} hint="">Add a day note</Item>
                <Item onSelect={() => go(`/day/${today}?phase=debrief-trades`)} hint="d">
                  Debrief queue
                </Item>
                <Item onSelect={() => go(`/day/${today}/brief`)} hint="b">Open the brief</Item>
                <Item onSelect={() => go(`/day/${today}/brief/companion`)} hint="">
                  Companion mode
                </Item>
              </Group>

              {!!data?.instruments?.length && (
                <Group heading="Instruments">
                  {data.instruments.map((i) => (
                    <Item
                      key={i.id}
                      value={`${i.symbol} ${i.name}`}
                      onSelect={() => go(`/trades?instrument=${i.id}`)}
                      hint={i.name}
                    >
                      {i.symbol}
                    </Item>
                  ))}
                </Group>
              )}

              {!!data?.savedViews?.length && (
                <Group heading="Saved studies">
                  {data.savedViews.map((v) => (
                    <Item key={v.id} onSelect={() => go(`/study/${v.id}`)}>{v.name}</Item>
                  ))}
                </Group>
              )}

              <Group heading="Go to">
                <Item onSelect={() => go("/trades")}>All trades</Item>
                <Item onSelect={() => go("/study")}>Study</Item>
                <Item onSelect={() => go("/reviews")}>Reviews</Item>
                <Item onSelect={() => go("/library")}>Library</Item>
                <Item onSelect={() => go("/settings")}>Settings</Item>
              </Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-2.5
                 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  children, onSelect, hint, value,
}: { children: React.ReactNode; onSelect: () => void; hint?: string; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex items-center justify-between gap-3 px-2.5 h-8 rounded-[var(--r-input)]
                 text-13 cursor-pointer data-[selected=true]:bg-[var(--accent-quiet)]
                 data-[selected=true]:text-[var(--accent)]"
    >
      <span className="truncate">{children}</span>
      {hint && <span className="text-11 text-[var(--text-tertiary)] shrink-0">{hint}</span>}
    </Command.Item>
  );
}
