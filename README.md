# Deliberate practice

A private trading journal and process platform that runs one daily loop end to end:

**Prepare → Plan → Trade → Record → Debrief → Study**

It is not a P&L tracker with a journal attached. Every screen exists to force correct
repetition, and every field is modelled so it can be filtered, aggregated and compared
across days six months from now.

---

**Deployed at https://deliberate-practice.vercel.app.** The Supabase project is
live in eu-west-3 with the full schema, RLS, triggers, seeded catalogue and media
bucket, verified end to end against the real database; Vercel builds from this
repository on every push. Three steps remain before you can sign in —
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) has them, and
[`/api/health`](https://deliberate-practice.vercel.app/api/health) tells you
which of them are still outstanding from inside the deployment itself, rather
than from your machine.

## Running it

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL at minimum
npm run db:push                   # applies db/migrations/*.sql in order
npm run db:seed                   # ~40 sessions of realistic data
npm run dev
```

**Against Supabase.** Set `DATABASE_URL` to the project's session-pooler URL — or let
Vercel's Supabase integration set `POSTGRES_URL` for you, which `lib/db/url.ts` reads
just as happily — plus
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for auth (email and
password) and Storage. Create a private Storage bucket named `media` for trade recordings.

**Against a bare Postgres.** Migration `0000_auth_shim.sql` creates just enough of
`auth.users`, `auth.uid()` and the `authenticated` role for everything else to behave
identically, so the app runs with nothing but a local database:

```bash
createdb journal
DATABASE_URL=postgresql://localhost/journal npm run db:push
DATABASE_URL=postgresql://localhost/journal npm run db:seed   # prints a user id
# put that id in .env.local as DEV_USER_ID, then npm run dev
```

`DEV_USER_ID` is ignored in production builds. An auth bypass that an environment
variable can switch on in production is not a bypass worth having.

### Tests

```bash
npm run doctor                             # is this configuration actually usable?
npm test                                   # domain logic; DB suites skip without a database
DATABASE_URL=postgresql://... npm test     # adds the RLS and SQL/TS parity suites
npm run e2e                                # Playwright; starts its own dev server if none is running
```

All of it runs on every pull request — see `.github/workflows/ci.yml`. CI stands
up a Postgres service, applies the migrations twice to prove they are idempotent,
asserts the schema shape (35 tables, four RLS policies each, none unprotected),
seeds a book, and runs both Playwright suites against it.

`npm test` with a database attached also runs:

- **`tests/rls.test.ts`** — a second user sees nothing of the first user's data, cannot
  insert rows they do not own, and cannot update or delete someone else's. §8's requirement.
- **`tests/pnl-parity.test.ts`** — `lib/pnl.ts` and `public.recompute_trade()` implement
  the same arithmetic in two languages; this pins them together across scale-ins,
  scale-outs, 64ths on the note complex and R multiples.

`lib/contrast.test.ts` needs no database. It parses `app/tokens.css` and checks
every foreground against every surface it can land on — plain, under a hover or
keyboard-cursor wash, and inside a pill's own tint on top of those. The browser
suite only sees the combinations the seeded data happens to render, which is how
three separate contrast bugs reached CI one at a time.

---

## The daily loop

`/day/[date]` is one page with five phases as a stepper. The stepper shows completion
state; it never hides work — every phase is on the page, always.

| Phase | What it captures | Gates the close |
|---|---|---|
| **1 Prepare** | Narratives by source, per-instrument chart routine, marked levels, environment and calendar | yes |
| **2 Plan** | Ranked hypotheses as routes through your marked levels, asymmetry-scored opportunities, session reassessments | yes |
| **3 Trade** | Quick trade entry, intraday equity curve, timestamped notes, reground | no — a day with no trades is a legitimate day |
| **4 Debrief trades** | The five-domain grid, the three pillars, what I saw vs what was there | yes |
| **5 Debrief day** | Classification, hypothesis outcomes, rule checks, actions | yes |

Completion is computed in `lib/completion.ts` — pure and tested, so the stepper rings,
the close-the-day gate and the streak all agree on one definition, and the header can
name exactly what is missing rather than showing an unexplained partial circle.

### Speed

- **Autosave on blur**, with a quiet "Saved" mark on every field and the half-written
  value mirrored into `localStorage` so a refresh never loses a debrief in progress.
- **⌘K** jumps to any day, instrument, saved study or action. Typing `2026-03-14`
  goes straight there.
- **`n`** new trade · **`d`** debrief queue · **`b`** brief · **`j`/`k`** list navigation.
- **Quick trade entry** is one row: instrument, side, size, prices, times. Everything
  else is added later from the debrief queue.
- **Carry levels forward** copies the last session you prepped for that instrument.
- **CSV import** of fills with preview and confirm.

---

## Schema

Eleven migration files in `db/migrations/`, applied in filename order by
`scripts/apply-migrations.ts` and recorded in `schema_migrations`. Migrations are files;
nothing is applied by hand.

| File | What it holds |
|---|---|
| `0000_auth_shim` | `auth.users` / `auth.uid()` for non-Supabase Postgres |
| `0001_enums` | Closed taxonomies as Postgres enums |
| `0002_reference` | Instruments, edge domains, level types, tags, rules |
| `0003_day` | `trading_days` and everything prepared and planned on it |
| `0004_trades` | Trades, executions, the five-domain grid, debriefs, media, day close |
| `0005_rls` | RLS on every table, plus `updated_at` triggers |
| `0006_derivations` | Everything the brief says must never be typed by hand |
| `0007_views` | `trade_facts`, `level_facts`, `day_facts` |
| `0008_seed_reference` | The 21 instruments, five domains, 24 level types |
| `0009_rule_uniqueness` | One canonical spelling per rule, so adherence cannot double-count |
| `0010_media_storage` | The private `media` bucket and its owner-scoped policies |

### What the database computes for you

- **Trade money columns** — `avg_entry_price`, `avg_exit_price`, `max_size`,
  `ticks_captured`, `gross_pnl`, `commissions`, `net_pnl`, `r_multiple` are recomputed
  from `trade_executions` by trigger, using the instrument's tick size and value.
  `max_size` is the *peak* open position across the fill sequence, so a scale-out and
  back in does not inflate it.
- **Day aggregates** — `net_pnl`, `trade_count`, `win_count` on `trading_days`, by trigger.
- **Process adherence** — recomputed from `rule_checks`, so discipline is a number
  you can plot against results.
- **`opportunities.asymmetry_score`** — a generated column (`potential_ticks ×
  probability / 100`): stored, as asked, and unable to drift from its inputs.
- **`pnl_points`** — one auto point per closed trade, plus any manual ones.

### Row Level Security

Every table has `force row level security` and four policies keyed to `auth.uid()`.
The three reference tables additionally expose rows with `user_id is null` — the shared
seed catalogue, readable by everyone and writable by no one.

**There is no service-role data path in the application.** `lib/db/client.ts` runs every
query inside a transaction that sets `role = authenticated` and `request.jwt.claims` to
the signed-in user, so the Drizzle path is filtered by exactly the same policies the
Supabase client would hit. If a query returns a row, it is a row this user may see. The
views are `security_invoker`, so they filter too.

---

## Study

`/study` reads one flat fact row per trade (`trade_facts`) and derives every analysis
from it in `lib/study/aggregate.ts` — pure and tested. Adding a card is a function
there plus a component in `components/study/cards.tsx`; no new joins, and the filter
bar composes across it for free.

### The filter

`lib/study/filters.ts` parses the filter from URL params, serialises it back, and
compiles it to a parameterised `WHERE` against `trade_facts`. **The URL is the study** —
copy the link and the analysis reproduces exactly. Named views are stored in
`saved_views` and restore the same URL.

Groups are ANDed by default; "match any instead of all" switches to OR — except the
date bounds, which always constrain, because an OR across them would silently widen the
window rather than narrowing it.

### The cards

Expectancy and R distribution · edge domain matrix · hypothesis accuracy · plan
adherence · time-of-day heatmap · level performance · MAE/MFE entry timing · mistake
frequency over time · environment slicing · discipline against results · rolling
20-trade expectancy. Plus a generic pivot builder, a correlation explorer, and a
read-only SQL console.

Every card shows its sample size and greys itself out below your configured minimum
(Settings, default 30). The correlation explorer warns separately below thirty pairs.

**Level performance is a different grain** — one row per marked level, not per trade —
so it takes only the date window from the filter. Applying a trade-shaped filter there
would silently answer a different question.

### Adding an analysis card

1. Write a pure function in `lib/study/aggregate.ts` taking `Fact[]`.
2. Add a test beside it in `aggregate.test.ts`.
3. Add a component in `components/study/cards.tsx`, wrapped in `<Analysis>` so it gets
   the sample-size badge and the minimum-n treatment.
4. Render it in `components/study/workspace.tsx`.

If the card needs a column `trade_facts` does not have, add it to the view in a new
migration and to the `Fact` interface — not a new query.

### Getting the data out

`GET /api/export?format=csv|json` returns the filtered set; `format=full` returns
trades, level interactions and day rollups together, for a notebook or n8n. The SQL
console runs in a read-only, statement-timeout-capped transaction under the same RLS.

---

## Design

Tokens live in `app/tokens.css`: a 12-step near-achromatic grey ramp with a slight cool
cast, **one** accent (a deep blue), desaturated P&L colours always paired with a sign or
arrow, and five low-chroma domain hues used only as a 6px dot or a 2px left border.

Dark mode is a recomputed ramp, not an inversion, and is defined under both
`prefers-color-scheme` and an explicit `data-theme` so the manual override wins in both
directions. A tiny inline script applies the stored theme before first paint.

Type is the system SF stack with Inter as fallback, scale 11/12/13/15/17/20/24/32, body
at 13–15px. `tabular-nums` is global on numbers and table cells, so columns of prices
align to the digit. Sentence case everywhere.

Motion is 180–260ms on `cubic-bezier(.32,.72,0,1)`, and `prefers-reduced-motion` is
honoured globally.

### The teaching layer

The "why this matters" notes are markdown files in `content/explainers/`, not strings in
code — edit them freely. Each collapses itself once its section has been used five
times; Settings resets them.

---

## Notes on the shape

Places where this deliberately differs from the brief, and why, are written up in
[`docs/PLAN.md`](docs/PLAN.md) §4. The short version:

- Edge domains, level types and tags are **tables**, so a sixth domain can be added
  without touching a single historical assessment. Day types and regimes are enums,
  because that taxonomy is closed.
- `level_interactions` is 1:1 with a marked level, so "how did excess highs behave this
  quarter" is one group-by.
- Reground is `day_notes.kind = 'reground'`, so correlating it with outcomes is one join.
- `trade_facts` is the single read surface for all of Study.

RTH times on `instruments` are **exchange-local**; everything else is `timestamptz` in
UTC and rendered in Europe/Lisbon, DST included.
