import { requireUser } from "@/lib/auth";
import { getInstruments, getSettings } from "@/lib/queries/reference";
import { withUser } from "@/lib/db/client";
import { prepTemplates } from "@/lib/db/schema";
import { SettingsView } from "@/components/settings/view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, instruments, templates] = await Promise.all([
    getSettings(user.id),
    getInstruments(user.id),
    withUser(user.id, (db) => db.select().from(prepTemplates).orderBy(prepTemplates.name)),
  ]);

  return (
    <SettingsView
      email={user.email}
      settings={{
        timezone: settings.timezone,
        minSampleSize: settings.minSampleSize,
        defaultInstrumentId: settings.defaultInstrumentId,
      }}
      instruments={instruments.map((i) => ({ id: i.id, symbol: i.symbol, name: i.name }))}
      templates={templates.map((t) => ({ id: t.id, name: t.name, kind: t.kind }))}
    />
  );
}
