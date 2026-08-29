import { desc } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db/client";
import { reviews } from "@/lib/db/schema";
import { dayStats } from "@/lib/study/queries";
import { weekBounds, todayISO } from "@/lib/time";
import { ReviewsView } from "@/components/reviews/view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviews" };

export default async function ReviewsPage() {
  const user = await requireUser();
  const [rows, days] = await Promise.all([
    withUser(user.id, (db) =>
      db.select().from(reviews).orderBy(desc(reviews.periodStart)).limit(60)),
    dayStats(user.id, {}),
  ]);

  return (
    <ReviewsView
      reviews={rows.map((r) => ({
        id: r.id, type: r.type, periodStart: r.periodStart, periodEnd: r.periodEnd,
        summary: r.summary, themes: r.themes, focusNextPeriod: r.focusNextPeriod,
      }))}
      days={days}
      thisWeek={weekBounds(todayISO())}
    />
  );
}
