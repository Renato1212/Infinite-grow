import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db/client";
import { savedViews } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { facts, levelPerformance, dayStats } from "@/lib/study/queries";
import { parseFilter } from "@/lib/study/filters";
import { getEdgeDomains, getInstruments, getLevelTypes, getSettings, getTags } from "@/lib/queries/reference";
import { explainer } from "@/lib/explainers";
import { StudyWorkspace } from "@/components/study/workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Study" };

export default async function StudyPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const user = await requireUser();
  const filter = parseFilter(query);

  const [rows, levels, days, instruments, domains, tags, levelTypes, settings, views] =
    await Promise.all([
      facts(user.id, filter),
      levelPerformance(user.id, filter),
      dayStats(user.id, filter),
      getInstruments(user.id),
      getEdgeDomains(user.id),
      getTags(user.id),
      getLevelTypes(user.id),
      getSettings(user.id),
      withUser(user.id, (db) =>
        db.select().from(savedViews).where(eq(savedViews.kind, "study")).orderBy(savedViews.name)),
    ]);

  return (
    <StudyWorkspace
      facts={rows}
      levelStats={levels}
      dayStats={days}
      filter={filter}
      instruments={instruments.map((i) => ({ id: i.id, symbol: i.symbol }))}
      domains={domains.map((d) => ({ key: d.key, label: d.label }))}
      tags={tags.map((t) => ({ id: t.id, label: t.label, category: t.category }))}
      levelTypes={levelTypes.map((t) => ({ key: t.key, label: t.label }))}
      minSampleSize={settings.minSampleSize}
      savedViews={views.map((v) => ({ id: v.id, name: v.name, query: v.query as Record<string, unknown> }))}
      sampleExplainer={explainer("sample-size")}
      planExplainer={explainer("planned-vs-unplanned")}
      domainExplainer={explainer("edge-grid")}
    />
  );
}
