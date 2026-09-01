/**
 * Generates ~40 sessions of realistic data so the Study screens can be judged
 * on day one rather than after a quarter of real trading.
 *
 * Deterministic: the same seed produces the same book, so a screenshot or a
 * test can be compared across runs. Everything is written through the same
 * RLS-scoped connection the app uses, which is also how we know RLS is not
 * quietly blocking writes.
 *
 *   DATABASE_URL=... npm run db:seed
 *   SEED_USER_ID=<uuid> npm run db:seed      # seed an existing account
 *   SEED_DAYS=60 npm run db:seed
 */
import "dotenv/config";
import postgres from "postgres";
import { sslFor } from "../lib/db/ssl";
import { resolveDatabaseUrl } from "../lib/db/url";

const url = resolveDatabaseUrl()?.url;
if (!url) throw new Error("DATABASE_URL is not set.");

const DAYS = Number(process.env.SEED_DAYS ?? 40);
const sql = postgres(url, { max: 1, ssl: sslFor(url), onnotice: () => {} });

/* ── deterministic randomness ──────────────────────────────────────────── */
let state = 0x2f6df6;
const rand = () => {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  return ((state >>> 0) % 1_000_000) / 1_000_000;
};
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const chance = (p: number) => rand() < p;

/* ── content ───────────────────────────────────────────────────────────── */
const THEMES = [
  "tariffs", "inflation", "labour market", "AI capex", "energy supply", "rate path",
  "China stimulus", "bank credit", "geopolitics", "earnings", "positioning",
];
const SETUPS = [
  "Failed auction at the ONH", "Open drive continuation", "Value area rejection",
  "Liquidation break through the LVN", "Balance edge fade", "IB extension pullback",
  "Excess low retest", "Gamma wall rejection",
];
const STRUCTURES = [
  "Balanced above yesterday's value; the auction is doing its job and both sides are being tested.",
  "Trend day residue overhead — a long tail from yesterday that nobody has repaired.",
  "Overnight inventory is short into the open and the RTH open sits above the ONH.",
  "Two-sided since the settlement, POC unchanged, nobody is committing before the release.",
  "Late-day liquidation left an unfinished low. Price has not been back to test it.",
];
const LADDER = [
  "Passive size stacked two ticks under the low; absorption held for eleven minutes.",
  "Initiative sellers lifting the bid on every pullback — no absorption, just pressure.",
  "Thin book above the IBH; a sweep here goes further than the size suggests.",
  "Iceberg refreshing at the VAH. Third test failed and the offer stayed.",
];
const ERROR_TAGS = [
  "chased the entry", "moved the stop", "oversized", "traded the chop",
  "no invalidation written", "revenge trade", "took profit too early",
];
const SETUP_TAGS = ["failed auction", "open drive", "value rejection", "liquidation break", "balance fade"];
const CONTEXT_TAGS = ["with the trend", "against the trend", "post-release", "pre-release", "thin liquidity"];
const EMOTION_TAGS = ["calm", "impatient", "frustrated", "focused", "tired", "hesitant"];
const RULES = [
  "Be flat before any major scheduled release.",
  "No trade without a written invalidation.",
  "Maximum two losers before stepping away for thirty minutes.",
  "Size down when conviction is below three.",
  "Never add to a position that is already offside.",
  "Trade only the opportunities scored this morning.",
];
const DAY_TYPES = ["trend_up", "trend_down", "double_distribution", "normal", "normal_variation", "neutral", "non_trend"];
const OPEN_TYPES = ["open_drive", "open_test_drive", "open_rejection_reverse", "open_auction"];
const EVENTS = [
  ["US CPI", 3], ["FOMC decision", 3], ["Non-farm payrolls", 3], ["ISM manufacturing", 2],
  ["Jobless claims", 1], ["ECB press conference", 3], ["Retail sales", 2], ["EIA crude stocks", 2],
] as const;

