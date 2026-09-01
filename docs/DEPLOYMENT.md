# Deployment

The Supabase project is provisioned and its whole schema is live, and Vercel is
building from this repository — the app is deployed at
**https://deliberate-practice.vercel.app**.

What is left is a secret only you can read and two settings only you can change.

---

## What already exists

| | |
|---|---|
| Supabase project | `deliberate-practice` (`zggckkxrnaysruvcmqng`), region **eu-west-3 (Paris)** — the closest Supabase region to Lisbon |
| Schema | 35 tables, 3 views, RLS forced on all 35 with 140 policies, all triggers and the seeded catalogue (21 instruments, 5 edge domains, 24 level types) |
| Storage | private `media` bucket, 500 MB per file, owner-scoped policies |
| Security advisors | zero findings |
| Verified | a smoke test ran against the live database: a four-fill scale-in/scale-out trade produced the right average entry, peak size, ticks, net P&L and R multiple; the day aggregate and equity-curve triggers fired; a second user saw nothing through either the tables or the views; and it cleaned up after itself |
| Vercel | project `deliberate-practice` linked to this repository and deploying on every push. GitHub reports the commit status `Vercel — Deployment has completed`, and the app is served at https://deliberate-practice.vercel.app |

**No sample data was seeded into production, deliberately.** This app exists to
build one honest dataset about your own trading; forty days of invented trades
would poison the thing it is for. Your production database starts empty except
for the reference catalogue. If you want to explore the Study screens with data
first, run the seed against a *local* database (see the README), or against
production once and then delete those days.

---

## Finishing the setup

The build is green and the app is live; it cannot reach a database or sign you
in until these are done.

Each step happens in someone else's dashboard, so rather than doing them and
hoping, do them and then ask the deployment what it sees:

```
https://deliberate-practice.vercel.app/api/health
```

That runs inside the deployment, so it reports what **Vercel** actually holds —
which is the thing a check on your own machine cannot tell you. It names every
problem and what to do about it. `npm run doctor` runs the same checks against
your local `.env.local`, in a nicer format.

### 1. The database connection

**The easy way — no password, nothing to type.** In Vercel, open the project →
**Integrations** → connect the **Supabase** project. It writes `POSTGRES_URL`
(and `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_HOST` / …) into the
project itself, with the right pooler host and the right password. The app reads
those directly, so there is no string to assemble and none of the ways that goes
wrong: an unreplaced `[YOUR-PASSWORD]`, a pooler host copied from an example, a
password with a `#` in it that silently truncates the URL.

`lib/db/url.ts` resolves, in order: `DATABASE_URL`, `POSTGRES_URL`,
`POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, and finally the discrete
`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_HOST` parts, which it escapes
itself. A hand-set `DATABASE_URL` always wins, and the non-pooling URL is last
because it resolves over IPv6, which serverless platforms commonly cannot reach.

**By hand, if you prefer.** Supabase dashboard → **Connect** → **Transaction
pooler**, and copy that string — including its host, whose `aws-N` prefix is
assigned per project. Replace `[YOUR-PASSWORD]`, brackets and all, with the
password from **Project Settings → Database** (reset it there if you no longer
have it). Percent-encode `@ : / ? # % &` and spaces, or choose a password of
letters and digits only.

### 2. The rest of the environment variables

Vercel → the project → **Settings → Environment Variables**. Add all four to
**Production, Preview and Development**:

```
DATABASE_URL                    (only if you did step 1 by hand)
NEXT_PUBLIC_SUPABASE_URL        https://zggckkxrnaysruvcmqng.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZ2Nra3hybmF5c3J1dmNtcW5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5OTIwMDksImV4cCI6MjEwMzU2ODAwOX0.bWIivkhCNlXLV4bARwEX5MwWiZqA74pNIY2HxlUpGKQ
```

The anon key is a public key — it is safe in the browser, and RLS is what
actually protects the data. `DATABASE_URL` is not: it is a full-privilege
credential, so it belongs only in Vercel's encrypted environment variables and
your local `.env.local`, never in the repository.

Redeploy after adding them.

