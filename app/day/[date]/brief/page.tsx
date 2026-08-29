import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDayBundle } from "@/lib/queries/day";
import { getEdgeDomains, getInstruments, getLevelTypes, getRules } from "@/lib/queries/reference";
import { dayLabel, isValidISODate, localTime } from "@/lib/time";
import { Markdown } from "@/lib/markdown";
import { formatPrice, num } from "@/lib/pnl";
import { humanise } from "@/lib/format";
import { BriefToolbar } from "@/components/brief/toolbar";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return { title: isValidISODate(date) ? `Brief — ${dayLabel(date)}` : "Brief" };
}

export default async function BriefPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidISODate(date)) notFound();

  const user = await requireUser();
  const [bundle, instruments, levelTypes, domains, rules] = await Promise.all([
    getDayBundle(user.id, date),
    getInstruments(user.id),
    getLevelTypes(user.id),
    getEdgeDomains(user.id),
    getRules(user.id),
  ]);

  const instrumentById = new Map(instruments.map((i) => [i.id, i]));
  const levelTypeById = new Map(levelTypes.map((t) => [t.id, t]));
  const ranked = [...bundle.hypotheses].sort((a, b) => a.rank - b.rank);

  return (
    <div className="mx-auto max-w-[820px]">
      <BriefToolbar date={date} dayId={bundle.day.id} />

      <article className="print:max-w-none">
        <header className="mb-6 print-block">
          <h1 className="text-32 font-[590] tracking-[-0.02em] leading-[1.15]">
            {dayLabel(date)}
          </h1>
          <p className="text-13 [color:var(--text-secondary)] mt-1">
            Preparation and plan · prepared in Europe/Lisbon time
          </p>
        </header>

        {bundle.environment?.expectedEnvironment && (
          <section className="mb-7 print-block">
            <h2 className="label mb-1.5">Expected environment</h2>
            <div className="text-15 leading-[1.55] max-w-[68ch]">
              <Markdown source={bundle.environment.expectedEnvironment} />
            </div>
          </section>
        )}

        {(bundle.events.length > 0 || flowFlags(bundle.environment).length > 0) && (
          <section className="mb-7 print-block">
            <h2 className="label mb-1.5">The day's calendar</h2>
            {bundle.events.length > 0 && (
              <table className="w-full text-13 border-collapse mb-2">
                <tbody>
                  {bundle.events.map((e) => (
                    <tr key={e.id} className="border-b border-[var(--line)]">
                      <td className="py-1 pr-4 mono w-14 align-top">{localTime(e.scheduledAt)}</td>
                      <td className="py-1 pr-4">{e.name}</td>
                      <td className="py-1 pr-4 [color:var(--text-tertiary)] text-11 align-top">
                        {"•".repeat(e.importance)}
                      </td>
                      <td className="py-1 [color:var(--text-secondary)] text-12">
                        {[e.consensus && `cons. ${e.consensus}`, e.prior && `prior ${e.prior}`,
                          e.actual && `actual ${e.actual}`].filter(Boolean).join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {flowFlags(bundle.environment).length > 0 && (
              <p className="text-12 [color:var(--text-secondary)]">
                {flowFlags(bundle.environment).join(" · ")}
              </p>
            )}
            {bundle.environment?.dynamicCalendarNote && (
              <div className="text-13 [color:var(--text-secondary)] mt-1">
                <Markdown source={bundle.environment.dynamicCalendarNote} />
              </div>
            )}
          </section>
        )}

        {bundle.narratives.some((n) => n.rawContent?.trim()) && (
          <section className="mb-7 print-block">
            <h2 className="label mb-1.5">Narratives</h2>
            <div className="space-y-3">
              {bundle.narratives.filter((n) => n.rawContent?.trim()).map((n) => (
                <div key={n.id} className="break-inside-avoid">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-13 font-[590]">{humanise(n.source)}</h3>
                    {n.sentiment !== null && (
                      <span className="text-11 num [color:var(--text-tertiary)]">
                        sentiment {n.sentiment > 0 ? "+" : ""}{n.sentiment}
                      </span>
                    )}
                    {n.keyThemes.length > 0 && (
                      <span className="text-11 [color:var(--text-tertiary)]">
                        {n.keyThemes.join(" · ")}
                      </span>
                    )}
                  </div>
                  <div className="text-13 [color:var(--text-secondary)] max-w-[68ch]">
                    <Markdown source={n.rawContent} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {ranked.length > 0 && (
          <section className="mb-7">
            <h2 className="label mb-2">Hypotheses</h2>
            <div className="space-y-5">
              {ranked.map((h) => {
                const instrument = instrumentById.get(h.instrumentId);
                const tickSize = num(instrument?.tickSize, 0.25);
                const path = bundle.paths.filter((p) => p.hypothesisId === h.id);
                return (
                  <div
                    key={h.id}
                    className={`print-block pl-3 ${h.rank === 1 ? "border-l-2 border-l-[var(--accent)]" : "border-l border-l-[var(--line)]"}`}
                  >
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-11 num [color:var(--text-tertiary)]">{h.rank}</span>
                      <span className="mono text-13 font-[590]">{instrument?.symbol}</span>
                      <h3 className="text-17 font-[590]">{h.label}</h3>
                      {h.assignedProbability !== null && (
                        <span className="text-12 num [color:var(--text-secondary)]">
                          {h.assignedProbability}%
                        </span>
                      )}
                      {h.expectedMoveTicks !== null && (
                        <span className="text-12 num [color:var(--text-secondary)]">
                          {h.expectedMoveTicks} ticks
                        </span>
                      )}
                    </div>

                    {path.length > 0 && (
                      <ol className="flex flex-wrap items-center gap-1.5 mt-1.5 text-11">
                        {path.map((p, i) => {
                          const level = bundle.levels.find((l) => l.id === p.prepLevelId);
                          const type = level ? levelTypeById.get(level.levelTypeId) : null;
                          return (
                            <li key={p.prepLevelId} className="flex items-center gap-1.5">
                              {i > 0 && <span aria-hidden className="[color:var(--text-tertiary)]">→</span>}
                              <span className="mono px-1.5 py-0.5 rounded-[var(--r-pill)] bg-[var(--bg-hover)] print:bg-transparent print:border print:border-[var(--line)]">
                                {type?.label} {level ? formatPrice(level.price, tickSize) : ""}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    )}

                    <div className="text-13 max-w-[68ch] mt-1">
                      <Markdown source={h.narrative} />
                    </div>

                    <dl className="mt-1.5 space-y-1 text-12">
                      {h.triggerConditions && (
                        <div className="flex gap-2">
                          <dt className="label w-[104px] shrink-0 pt-0.5">Trigger</dt>
                          <dd className="[color:var(--text-secondary)]">{h.triggerConditions}</dd>
                        </div>
                      )}
                      {h.invalidation && (
                        <div className="flex gap-2">
                          <dt className="label w-[104px] shrink-0 pt-0.5">Invalidation</dt>
                          <dd className="[color:var(--text-secondary)]">{h.invalidation}</dd>
                        </div>
                      )}
                      {h.plannedResponse && (
                        <div className="flex gap-2">
                          <dt className="label w-[104px] shrink-0 pt-0.5">Response</dt>
                          <dd className="[color:var(--text-secondary)]">{h.plannedResponse}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {bundle.opportunities.length > 0 && (
          <section className="mb-7 print-block">
            <h2 className="label mb-1.5">Opportunities, by asymmetry</h2>
            <table className="w-full text-12 border-collapse">
              <thead>
                <tr>
                  {["Asym.", "Setup", "Instr.", "Location", "Trigger", "Target"].map((h) => (
                    <th key={h} className="label font-[560] text-left py-1 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bundle.opportunities.map((o) => (
                  <tr key={o.id} className="border-t border-[var(--line)]">
                    <td className="py-1 pr-3 num font-[590]">
                      {o.asymmetryScore === null ? "—" : num(o.asymmetryScore).toFixed(1)}
                    </td>
                    <td className="py-1 pr-3">{o.setupName}</td>
                    <td className="py-1 pr-3 mono">{instrumentById.get(o.instrumentId)?.symbol}</td>
                    <td className="py-1 pr-3 [color:var(--text-secondary)]">{o.locationNote ?? "—"}</td>
                    <td className="py-1 pr-3 [color:var(--text-secondary)]">{o.entryTrigger ?? "—"}</td>
                    <td className="py-1 [color:var(--text-secondary)]">{o.target ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="mb-7">
          <h2 className="label mb-2">Levels</h2>
          <div className="space-y-5">
            {bundle.preps.map((prep) => {
              const instrument = instrumentById.get(prep.instrumentId);
              const tickSize = num(instrument?.tickSize, 0.25);
              const levels = bundle.levels.filter((l) => l.instrumentPrepId === prep.id);
              return (
                <div key={prep.id} className="print-block">
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="mono text-15 font-[590]">{instrument?.symbol}</h3>
                    <span className="text-12 [color:var(--text-secondary)]">{instrument?.name}</span>
                    {prep.directionalBias && (
                      <span className="text-11 [color:var(--text-tertiary)]">
                        {humanise(prep.directionalBias)}
                        {prep.conviction !== null && ` · conviction ${prep.conviction}`}
                      </span>
                    )}
                    {prep.expectedRangeTicks !== null && (
                      <span className="text-11 num [color:var(--text-tertiary)]">
                        expected range {prep.expectedRangeTicks} ticks
                      </span>
                    )}
                  </div>

                  {prep.structureNote && (
                    <div className="text-13 max-w-[68ch] [color:var(--text-secondary)]">
                      <Markdown source={prep.structureNote} />
                    </div>
                  )}
                  {prep.ladderBehaviour && (
                    <div className="text-13 max-w-[68ch] [color:var(--text-secondary)]">
                      <Markdown source={prep.ladderBehaviour} />
                    </div>
                  )}

                  {levels.length > 0 && (
                    <table className="w-full text-12 border-collapse mt-1.5">
                      <thead>
                        <tr>
                          {["Level", "Price", "Strength", "Note"].map((h) => (
                            <th key={h} className="label font-[560] text-left py-1 pr-3">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {levels.map((l) => (
                          <tr key={l.id} className="border-t border-[var(--line)]">
                            <td className="py-1 pr-3">{levelTypeById.get(l.levelTypeId)?.label}</td>
                            <td className="py-1 pr-3 mono">
                              {formatPrice(l.price, tickSize)}
                              {l.secondaryPrice && ` – ${formatPrice(l.secondaryPrice, tickSize)}`}
                            </td>
                            <td className="py-1 pr-3 [color:var(--text-tertiary)]">{"•".repeat(l.strength)}</td>
                            <td className="py-1 [color:var(--text-secondary)]">{l.note ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
            {bundle.preps.length === 0 && (
              <p className="text-13 [color:var(--text-secondary)]">
                No instruments prepared for this day.{" "}
                <Link href={`/day/${date}`} className="[color:var(--accent)] hover:underline">
                  Go and prepare it.
                </Link>
              </p>
            )}
          </div>
        </section>

        {rules.length > 0 && (
          <section className="print-block">
            <h2 className="label mb-1.5">Rules</h2>
            <ul className="text-13 space-y-1">
              {rules.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <span aria-hidden className="[color:var(--text-tertiary)]">—</span>
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}

function flowFlags(env: { flagOpex: boolean; flagMonthEnd: boolean; flagQuarterEnd: boolean;
  flagRoll: boolean; flagAuction: boolean; flagHoliday: boolean } | null): string[] {
  if (!env) return [];
  return [
    env.flagOpex && "OPEX", env.flagMonthEnd && "Month end", env.flagQuarterEnd && "Quarter end",
    env.flagRoll && "Roll", env.flagAuction && "Auction", env.flagHoliday && "Holiday",
  ].filter((v): v is string => Boolean(v));
}