/** Weekdays only, ending yesterday. */
function tradingDates(count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date();
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (dates.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.reverse();
}

/** Prices a trader would actually see: snapped to the instrument's tick grid. */
const decimalsFor = (tick: number) => {
  const text = tick.toString();
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  return text.includes(".") ? text.split(".")[1].length : 0;
};
const onTick = (price: number, tick: number) =>
  Number((Math.round(price / tick) * tick).toFixed(decimalsFor(tick)));

const at = (date: string, hh: number, mm: number) =>
  new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`).toISOString();

async function main() {
  console.log(`Seeding ${DAYS} sessions…`);

  // 1. The account.
  let userId = process.env.SEED_USER_ID ?? null;
  if (!userId) {
    const existing = await sql<{ id: string }[]>`
      select id from auth.users where email = 'trader@example.com' limit 1`;
    if (existing[0]) userId = existing[0].id;
    else {
      const created = await sql<{ id: string }[]>`
        insert into auth.users (email) values ('trader@example.com') returning id`;
      userId = created[0].id;
    }
  }
  console.log(`user ${userId}`);

  // Everything below runs as that user, under RLS.
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx`select set_config('role', 'authenticated', true)`;

    const wipe = await tx`delete from trading_days where user_id = ${userId!} returning id`;
    if (wipe.length) console.log(`cleared ${wipe.length} existing sessions`);

    await tx`insert into user_settings (user_id) values (${userId!}) on conflict do nothing`;

    const instruments = await tx<{ id: string; symbol: string; tick_size: string; tick_value: string }[]>`
      select id, symbol, tick_size, tick_value from instruments where user_id is null`;
    const domains = await tx<{ id: string; key: string }[]>`
      select id, key from edge_domains where user_id is null order by sort_order`;
    const levelTypes = await tx<{ id: string; key: string }[]>`
      select id, key from level_types where user_id is null`;

    const bySymbol = new Map(instruments.map((i) => [i.symbol, i]));
    const core = ["ES", "NQ", "CL", "GC", "ZN", "6E"].map((s) => bySymbol.get(s)!).filter(Boolean);
    const levelType = (key: string) => levelTypes.find((t) => t.key === key)!.id;

    // 2. Tags and rules.
    const tagIds: Record<string, string[]> = { error: [], setup: [], context: [], emotion: [] };
    const addTags = async (labels: string[], category: string) => {
      for (const label of labels) {
        const rows = await tx<{ id: string }[]>`
          insert into tags (user_id, label, category) values (${userId!}, ${label}, ${category}::tag_category)
          on conflict do nothing returning id`;
        if (rows[0]) tagIds[category]?.push(rows[0].id);
      }
    };
    await addTags(ERROR_TAGS, "error");
    await addTags(SETUP_TAGS, "setup");
    await addTags(CONTEXT_TAGS, "context");
    await addTags(EMOTION_TAGS, "emotion");

    const ruleIds: string[] = [];
    for (const [i, text] of RULES.entries()) {
      const rows = await tx<{ id: string }[]>`
        insert into rules (user_id, text, sort_order) values (${userId!}, ${text}, ${i * 10})
        on conflict do nothing returning id`;
      if (rows[0]) ruleIds.push(rows[0].id);
    }
    if (!ruleIds.length) {
      const rows = await tx<{ id: string }[]>`select id from rules where user_id = ${userId!}`;
      ruleIds.push(...rows.map((r) => r.id));
    }

    // 3. The sessions.
    const dates = tradingDates(DAYS);
    let tradeTotal = 0;

    for (const [index, date] of dates.entries()) {
      // The most recent two days are left mid-flight, so the cockpit has
      // something unfinished to show.
      const closed = index < dates.length - 2;

      const dayType = pick(DAY_TYPES);
      const openType = pick(OPEN_TYPES);
      const volume = pick(["low", "average", "high"] as const);
      const volatility = pick(["low", "average", "high", "extreme"] as const);

      const [day] = await tx<{ id: string }[]>`
        insert into trading_days (user_id, date, status, actual_day_type, open_type,
                                  volume_regime, volatility_regime, discipline_score, execution_score)
        values (${userId!}, ${date}::date, ${closed ? "debriefed" : "live"}::day_status,
                ${closed ? dayType : null}::day_type, ${closed ? openType : null}::open_type,
                ${closed ? volume : null}::regime, ${closed ? volatility : null}::regime,
                ${closed ? intBetween(5, 10) : null}, ${closed ? intBetween(4, 10) : null})
        returning id`;

      const sessionRows = [
        ["asia", "Asia", "00:00", "07:00"], ["europe_pre", "Europe pre", "07:00", "08:00"],
        ["europe_rth", "Europe RTH", "08:00", "14:30"], ["us_pre", "US pre", "13:00", "14:30"],
        ["us_rth", "US RTH", "14:30", "18:00"], ["us_afternoon", "US afternoon", "18:00", "20:00"],
        ["settlement", "Settlement", "20:00", "22:00"],
      ] as const;
      const sessions: Record<string, string> = {};
      for (const [key, label, s, e] of sessionRows) {
        const [row] = await tx<{ id: string }[]>`
          insert into sessions (user_id, trading_day_id, key, label, start_time, end_time)
          values (${userId!}, ${day.id}, ${key}::session_key, ${label}, ${s}, ${e}) returning id`;
        sessions[key] = row.id;
      }

      // Narratives.
      for (const source of ["google_trends", "morning_bid_europe", "morning_bid_us", "news_terminal"]) {
        const themes = [pick(THEMES), pick(THEMES)].filter((v, i, a) => a.indexOf(v) === i);
        await tx`
          insert into prep_narratives (user_id, trading_day_id, source, raw_content, key_themes, sentiment)
          values (${userId!}, ${day.id}, ${source}::narrative_source,
                  ${`Attention concentrated on ${themes.join(" and ")}. ${pick([
                    "Search interest stepped up sharply overnight.",
                    "No change in attention from the prior session.",
                    "The desk narrative has rotated since the close.",
                    "Headlines are noisy but the cumulative tone is unchanged.",
                  ])}`},
                  ${themes}, ${intBetween(-2, 2)})`;
      }

      // Environment and calendar.
      await tx`
        insert into day_environment (user_id, trading_day_id, expected_environment,
                                     dynamic_calendar_note, options_note,
                                     flag_opex, flag_month_end, flag_quarter_end, flag_roll)
        values (${userId!}, ${day.id},
          ${`Expecting ${pick(["two-sided trade until the release", "an early drive then balance",
             "range extension on any acceptance outside value", "low participation and a tight range"])}. ` +
            `Volume ${volume}, volatility ${volatility}. ${pick(STRUCTURES)}`},
          ${chance(0.3) ? "Central bank speakers through the European morning." : null},
          ${chance(0.4) ? "Large gamma wall just above the prior settlement." : null},
          ${chance(0.08)}, ${date.slice(8) >= "27"}, ${chance(0.04)}, ${chance(0.06)})`;

      const eventCount = intBetween(0, 3);
      for (let i = 0; i < eventCount; i++) {
        const [name, importance] = pick(EVENTS);
        await tx`
          insert into scheduled_events (user_id, trading_day_id, scheduled_at, name, importance, consensus, prior, actual)
          values (${userId!}, ${day.id}, ${at(date, intBetween(8, 19), pick([0, 15, 30, 45]))},
                  ${name}, ${importance}, ${between(0, 4).toFixed(1)}, ${between(0, 4).toFixed(1)},
                  ${closed ? between(0, 4).toFixed(1) : null})`;
      }

      // Instrument prep and levels.
      const prepped = core.slice(0, intBetween(2, core.length));
      const levelsByInstrument = new Map<string, { id: string; price: number }[]>();

      for (const [order, instrument] of prepped.entries()) {
        const [prep] = await tx<{ id: string }[]>`
          insert into instrument_prep (user_id, trading_day_id, instrument_id, structure_note,
                                       vwap_slope, chart_pattern, prior_day_type, ladder_behaviour,
                                       expected_range_ticks, directional_bias, conviction, sort_order)
          values (${userId!}, ${day.id}, ${instrument.id}, ${pick(STRUCTURES)},
                  ${pick(["up", "flat", "down"])}::slope,
                  ${[pick(["balance", "wedge", "trend channel", "double distribution"])]},
                  ${pick(DAY_TYPES)}::day_type, ${pick(LADDER)},
                  ${intBetween(40, 220)}, ${pick(["short_bias", "neutral", "long_bias"])}::bias,
                  ${intBetween(1, 5)}, ${order * 10})
          returning id`;

        const anchor = { ES: 5400, NQ: 19000, CL: 72, GC: 2400, ZN: 110, "6E": 1.08 }[instrument.symbol] ?? 100;
        const tick = Number(instrument.tick_size);
        const created: { id: string; price: number }[] = [];

        for (const key of ["VAH", "VAL", "POC", "ONH", "ONL", "prior_settle", "IBH", "IBL"]) {
          if (chance(0.25)) continue;
          const price = onTick(anchor * (1 + between(-0.008, 0.008)), tick);
          const [level] = await tx<{ id: string }[]>`
            insert into prep_levels (user_id, instrument_prep_id, level_type_id, price, strength, note, source)
            values (${userId!}, ${prep.id}, ${levelType(key)}, ${price}, ${intBetween(1, 3)},
                    ${chance(0.4) ? pick(["untested since Tuesday", "held twice already", "thin above"]) : null},
                    'chart'::level_source)
            returning id`;
          created.push({ id: level.id, price });

          // What price actually did there.
          if (closed && chance(0.8)) {
            const reaction = pick(["respected", "broke", "broke_and_retested", "no_touch"] as const);
            await tx`
              insert into level_interactions (user_id, prep_level_id, reaction, reaction_ticks, first_touch_at)
              values (${userId!}, ${level.id}, ${reaction}::level_reaction,
                      ${reaction === "no_touch" ? null : intBetween(2, 40)},
                      ${reaction === "no_touch" ? null : at(date, intBetween(8, 20), intBetween(0, 59))})`;
          }
        }
        levelsByInstrument.set(instrument.id, created);
      }

      // Hypotheses, each a route through the marked levels.
      const hypIds: { id: string; instrumentId: string }[] = [];
      for (let rank = 1; rank <= intBetween(1, 3); rank++) {
        const instrument = pick(prepped);
        const [hyp] = await tx<{ id: string }[]>`
          insert into hypotheses (user_id, trading_day_id, instrument_id, label, rank, narrative,
                                  trigger_conditions, invalidation, assigned_probability,
                                  expected_move_ticks, planned_response, outcome, outcome_note,
                                  outcome_recorded_at)
          values (${userId!}, ${day.id}, ${instrument.id},
            ${pick(["Rotation back through value", "Trend day from the open", "Failed breakout and reversion",
                    "Liquidation into the prior low", "Balance holds all session"])},
            ${rank},
            ${`Price ${pick(["opens above value and fails", "drives from the open and holds",
               "tests the overnight extreme and rejects"])}, then ${pick(["rotates to the POC",
               "extends through the IB", "grinds back into balance"])}.`},
            ${"Acceptance " + pick(["above the ONH", "below the VAL", "through the IBH"]) + " on increasing volume."},
            ${pick(["Acceptance back inside value for more than fifteen minutes.",
                    "A close above the excess high.", "Two failed tests with absorption."])},
            ${intBetween(25, 75)}, ${intBetween(20, 160)},
            ${pick(["Full size at the level, scale out into the target.",
                    "Half size, add only on a retest that holds.",
                    "Wait for the second entry. No first-touch trades."])},
            ${closed ? pick(["played_out", "partial", "invalidated", "never_triggered"]) : null}::hypothesis_outcome,
            ${closed && chance(0.5) ? "Read was right, the timing was not." : null},
            ${closed ? at(date, 21, 30) : null})
          returning id`;
        hypIds.push({ id: hyp.id, instrumentId: instrument.id });

        const path = (levelsByInstrument.get(instrument.id) ?? []).slice(0, intBetween(2, 4));
        for (const [i, level] of path.entries()) {
          await tx`
            insert into hypothesis_path_levels (user_id, hypothesis_id, prep_level_id, ordinal)
            values (${userId!}, ${hyp.id}, ${level.id}, ${i + 1})
            on conflict do nothing`;
        }
      }

      // Opportunities.
      const oppIds: { id: string; instrumentId: string; hypothesisId: string | null }[] = [];
      for (let i = 0; i < intBetween(1, 4); i++) {
        const hyp = hypIds.length && chance(0.75) ? pick(hypIds) : null;
        const instrumentId = hyp?.instrumentId ?? pick(prepped).id;
        const [opp] = await tx<{ id: string }[]>`
          insert into opportunities (user_id, trading_day_id, hypothesis_id, instrument_id, setup_name,
                                     location_note, entry_trigger, invalidation, target,
                                     primary_edge_domain_id, potential_ticks, estimated_probability)
          values (${userId!}, ${day.id}, ${hyp?.id ?? null}, ${instrumentId}, ${pick(SETUPS)},
                  ${pick(["at the VAH", "at the overnight low", "into the LVN", "at the prior settlement"])},
                  ${pick(["Rejection on the ladder with absorption.",
                          "Second test with a smaller push and no follow-through.",
                          "Sweep of the stops and an immediate reclaim.",
                          "Delta divergence into the level."])},
                  ${pick(["Acceptance through the level.",
                          "Two consecutive closes beyond it.",
                          "Size showing on the wrong side of the book."])},
                  ${pick(["POC", "the opposite value edge", "the initial balance extension"])},
                  ${pick(domains).id}, ${intBetween(15, 120)}, ${intBetween(30, 80)})
          returning id`;
        oppIds.push({ id: opp.id, instrumentId, hypothesisId: hyp?.id ?? null });
      }

      // Session reassessments.
      for (const key of ["europe_rth", "us_rth"]) {
        await tx`
          insert into session_preps (user_id, session_id, reassessment, what_changed, updated_bias,
                                     energy_level, mental_state_tags)
          values (${userId!}, ${sessions[key]},
            ${pick(["Nothing has changed; the plan stands.",
                    "The overnight range has already been taken out, so the primary is weaker.",
                    "Volume is well below average — halve the size expectations."])},
            ${pick(["Dollar reversed since the European open.", "No change.", "Bond auction went badly."])},
            ${pick(["short_bias", "neutral", "long_bias"])}::bias,
            ${intBetween(2, 5)}, ${[pick(EMOTION_TAGS)]})`;
      }

      // Trades.
      const tradeCount = closed ? intBetween(0, 7) : intBetween(0, 4);
      for (let i = 0; i < tradeCount; i++) {
        const opp = oppIds.length && chance(0.7) ? pick(oppIds) : null;
        const instrument = opp
          ? instruments.find((x) => x.id === opp.instrumentId)!
          : pick(prepped);
        const tick = Number(instrument.tick_size);
        const anchor = { ES: 5400, NQ: 19000, CL: 72, GC: 2400, ZN: 110, "6E": 1.08 }[instrument.symbol] ?? 100;

        const direction = chance(0.5) ? "long" : "short";
        const planned = chance(0.72);
        const size = intBetween(1, 4);
        const entryHour = intBetween(8, 20);
        const entryMin = intBetween(0, 59);
        const entryAt = at(date, entryHour, entryMin);
        const held = intBetween(60, 3000);
        const exitAt = new Date(new Date(entryAt).getTime() + held * 1000).toISOString();

        // Planned trades are given a modestly better edge, which is what the
        // plan-adherence card is there to reveal.
        const edge = planned ? between(-1.1, 1.6) : between(-1.5, 1.05);
        const entryPrice = onTick(anchor * (1 + between(-0.004, 0.004)), tick);
        const ticksMoved = Math.round(edge * intBetween(6, 34));
        const exitPrice = onTick(
          entryPrice + ticksMoved * tick * (direction === "long" ? 1 : -1), tick);
        const stop = onTick(
          entryPrice - intBetween(6, 20) * tick * (direction === "long" ? 1 : -1), tick);

        const [trade] = await tx<{ id: string }[]>`
          insert into trades (user_id, trading_day_id, session_id, instrument_id, hypothesis_id,
                              opportunity_id, direction, entry_at, exit_at, initial_stop,
                              planned, entry_style, exit_reason, mae_ticks, mfe_ticks,
                              conviction, size_vs_plan, notes)
          values (${userId!}, ${day.id},
                  ${entryHour < 14 ? sessions.europe_rth : entryHour < 18 ? sessions.us_rth : sessions.us_afternoon},
                  ${instrument.id}, ${opp?.hypothesisId ?? null}, ${opp?.id ?? null},
                  ${direction}::trade_direction, ${entryAt}, ${exitAt}, ${stop},
                  ${planned}, ${pick(["limit", "market", "stop", "scaled"])}::entry_style,
                  ${pick(["target", "stop", "trail", "time", "discretionary", "news", "management_error"])}::exit_reason,
                  ${intBetween(1, 24)}, ${intBetween(2, 60)},
                  ${intBetween(1, 5)}, ${pick(["under", "as_planned", "over"])}::size_vs_plan,
                  ${chance(0.4) ? pick(["Good location, poor patience.", "Textbook.", "Should not have taken it."]) : null})
          returning id`;

        await tx`
          insert into trade_executions (user_id, trade_id, side, price, quantity, executed_at, is_entry, commission)
          values (${userId!}, ${trade.id}, ${direction === "long" ? "buy" : "sell"}::execution_side,
                  ${entryPrice}, ${size}, ${entryAt}, true, ${(size * 1.1).toFixed(2)}),
                 (${userId!}, ${trade.id}, ${direction === "long" ? "sell" : "buy"}::execution_side,
                  ${exitPrice}, ${size}, ${exitAt}, false, ${(size * 1.1).toFixed(2)})`;

        if (closed) {
          // The five-domain grid: one primary, the rest scored honestly.
          const primary = pick(domains);
          for (const domain of domains) {
            const isPrimary = domain.id === primary.id;
            const alignment = isPrimary
              ? pick(["supportive", "supportive", "neutral", "conflicting"] as const)
              : pick(["not_applicable", "not_applicable", "neutral", "supportive", "conflicting"] as const);
            await tx`
              insert into trade_edge_assessments (user_id, trade_id, edge_domain_id, alignment, weight, was_primary)
              values (${userId!}, ${trade.id}, ${domain.id}, ${alignment}::domain_alignment,
                      ${isPrimary ? 3 : alignment === "not_applicable" ? 0 : intBetween(1, 2)}, ${isPrimary})`;
          }

          const [debrief] = await tx<{ id: string }[]>`
            insert into trade_debriefs (user_id, trade_id, context_note, edge_note, process_note,
                                        execution_quality, management_quality, entry_quality, exit_quality,
                                        emotional_state_entry, emotional_state_exit,
                                        what_i_saw, what_was_actually_there, lesson, repeatable)
            values (${userId!}, ${trade.id},
              ${pick(["Right location, right day type.", "Location was fine, the context was not.",
                      "Traded into an event I should have been flat for."])},
              ${pick(["The edge was real and the ladder confirmed it.",
                      "There was no edge here — I wanted a trade.",
                      "Edge was present but small for the risk taken."])},
              ${pick(["Executed as planned.", "Entry was late by four ticks.",
                      "Managed it well, exited on the plan.", "Moved the stop. Again."])},
              ${intBetween(1, 5)}, ${intBetween(1, 5)}, ${intBetween(1, 5)}, ${intBetween(1, 5)},
              ${[pick(EMOTION_TAGS)]}, ${[pick(EMOTION_TAGS)]},
              ${"Absorption at the level and a failed push through."},
              ${pick(["Exactly that.", "Thinner than I thought — the size was refreshing, not absorbing.",
                      "A pause, not a rejection."])},
              ${pick(["Wait for the second test.", "Be flat before the release.",
                      "Size to conviction, not to boredom."])},
              ${chance(0.6)})
            returning id`;

          if (chance(0.35) && tagIds.error.length) {
            await tx`
              insert into trade_mistake_tags (user_id, trade_debrief_id, tag_id)
              values (${userId!}, ${debrief.id}, ${pick(tagIds.error)})
              on conflict do nothing`;
          }
          for (const category of ["setup", "context"] as const) {
            if (tagIds[category].length && chance(0.7)) {
              await tx`
                insert into trade_tags (user_id, trade_id, tag_id)
                values (${userId!}, ${trade.id}, ${pick(tagIds[category])})
                on conflict do nothing`;
            }
          }
        }
        tradeTotal++;
      }

      // Notes through the day, including regroundings.
      for (let i = 0; i < intBetween(0, 4); i++) {
        await tx`
          insert into day_notes (user_id, trading_day_id, noted_at, body, kind)
          values (${userId!}, ${day.id}, ${at(date, intBetween(8, 21), intBetween(0, 59))},
            ${pick(["Volume is drying up into the release.", "Bonds leading equities again.",
                    "I am impatient. Slow down.", "The primary hypothesis is still intact.",
                    "Revisited the plan."])},
            ${pick(["observation", "emotion", "market_event", "reground"])}::day_note_kind)`;
      }

      if (closed) {
        const [debrief] = await tx<{ id: string }[]>`
          insert into day_debriefs (user_id, trading_day_id, hypothesis_vs_reality,
                                    what_the_market_actually_did, what_i_did_well, what_i_did_poorly,
                                    biggest_missed_opportunity, biggest_avoided_mistake, lessons,
                                    focus_rating, physical_state, emotional_control)
          values (${userId!}, ${day.id},
            ${pick(["The primary played out almost exactly, but two hours later than I expected.",
                    "Invalidated within the first thirty minutes and I was slow to accept it.",
                    "Never triggered. The day was the secondary hypothesis throughout."])},
            ${`${pick(DAY_TYPES).replace(/_/g, " ")} with ${volume} volume and ${volatility} volatility.`},
            ${pick(["Stayed flat through the release.", "Sized correctly on the best location.",
                    "Waited for the second entry every time."])},
            ${pick(["Took two trades in the chop after lunch.", "Moved a stop.",
                    "Let a winner turn into a scratch."])},
            ${pick(["The liquidation break at 15:20.", "Nothing — I took what was there.",
                    "The reversal off the excess low."])},
            ${pick(["Did not chase the open.", "Skipped the second-guess trade.", "Stopped after two losers."])},
            ${pick(["My reads are fine. My patience is the problem.",
                    "Stop trading the first test.",
                    "Conviction below three should mean no trade, not small trade."])},
            ${intBetween(2, 5)}, ${intBetween(2, 5)}, ${intBetween(2, 5)})
          returning id`;

        if (chance(0.5)) {
          await tx`
            insert into day_debrief_actions (user_id, day_debrief_id, action_text, due_date, completed_at)
            values (${userId!}, ${debrief.id},
              ${pick(["Review every first-touch trade this month.",
                      "Write the invalidation before the entry, without exception.",
                      "Re-read the plan at 15:00 every day this week."])},
              ${date}::date + 7, ${chance(0.6) ? at(date, 22, 0) : null})`;
        }

        for (const ruleId of ruleIds) {
          await tx`
            insert into rule_checks (user_id, trading_day_id, rule_id, status)
            values (${userId!}, ${day.id}, ${ruleId},
              ${pick(["followed", "followed", "followed", "broken", "not_applicable"])}::rule_status)
            on conflict do nothing`;
        }
      }
    }

    // 4. A couple of weekly reviews over the seeded window.
    for (let i = 0; i < 3; i++) {
      const start = dates[Math.max(0, dates.length - (i + 1) * 5)];
      const end = dates[Math.min(dates.length - 1, dates.length - i * 5 - 1)];
      if (!start || !end || start > end) continue;
      await tx`
        insert into reviews (user_id, period_start, period_end, type, summary, themes, focus_next_period)
        values (${userId!}, ${start}::date, ${end}::date, 'weekly'::review_type,
          ${"Reads were good; the improvised trades gave back most of the week's edge."},
          ${[pick(THEMES), pick(THEMES)]},
          ${"No trade that was not scored in the morning."})
        on conflict do nothing`;
    }

    console.log(`seeded ${dates.length} sessions, ${tradeTotal} trades`);
  });

  // 5. What the trader will actually see.
  const summary = await sql<{ days: string; trades: string; net: string }[]>`
    select (select count(*) from trading_days where user_id = ${userId!}) as days,
           (select count(*) from trades where user_id = ${userId!}) as trades,
           (select coalesce(sum(net_pnl), 0) from trades where user_id = ${userId!}) as net`;
  console.log(
    `done — ${summary[0].days} days, ${summary[0].trades} trades, ` +
    `net ${Number(summary[0].net).toFixed(2)}`,
  );
  console.log(`\nSet DEV_USER_ID=${userId} in .env.local to sign in as this account locally.`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
