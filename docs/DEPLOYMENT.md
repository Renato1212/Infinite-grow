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

## Three things to finish

The build is green and the app is live; it cannot reach a database or sign you
in until these are done.

### 1. The database password → `DATABASE_URL`

The app talks to Postgres directly (Drizzle over postgres-js), because that is
what makes the RLS-scoped transactions and the raw-SQL analytics possible. That
needs the database password, which Supabase shows once at creation and never
again through the API.

Supabase dashboard → **Project Settings → Database → Connection string → URI**,
using the **Session pooler** (port 5432). If you never saved the password, use
**Reset database password** on the same page.

For Vercel, use the **transaction pooler on port 6543** — it is built for many
short-lived instances, and the app is already compatible (`prepare: false`, and
every query runs inside one transaction, so nothing depends on session state):

```
DATABASE_URL=postgresql://postgres.zggckkxrnaysruvcmqng:YOUR-PASSWORD@aws-0-eu-west-3.pooler.supabase.com:6543/postgres
```

Use port **5432** (session pooler) when running migrations or the seed from your
own machine; DDL is happier there.

Two things that otherwise cost an afternoon:

- If you set the password yourself, avoid `@ : / ? # [ ] %`. They are
  URL-reserved and break the connection string unless percent-encoded. Letting
  Supabase generate one sidesteps it.
- TLS is handled for you. postgres-js defaults to no TLS and Supabase refuses a
  plaintext connection, so `lib/db/ssl.ts` requires it for any non-local host.
  An explicit `?sslmode=` in the URL still wins, in either direction.

### 2. The rest of the environment variables

Vercel → the project → **Settings → Environment Variables**. Add all four to
**Production, Preview and Development**:

```
DATABASE_URL                    (from step 1)
NEXT_PUBLIC_SUPABASE_URL        https://zggckkxrnaysruvcmqng.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZ2Nra3hybmF5c3J1dmNtcW5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5OTIwMDksImV4cCI6MjEwMzU2ODAwOX0.bWIivkhCNlXLV4bARwEX5MwWiZqA74pNIY2HxlUpGKQ
```

The anon key is a public key — it is safe in the browser, and RLS is what
actually protects the data. `DATABASE_URL` is not: it is a full-privilege
credential, so it belongs only in Vercel's encrypted environment variables and
your local `.env.local`, never in the repository.

Redeploy after adding them.

### 3. Auth redirect URLs

Without this the magic link in your inbox will send you to `localhost:3000`.

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL** — `https://deliberate-practice.vercel.app`
- **Redirect URLs** — add both:
  - `https://deliberate-practice.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback` (for local development)

### 4. Sign in, and lock the door behind you

Open the deployed app, enter your email, click the link. That creates your
account.

Then, because this is a private journal and Supabase allows public sign-ups by
default: **Authentication → Sign In / Providers → Email → disable "Allow new
users to sign up"**. Your existing account keeps working; nobody else can make
one.

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
DATABASE_URL='postgresql://postgres.zggckkxrnaysruvcmqng:...@aws-0-eu-west-3.pooler.supabase.com:5432/postgres' npm test
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
