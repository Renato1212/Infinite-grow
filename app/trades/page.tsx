import { requireUser } from "@/lib/auth";
import { facts } from "@/lib/study/queries";
import { parseFilter } from "@/lib/study/filters";
import { getEdgeDomains, getInstruments, getLevelTypes, getSettings, getTags } from "@/lib/queries/reference";
import { withUser } from "@/lib/db/client";
import { savedViews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { TradesBrowser } from "@/components/trades/browser";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trades" };

export default async function TradesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const user = await requireUser();

  // /trades?instrument=<id> comes from the command palette.
  const filter = parseFilter({
    ...query,
    instrumentIds: typeof query.instrument === "string" ? query.instrument : query.instrumentIds,
  });

  const [rows, instruments, domains, tags, levelTypes, settings, views] = await Promise.all([
    facts(user.id, filter, 2000),
    getInstruments(user.id),
    getEdgeDomains(user.id),
    getTags(user.id),
    getLevelTypes(user.id),
    getSettings(user.id),
    withUser(user.id, (db) =>
      db.select().from(savedViews).where(eq(savedViews.kind, "study")).orderBy(savedViews.name)),
  ]);

  return (
    <TradesBrowser
      facts={rows}
      filter={filter}
      instruments={instruments.map((i) => ({ id: i.id, symbol: i.symbol }))}
      domains={domains.map((d) => ({ key: d.key, label: d.label }))}
      tags={tags.map((t) => ({ id: t.id, label: t.label, category: t.category }))}
      levelTypes={levelTypes.map((t) => ({ key: t.key, label: t.label }))}
      savedViews={views.map((v) => ({ id: v.id, name: v.name, query: v.query as Record<string, unknown> }))}
      minSampleSize={settings.minSampleSize}
    />
  );
}
