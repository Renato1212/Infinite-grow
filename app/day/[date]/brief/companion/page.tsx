import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDayBundle } from "@/lib/queries/day";
import { getInstruments, getLevelTypes, getRules } from "@/lib/queries/reference";
import { isValidISODate } from "@/lib/time";
import { num } from "@/lib/pnl";
import { Companion } from "@/components/brief/companion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companion" };

export default async function CompanionPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidISODate(date)) notFound();

  const user = await requireUser();
  const [bundle, instruments, levelTypes, rules] = await Promise.all([
    getDayBundle(user.id, date),
    getInstruments(user.id),
    getLevelTypes(user.id),
    getRules(user.id),
  ]);

  const preppedIds = new Set(bundle.preps.map((p) => p.instrumentId));

  return (
    <Companion
      date={date}
      dayId={bundle.day.id}
      instruments={instruments
        .filter((i) => preppedIds.has(i.id))
        .map((i) => ({ id: i.id, symbol: i.symbol, tickSize: num(i.tickSize, 0.25) }))}
      preps={bundle.preps.map((p) => ({ id: p.id, instrumentId: p.instrumentId }))}
      levels={bundle.levels.map((l) => ({
        id: l.id, instrumentPrepId: l.instrumentPrepId, price: l.price,
        strength: l.strength, note: l.note,
        typeLabel: levelTypes.find((t) => t.id === l.levelTypeId)?.label ?? "Level",
      }))}
      interactions={bundle.interactions.map((i) => ({
        prepLevelId: i.prepLevelId, reaction: i.reaction,
      }))}
      hypotheses={bundle.hypotheses
        .sort((a, b) => a.rank - b.rank)
        .map((h) => ({
          id: h.id, rank: h.rank, label: h.label, instrumentId: h.instrumentId,
          invalidation: h.invalidation, plannedResponse: h.plannedResponse,
        }))}
      events={bundle.events.map((e) => ({
        id: e.id, name: e.name, scheduledAt: e.scheduledAt, importance: e.importance,
      }))}
      rules={rules.map((r) => ({ id: r.id, text: r.text }))}
    />
  );
}