### 3. Create your account

Open the app, enter your email and a password, and choose **Create the first
account**. Sign-in is email and password — there is no link to wait for and no
redirect URL to allowlist.

If Supabase still has **Confirm email** switched on, creating the account sends
you one message that you have to click before signing in. To skip that:
**Authentication → Sign In / Providers → Email → Confirm email → off**. The
health check reports which of the two you are in.

### 4. Lock the door behind you

Because this is a private journal and Supabase allows public sign-ups by
default: **Authentication → Sign In / Providers → Email → disable "Allow new
users to sign up"**. Your account keeps working; nobody else can make one.

Do this *after* your account exists, or you will lock yourself out of an empty
app.

---

## Checking that it worked

```bash
npm run doctor          # your .env.local
curl https://deliberate-practice.vercel.app/api/health   # what Vercel holds
```

Both report the same checks: the Supabase URL and anon key agree and the project
answers; whether sign-ups are still open; whether email confirmation will stand
between you and your first sign-in; the database is reachable and over TLS;
every migration is applied; RLS is forced on all 35 tables with four policies
each; the shared catalogue is populated; the private `media` bucket exists.

Before it dials the database at all, it checks the shape of `DATABASE_URL`:
the shared pooler authenticates as `postgres.<project-ref>` and the direct host
as plain `postgres`, so the wrong one is named outright rather than surfacing as
"password authentication failed". It also catches an unreplaced
`[YOUR-PASSWORD]`, a missing password, and a URL that will not parse — which is
what an unencoded `#` or `@` in a password produces, and which looks perfectly
fine to the eye.

Neither ever prints a password, a key, or the driver's own error text — a
`postgres-js` failure carries the host and role in its message, so causes are
mapped to a fixed set of sentences instead. `password authentication failed` is
the one you want when you have pasted the wrong password.

The endpoint returns full detail only while the app is **not** yet working,
which is when you need it and when there is nothing behind it to protect. Once
it is green, an anonymous request gets `{"status":"ok"}` and nothing else;
signed in, you see everything. A blocking problem also sets the status to 503,
so an uptime monitor notices.

---

## How it degrades while those are pending

The app is deliberately explicit rather than broken:

- **No Supabase env vars** → the login page says which variables are missing.
- **Supabase configured, no `DATABASE_URL`** → the error boundary says "The
  database isn't reachable", names the variable, and offers a retry.

So a half-configured deployment tells you what it needs rather than showing a
stack trace.

---

## After it is running

- **Your rules and tags start empty.** Library → Rules is the first thing worth
  filling in: process adherence is computed from rule checks, so until there are
  rules there is no adherence number. The seed's six rules are a reasonable
  starting set if you want them (`scripts/seed.ts`, `RULES`).
- **Minimum sample size** is 30 by default (Settings). Every Study card greys
  out below it.
- **Media uploads** work as soon as you are signed in — the bucket and its
  policies are already in place.

## Verifying production yourself

Once `DATABASE_URL` is set, the same suites that run in development run against
Supabase:

```bash
DATABASE_URL='postgresql://postgres.zggckkxrnaysruvcmqng:...@<your-pooler-host>:5432/postgres' npm test
```

That adds `tests/rls.test.ts` (a second user sees nothing) and
`tests/pnl-parity.test.ts` (`lib/pnl.ts` and `recompute_trade()` agree). Both
create and delete their own throwaway users, so they are safe to run against a
live database — though naturally, run them before you have data you care about.

## Changing the schema later

Migrations are files. Add `db/migrations/00NN_*.sql`, run `npm run db:push`
against your local database to check it, then apply the same file to Supabase.
Never edit an applied migration; add a new one.

## Moving production to `main`

`main` now exists, holding the implementation plan this was built against, and
pull request #1 proposes merging the implementation into it. Vercel's production
branch is still `claude/build-this-3pl69t`, so after you merge:

- Vercel → Settings → Git → **Production Branch** → `main`
- GitHub → Settings → General → **Default branch** → `main`

Until then `main` is a one-commit branch and the working app is what is deployed
from the feature branch.
