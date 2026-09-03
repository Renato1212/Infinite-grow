import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDayBundle, getStreak } from "@/lib/queries/day";
import { similarDays } from "@/lib/study/queries";
import {
  getEdgeDomains, getInstruments, getLevelTypes, getRules, getSettings, getTags,
  getTemplates,
} from "@/lib/queries/reference";
import { withUser } from "@/lib/db/client";
import { tradeDebriefs, tradeEdgeAssessments, tradeMistakeTags, tradeTags } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { isValidISODate, dayLabel } from "@/lib/time";
import { explainer } from "@/lib/explainers";
import { DayCockpit } from "@/components/day/cockpit";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return { title: isValidISODate(date) ? `${dayLabel(date)} — Deliberate practice` : "Day" };
}

export default async function DayPage({
  params, searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { date } = await params;
  const query = await searchParams;
  if (!isValidISODate(date)) notFound();

  const user = await requireUser();
  const [bundle, instruments, domains, levelTypes, tags, rules, settings, streak, templates] =
    await Promise.all([
      getDayBundle(user.id, date),
      getInstruments(user.id),
      getEdgeDomains(user.id),
      getLevelTypes(user.id),
      getTags(user.id),
      getRules(user.id),
      getSettings(user.id),
      getStreak(user.id, date),
      getTemplates(user.id),
    ]);

  // Only meaningful once the day is classified — before that there is nothing
  // to match on, and the component says so rather than showing an empty table.
  const similar = bundle.day.actualDayType
    ? await similarDays(user.id, bundle.day.id)
    : [];

  const tradeIds = bundle.trades.map((t) => t.id);
  const debriefState = tradeIds.length
    ? await withUser(user.id, async (db) => ({
        assessments: await db.select().from(tradeEdgeAssessments)
          .where(inArray(tradeEdgeAssessments.tradeId, tradeIds)),
        debriefs: await db.select().from(tradeDebriefs)
          .where(inArray(tradeDebriefs.tradeId, tradeIds)),
        tagLinks: await db.select({ tradeId: tradeTags.tradeId, tagId: tradeTags.tagId })
          .from(tradeTags).where(inArray(tradeTags.tradeId, tradeIds)),
        mistakeLinks: await db
          .select({ tradeDebriefId: tradeMistakeTags.tradeDebriefId, tagId: tradeMistakeTags.tagId })
          .from(tradeMistakeTags)
          .where(inArray(tradeMistakeTags.tradeDebriefId,
            (await db.select({ id: tradeDebriefs.id }).from(tradeDebriefs)
              .where(inArray(tradeDebriefs.tradeId, tradeIds))).map((d) => d.id).concat(
                "00000000-0000-0000-0000-000000000000"))),
      }))
    : { assessments: [], debriefs: [], tagLinks: [], mistakeLinks: [] };

  const explainers = {
    narratives: explainer("prep-narratives"),
    instrumentPrep: explainer("instrument-prep"),
    levels: explainer("prep-levels"),
    environment: explainer("environment"),
    hypotheses: explainer("hypotheses"),
    opportunities: explainer("opportunities"),
    edgeGrid: explainer("edge-grid"),
    tradeDebrief: explainer("trade-debrief"),
    dayDebrief: explainer("day-debrief"),
    plannedVsUnplanned: explainer("planned-vs-unplanned"),
  };

  return (
    <DayCockpit
      date={date}
      bundle={bundle}
      instruments={instruments}
      domains={domains}
      levelTypes={levelTypes}
      tags={tags}
      rules={rules}
      settings={{ minSampleSize: settings.minSampleSize, timezone: settings.timezone }}
      streak={streak}
      explainers={explainers}
      similarDays={similar}
      templates={templates}
      assessments={debriefState.assessments}
      tradeDebriefs={debriefState.debriefs}
      tradeTagLinks={debriefState.tagLinks}
      mistakeTagLinks={debriefState.mistakeLinks}
      openAction={typeof query.action === "string" ? query.action : null}
      focusPhase={typeof query.phase === "string" ? query.phase : null}
    />
  );
}
