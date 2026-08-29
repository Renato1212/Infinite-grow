import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTrade } from "@/lib/queries/trade";
import { getEdgeDomains, getTags } from "@/lib/queries/reference";
import { explainer } from "@/lib/explainers";
import { TradeDetailView } from "@/components/trades/detail";

export const dynamic = "force-dynamic";

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const detail = await getTrade(user.id, id);
  if (!detail) notFound();

  const [domains, tags] = await Promise.all([getEdgeDomains(user.id), getTags(user.id)]);

  return (
    <TradeDetailView
      detail={detail}
      domains={domains}
      tags={tags}
      edgeExplainer={explainer("edge-grid")}
      debriefExplainer={explainer("trade-debrief")}
    />
  );
}
