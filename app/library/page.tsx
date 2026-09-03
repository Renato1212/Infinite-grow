import { requireUser } from "@/lib/auth";
import {
  getEdgeDomains, getInstruments, getLevelTypes, getRules, getTags,
} from "@/lib/queries/reference";
import { LibraryView } from "@/components/library/view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Library" };

export default async function LibraryPage() {
  const user = await requireUser();
  const [instruments, domains, levelTypes, tags, rules] = await Promise.all([
    getInstruments(user.id),
    getEdgeDomains(user.id),
    getLevelTypes(user.id),
    getTags(user.id),
    getRules(user.id),
  ]);

  return (
    <LibraryView
      instruments={instruments}
      domains={domains}
      levelTypes={levelTypes}
      tags={tags}
      rules={rules}
    />
  );
}
