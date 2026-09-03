import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db/client";
import { savedViews } from "@/lib/db/schema";
import { serialiseFilter, type StudyFilter } from "@/lib/study/filters";

export const dynamic = "force-dynamic";

/** A saved view is its filter — resolve it and hand off to the workspace. */
export default async function SavedViewPage({ params }: { params: Promise<{ viewId: string }> }) {
  const { viewId } = await params;
  const user = await requireUser();

  const rows = await withUser(user.id, (db) =>
    db.select().from(savedViews).where(eq(savedViews.id, viewId)).limit(1),
  );
  const view = rows[0];
  if (!view) notFound();

  redirect(`/study?${serialiseFilter(view.query as StudyFilter).toString()}`);
}
