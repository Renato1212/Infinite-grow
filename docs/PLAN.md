# Plan — Deliberate Practice trading journal

Written before implementation, per §10 of the brief. Three parts: schema, routes, design tokens.
At the end, a list of the places where I deliberately deviated from the brief and why.

---

## 1. Schema

Postgres 15 (Supabase). Every table has `user_id uuid not null references auth.users`, `created_at`,
`updated_at`, and an RLS policy `user_id = auth.uid()` for all four verbs. Money and prices are
`numeric`, never float. Timestamps are `timestamptz`; `trading_days.date` is a plain `date`.

### 1.1 Reference

| table | shape | notes |
|---|---|---|
| `instruments` | symbol, name, exchange, product_group, tick_size, tick_value, point_value, currency, rth_open/close (time), is_active, sort_order | seeded with the 21 instruments in §1. `user_id` nullable — null rows are global seeds, non-null are user overrides |
| `edge_domains` | key, label, description, sort_order, color_hue, archived | seeded with the five Axia domains, **rows not enums**, so a sixth can be added without touching historical assessments |
| `tags` | label, category enum, color, archived | unique on (user_id, lower(label)) so autocomplete can never produce a near-duplicate |
| `level_types` | key, label, sort_order, group | seeded lookup from §3.1 |
| `rules` | text, active, sort_order | process rules, checked daily |

### 1.2 Day container

`trading_days(user_id, date unique per user, status, actual_day_type, open_type, volume_regime,
volatility_regime, discipline_score, execution_score, process_adherence_pct, + denormalised
net_pnl/gross_pnl/commissions/trade_count/win_count)`.

The denormalised columns are maintained by a trigger `recompute_trading_day_aggregates()` firing on
`trades` insert/update/delete. `process_adherence_pct` is recomputed by a trigger on `rule_checks`.
Nothing is hand-maintained. Enums are Postgres enums where the set is genuinely closed
(`day_status`, `direction`, `alignment`), and lookup tables where it is not (domains, level types, tags).

### 1.3 Prepare

- `prep_narratives(trading_day_id, source, raw_content, key_themes text[], sentiment smallint check -2..2, source_url, captured_at)`
- `instrument_prep(trading_day_id, instrument_id, structure_note, vwap_slope, chart_pattern text[], prior_day_type, prior_session_note, ladder_behaviour, expected_range_ticks, directional_bias, conviction)` — unique on (trading_day_id, instrument_id)
- `prep_levels(instrument_prep_id, level_type_id, price numeric, secondary_price, timeframe, strength 1-3, note, source)`
- `level_interactions(prep_level_id unique, first_touch_at, reaction, reaction_ticks, note)` — 1:1 with a level, so "what actually happened at this line" is a column-level fact, not prose
- `day_environment(trading_day_id unique, dynamic_calendar_note, options_note, expected_environment, flag_opex, flag_month_end, flag_quarter_end, flag_roll, flag_auction, flag_holiday, flow_note)`
- `scheduled_events(trading_day_id, scheduled_at, name, importance 1-3, consensus, actual, prior, note)` + `scheduled_event_instruments` join
- `hypotheses(trading_day_id, instrument_id, label, rank, narrative, trigger_conditions, invalidation, assigned_probability, expected_move_ticks, planned_response, outcome, outcome_note, outcome_recorded_at)`
- `hypothesis_path_levels(hypothesis_id, prep_level_id, ordinal)` — a hypothesis is literally a route through marked levels
- `opportunities(trading_day_id, hypothesis_id nullable, instrument_id, setup_name, location_note, entry_trigger, invalidation, target, primary_edge_domain_id, estimated_probability, potential_ticks, asymmetry_score generated)` + `opportunity_supporting_domains` join
- `sessions(trading_day_id, key, label, start_time, end_time)` and `session_preps(session_id, reassessment, what_changed, updated_bias, energy_level, mental_state_tags)`

`asymmetry_score` is a **generated column** (`potential_ticks * estimated_probability / 100`) — the brief
says "computed and stored"; a generated column is stored and can never drift from its inputs.

### 1.4 Trades

- `trades(trading_day_id, session_id, instrument_id, hypothesis_id, opportunity_id, direction, entry_at, exit_at, duration_seconds generated, avg_entry_price, avg_exit_price, max_size, initial_stop, initial_target, planned bool, entry_style, exit_reason, mae_ticks, mfe_ticks, ticks_captured, r_multiple, gross_pnl, commissions, net_pnl, conviction, size_vs_plan, notes)`
- `trade_executions(trade_id, side, price, quantity, executed_at, is_entry, commission)` — the source of truth
- Trigger `recompute_trade_from_executions()` on `trade_executions` recomputes avg prices, max size, ticks, gross/net P&L and R multiple using the instrument's tick size/value. The trade row's money columns are never writable by the client.
- `trade_tags`, `trade_edge_assessments(trade_id, edge_domain_id, alignment, weight 0-3, was_primary, note)` with a partial unique index `(trade_id) where was_primary` enforcing exactly one primary
- `trade_debriefs(trade_id unique, context_note, edge_note, process_note, execution_quality, management_quality, entry_quality, exit_quality, emotional_state_entry text[], emotional_state_exit text[], what_i_saw, what_was_actually_there, lesson, action, repeatable)` + `trade_mistake_tags` join
- `media(owner_type, owner_id, kind, storage_path, mime, duration_seconds, captured_at, caption)` — polymorphic, indexed on (owner_type, owner_id)

### 1.5 Day close

`pnl_points`, `day_notes(kind: observation | emotion | market_event | rule_reminder | reground)`,
`day_debriefs`, `day_debrief_actions(action_text, due_date, completed_at)`, `rule_checks`, `reviews`.

`reground` is a `day_notes.kind` rather than its own table — it is a timestamped note with no extra
fields, and putting it in `day_notes` means the reground/outcome correlation is one join, not two.

### 1.6 Analytics

A view `trade_facts` flattens each trade to one wide row: trade columns + day columns (day type, open
type, regimes, flow flags) + instrument + primary domain + primary domain alignment + hypothesis
outcome + duration bucket + R bucket + 15-minute time-of-day bucket, all in Europe/Lisbon. Every study
card and the filter engine reads this one view, so a new analysis is a new query against a stable shape.
Heavier rollups (`daily_stats`, `domain_matrix`) are materialised and refreshed on write.

---

## 2. Routes

```
/                          redirect → /day/<today in Europe/Lisbon>
/day/[date]                the cockpit: five phases as a stepper
/day/[date]/brief          read-only brief, print stylesheet
/day/[date]/brief/companion  narrow second-monitor mode
/trades                    filterable table + saved views
/trades/[id]               single trade: media, debrief, domain grid
/study                     analytics workspace
/study/[viewId]            a saved view
/reviews                   weekly/monthly rollups
/library                   instruments, tags, rules, edge domains, level types
/settings                  profile, timezone, defaults, teaching-layer reset
/login                     magic link
/api/export                full normalised dataset (JSON/CSV)
```

Mutations are server actions in `app/**/actions.ts`, validated by Zod schemas in `lib/schemas/*`
that the client forms import too. Reads inside client components go through TanStack Query.

Data access: Drizzle over postgres-js, but every request runs inside a transaction that sets
`role = authenticated` and `request.jwt.claims` to the signed-in user, so **RLS is actually enforced
on the Drizzle path too** rather than being bypassed by a service key. That is the whole point of §8.

---

## 3. Design tokens

Tailwind 4, CSS-first. Tokens live in `app/tokens.css` as CSS variables; the ramp is recomputed for
dark, not inverted.

**Grey ramp** — 12 steps, near-achromatic with a slight cool cast (hue 220, chroma ≤ 0.012 in OKLCH).
Light runs `#fcfcfd → #0b0d10`; dark runs `#0c0e11 → #f4f6f8` with the mid-steps lifted so text on
elevated surfaces keeps 4.5:1.

**Accent** — a single deep blue, `#2f6df6` light / `#5b8dff` dark. Used for primary buttons, focus
rings, active nav, and nothing else.

**Semantic P&L** — `#2f7a56` / `#a33b3b` in light, `#5aa987` / `#d97070` in dark. Desaturated on
purpose. Always paired with a sign or arrow.

**Edge domain hues** — five low-chroma hues (economic data amber, central banks violet, technicals
teal, flow events slate-blue, unscheduled news clay) used only as a 6px dot or a 2px left border.

**Type** — SF stack with Inter fallback; scale 11/12/13/15/17/20/24/32; body 13–15; leading 1.35–1.5;
labels 11px uppercase +0.06em. `tabular-nums` is applied globally to `.num` and to every table cell
holding a figure.

**Space** — 8pt grid (4/8/12/16/24/32/48/64). **Radii** — 8 input / 10 standard / 14 container / 999 pill.
**Shadow** — one token, `0 8px 24px -12px rgb(0 0 0 / .18)`, for popovers and sheets only.
**Motion** — `--ease: cubic-bezier(.32,.72,0,1)`, durations 180/220/260ms, all wrapped in
`@media (prefers-reduced-motion: reduce) { * { animation-duration: 1ms !important; transition-duration: 1ms !important } }`.

---

## 4. Where I departed from the brief, and why

1. **`edge_domains`, `level_types`, `tags` are tables; day type / open type / regimes are Postgres
   enums.** The brief implies enums throughout. I split them: the five domains must survive a sixth
   being added (the brief says so explicitly), but "trend_up / trend_down / …" is a closed taxonomy from
   Dalton and an enum gives the query planner and the type generator better information.
2. **`level_interactions` is 1:1 with `prep_level`, not 1:N.** The brief leaves it open. One row per
   level with a `reaction` makes "how did excess highs behave this quarter" a single group-by; multiple
   interactions per level would make every such query pick a winner first. If you want repeat touches
   later, they belong in a `level_touches` child of the interaction.
3. **`asymmetry_score` is a generated column, not application-computed.** Stored, as asked, but it
   cannot drift.
4. **Trade money columns are trigger-computed and not accepted from the client at all.** The brief says
   "never typed by hand"; I enforce it in the database rather than trusting the form.
5. **Reground is `day_notes.kind = 'reground'`, not its own table.** One join to correlate with outcomes.
6. **One `trade_facts` view is the single read surface for all of Study.** The brief asks for eleven
   analysis cards plus a pivot builder and a generic filter bar; without one flat fact shape, each card
   invents its own joins and the filter bar can't compose across them.
7. **No service-role data path.** Everything, including the seed script's verification pass, goes
   through the RLS-enforcing connection, so the §8 "second user sees nothing" test is testing the real
   thing.
