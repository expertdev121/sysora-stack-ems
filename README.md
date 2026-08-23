# Sysora Stack — internal team system

> **Running now.** Migrations are applied to `xulhgkrsqpodlokzpbig` (Sysora Stack Automation)
> and the database is seeded. `npm run dev` → http://localhost:3000
>
> | Role | Email |
> |---|---|
> | Owner | `owner@sysorastack.com` |
> | Manager | `priya@sysorastack.com` |
> | Employee | `arjun@sysorastack.com` |
> | Employee (Toronto) | `sara@sysorastack.com` |
>
> They all share the password in `SEED_DEMO_PASSWORD` in your local `.env.local`
> (not committed). Demo accounts skip the forced password change so you can look
> around; anyone added through the Team page does not.
>
> **Before this repo goes anywhere public**, delete the demo accounts —
> `npm run seed:reset` — or change their passwords. They are real logins against a
> real Supabase project.
>
> Still switched off until you paste a service role key into `.env.local`:
> **Add Person**, **Reset Password**, and **EOD webhook ingest**. Everything else works,
> because everything else runs on the anon key through RLS.

Attendance, leave and EOD reporting for a small distributed contractor team.
Built to be handed to contractor #1 on day one and nothing more.

**Stack (versions pinned and verified, not assumed):**

| Thing | Version | Note |
|---|---|---|
| Next.js | `16.3.2` | current stable. Uses `proxy.ts`, which replaced `middleware.ts` in v16 |
| React | `19.2.8` | |
| Tailwind CSS | `4.3.3` | v4, CSS-first — tokens live in `src/app/globals.css`, there is no `tailwind.config.js` |
| `@supabase/ssr` | `0.12.4` | |
| `@supabase/supabase-js` | `2.112.3` | |
| Node | **22+** | You're on 20.18. Next 16 runs there, but `@supabase/supabase-js` prints a deprecation warning on every build and Vercel defaults to 22. `.nvmrc` pins 22 — run `nvm use`. |

---

## What it does

- **Auth** — Owner creates accounts with a temporary password. No public signup. First sign-in is hard-gated to a change-password screen, so the Owner does not keep a working password.
- **Attendance** — one status per person per day: Present, Half Day, Absent. No clock-in, no hours. Locked to the person's own timezone date. Monthly team grid with per-status counts, exportable to CSV for payroll.
- **Leave** — request → approve/reject, against a fixed 12 paid days per calendar year. Owner sees month-by-month usage per person.
- **EOD Report** — your n8n form embedded in an iframe, prefilled with the signed-in person's id, name and email. n8n POSTs the submission back to a secured webhook; the dashboard shows history and flags who hasn't filed today.
- **Pay** — monthly amount is visible to the Owner only, enforced at the database. Everyone sees the salary *date* (the 5th).

Every table carries `org_id` from day one. Adding a second org later is configuration, not a migration.

---

## Shared tool credentials

Team assets can also hold the **logins** for those tools, so a small team doesn't need a
separate password manager.

- Secrets are encrypted with **AES-256-GCM** before they reach Postgres
  (`src/lib/crypto.ts`), using `CREDENTIALS_ENCRYPTION_KEY` — an environment variable,
  deliberately **not** stored in the database. A dump, a backup, or a stray `select *`
  therefore yields ciphertext and nothing else.
- **Not** `supabase_vault`, though it's installed. Vault's key lives with the database, so
  service-role access alone would read every secret. Keeping the key in the environment
  means an attacker needs both the database *and* the deployment env.
- Ciphertext never reaches the browser. The page selects every column *except*
  `secret_ciphertext`; decryption happens only in the `revealCredential` server action.
- Owner-only by default, per-credential `visible_to_roles` to widen it.
- **Every reveal is recorded** in `credential_reveals`. That trail is the offboarding
  checklist — when someone leaves, it tells you exactly which shared logins to rotate.

Two things this cannot do, and you should plan around:

1. **Shared logins can't be revoked per person.** Marking someone as left disables *this*
   app; it does nothing to Jira, n8n or GHL. Rotate anything they revealed.
2. **Lose `CREDENTIALS_ENCRYPTION_KEY` and the stored secrets are gone.** Change it and
   every credential must be re-entered. Keep a copy somewhere safe and separate.

## Your logo

The Sysora node-graph mark lives at **`public/logo.png`** and renders in the sidebar and on
the login screen, next to the "Sysora." wordmark. `src/components/wordmark.tsx` falls back
to a navy lettermark if the file is ever missing, so the header is never a broken image.

- To swap it, replace `public/logo.png` (or point `LOGO_SRC` at a different file).
- It renders 28px tall, width auto, capped at 128px.
- If you switch to a **full lockup** that already contains the word "Sysora", pass
  `showText={false}` where `<Wordmark />` is used so the name isn't printed twice.

**Favicon** is `src/app/icon.png` — the same mark padded to a 900×900 square with
transparency, via Next's `icon` file convention (which emits the `<link rel="icon">` and
handles cache-busting, so don't also declare `metadata.icons`).

## Setup

### 1. Environment

`.env.local` is already created with your Supabase URL and anon key.

> **Rotate the service role key first.** It was pasted into a chat transcript, so treat it as public. Supabase Dashboard → Project Settings → API → roll `service_role`, then put the new value in `.env.local`. A service role key bypasses every RLS policy in the project.

Then fill in:

```bash
openssl rand -base64 32   # use the output as N8N_WEBHOOK_SECRET
```

and set `N8N_EOD_FORM_URL` plus the `N8N_EOD_PARAM_*` labels (see the n8n section below).

### 2. Pick the right Supabase project — read this before running any SQL

Your account has two:

| Project | Ref | State |
|---|---|---|
| **Sysora Stack Team** | `svpuqzrofbecmabmcevb` | **Not empty.** Holds the Sysora *product* database — `User`, `Plan`, `Subscription`, `Agent`, `ChatSession`, `Contact`, and ~50 more, some with live rows. This is the project whose keys are currently in `.env.local`. |
| **Sysora Stack Automation** | `xulhgkrsqpodlokzpbig` | Empty. Created 22 Aug 2026. |

These migrations create snake_case tables (`orgs`, `profiles`, `attendance`, …) so they will not collide with the PascalCase product tables. But putting your team's salary data in the same schema as your product's customer data means one anon key, one blast radius, and one set of RLS policies to reason about.

**Recommended: point this app at `xulhgkrsqpodlokzpbig`.** That is three values in `.env.local` — URL, anon key, service role key — and zero code changes.

If you'd rather keep it in the product project, run the migrations there as-is; they're scoped to their own tables and the `anon` revoke is table-by-table specifically so it can't strip your product's grants.

### 3. Migrations

Run these **in order** in the Supabase SQL Editor, or with `psql`:

```
supabase/migrations/0001_schema.sql      tables, enums, indexes
supabase/migrations/0002_functions.sql   auth helpers + integrity triggers
supabase/migrations/0003_rls.sql         row level security + grants
supabase/migrations/0004_views.sql       reporting views (security_invoker)
```

If you use the Supabase CLI instead:

```bash
supabase link --project-ref <your-chosen-project-ref>
supabase db push
```

### 4. Seed

```bash
npm run seed
```

> The current database was seeded through SQL rather than this script, because the script
> needs a service role key and I could only read publishable keys. Once you've put the
> service key in `.env.local`, `npm run seed:reset && npm run seed` reproduces the same
> data through the supported path.

Creates the org, an Owner, a Manager and two Employees (one in `America/Toronto`, so you can see the timezone handling do something), 40 days of attendance, approved and pending leave in both paid and unpaid flavours, and a scatter of EOD reports.

It prints the sign-in credentials when it finishes. Demo accounts skip the forced password change so you can look around immediately — anyone you add through the Team page does not.

```bash
npm run seed:reset   # delete the demo users and org
```

### 5. Run

```bash
npm run dev
```

---

## Wiring n8n

### Prefilling the form

The n8n **Form Trigger prefills a field by matching a query parameter to that field's label**, not to an internal field name. So the parameter names have to be your exact labels — which is why they're environment variables rather than hardcoded:

```bash
N8N_EOD_PARAM_USER_ID="user_id"   # set each of these to the exact
N8N_EOD_PARAM_NAME="name"         # label text in your n8n form
N8N_EOD_PARAM_EMAIL="email"
N8N_EOD_PARAM_DATE="date"
N8N_EOD_PARAM_TOKEN="token"
```

Change a label in n8n, change the env var. No deploy of this app needed.

`token` is an HMAC of `profile_id:date` keyed on `N8N_WEBHOOK_SECRET`. Add it as a hidden field in your form and echo it back in the webhook payload, and the endpoint will refuse a submission whose user id has been tampered with. Leave it out and everything still works — the endpoint just falls back to matching on id and email. **Add it before you have anyone you don't fully trust.**

### Letting the form be embedded

Self-hosted n8n refuses to be framed by default. Allow this app's origin:

```
Content-Security-Policy: frame-ancestors 'self' https://team.sysorastack.com http://localhost:3000
```

If the frame stays blank for six seconds, the page detects it and swaps in an "Open the EOD form" launcher carrying the identical prefilled URL — so attribution works whether or not the embed succeeds. You won't get a dead tab either way.

### The return webhook

Add an **HTTP Request** node at the end of your form workflow:

- **Method** `POST`
- **URL** `https://team.sysorastack.com/api/webhooks/n8n/eod`
- **Body** JSON — the form fields, plus `user_id`, `email`, `date` and (ideally) `token`
- **Header** — pick one:

| Scheme | Header | Value |
|---|---|---|
| Simple (start here) | `x-sysora-secret` | your `N8N_WEBHOOK_SECRET` |
| Stronger (move to this) | `x-sysora-signature` | `sha256=<HMAC-SHA256 of the raw body, keyed on the secret>` |

For the signature, put a **Crypto** node before the HTTP Request: Action `Hmac`, Type `SHA256`, Value = the JSON string you're about to send, Secret = `N8N_WEBHOOK_SECRET`, encoding `hex`. Then send `sha256={{ $json.hmac }}`.

The signature proves the body wasn't altered in flight. The plain secret only proves the caller knows a password. Both are compared in constant time.

The endpoint is **idempotent**: an n8n retry updates the existing row for that person and day rather than creating a second EOD.

### When a submission doesn't show up

Every inbound hit — accepted or rejected — is logged to `public.webhook_deliveries` with the raw body and the reason. Read it as the Owner:

```sql
select received_at, ok, status_code, error, raw_body
from public.webhook_deliveries
order by received_at desc
limit 20;
```

The usual cause is a field label that changed in n8n and no longer matches an env var.

---

## Deploy

`vercel.json` pins two things that are easy to get wrong:

- **`"framework": "nextjs"`** — a Vercel project created against an empty repo defaults its
  framework preset to "Other", which then fails with *No Output Directory named "public"
  found after the Build completed*. It never runs `next build` at all. Settings in
  `vercel.json` take precedence over the dashboard, so this pins it from the repo.
- **`"regions": ["sin1"]`** — the Supabase project lives in `ap-southeast-1` (Singapore).
  Vercel functions default to `iad1` (US East), which would send every server render and
  every query across the Pacific and back. Colocating cuts a few hundred ms off each
  request. Remove the line if you'd rather stay on the default.

Then:

1. Import the repo into Vercel.
2. Set every variable from `.env.example` in the Vercel project, for Production **and**
   Preview. `SUPABASE_SERVICE_ROLE_KEY` and `N8N_WEBHOOK_SECRET` must **not** be prefixed
   `NEXT_PUBLIC_` — that prefix ships them to the browser.
   Without these the build still succeeds (every page is dynamic, so nothing pre-renders
   against Supabase) and then every request 500s at runtime. Set them before you redeploy.
3. Point `team.sysorastack.com` at the deployment.
4. In Supabase → Authentication → URL Configuration, set the Site URL to the same domain.
5. Update the n8n `frame-ancestors` header to the production domain.

---

## The security model

RLS is on for every table, and the app talks to Postgres with the **anon key even on the server**, so server code gets the same row-level guarantees the browser does. The service role key is used in exactly three places: creating and deactivating people, the EOD webhook, and the seed script.

| Table | Employee | Manager | Owner |
|---|---|---|---|
| `profiles` | own row only | whole org | whole org |
| `attendance` | own rows; may write only today, in their own timezone | whole org, any date | whole org, any date |
| `leave_requests` | own rows; may only withdraw a pending one | whole org; decides Employees | whole org; decides everyone |
| `eod_reports` | own rows, read only | whole org, read only | whole org, read only |
| `compensation` | **nothing** | **nothing** | full |
| `webhook_deliveries` | nothing | nothing | read |

Three things RLS cannot express on its own, done with triggers in `0002_functions.sql`:

- **Column-level protection.** A person may update their own profile row to fix their name or timezone. `tg_profiles_guard()` stops them smuggling `role = 'owner'` into the same statement, and refuses to let the org end up with zero active Owners.
- **Nobody approves their own leave**, and a Manager cannot decide leave for another Manager or the Owner. `tg_leave_decision_guard()`.
- **The 12-day annual ceiling**, enforced at the moment of approval rather than at request time. `tg_leave_balance_guard()`.

Salary is a separate table rather than a column on `profiles` because **Postgres RLS filters rows, not columns**. A `monthly_pay` column on `profiles` would be readable by anyone who can read the row at all — which Managers can.

### Check it yourself

Sign in as `arjun@sysorastack.com` and open the browser console:

```js
const { createClient } = await import("@supabase/supabase-js");
// ...or just use the app's own client and try to read past your own rows:
await fetch("/api/attendance/export?month=2026-08").then(r => r.status);   // 403
```

Or, more directly, in the Supabase SQL editor:

```sql
-- Impersonate an employee and try to read the whole team.
set local role authenticated;
set local request.jwt.claims = '{"sub":"<arjun-uuid>","role":"authenticated"}';
select count(*) from public.attendance;     -- only Arjun's rows
select count(*) from public.compensation;   -- 0
```

---

## Deliberately not built

Cut from Phase 1 on purpose, with the reasoning:

- **Auto-marking absent overnight.** This team sometimes works weekends, so a cron with no working-week policy would mark people absent on days they never owed you. A blank cell reads as **Not marked**, which is visually distinct from Absent.
- **Reminders and nudges.** You already run n8n. A scheduled workflow hitting a read endpoint and pinging Slack is an afternoon; an in-app notification system is a week.
- **Payroll calculation.** This produces the CSV. TDS, PF and compliance belong in a payroll tool that gets updated when the law changes.
- **Public holidays.** Needs a working-week policy first. Phase 2.
- **A reporting hierarchy.** The `manager_id` column ships and is populated; the subtree scoping does not. Three people don't have a hierarchy. Tightening it later is a policy change in `0003_rls.sql`, not a migration.
- **Half-day *leave*.** Half Day already exists as an attendance status; the two will collide and that deserves a deliberate decision, not an accident.

## Known limits worth knowing

- **Types are hand-written** in `src/lib/types.ts` rather than generated, so the repo has no build-time dependency on the Supabase CLI. Once you're running migrations regularly, switch: `npx supabase gen types typescript --project-id svpuqzrofbecmabmcevb > src/lib/database.types.ts`.
- **The webhook has no rate limit.** It's protected by a shared secret and it's not a public endpoint, but at 10 people it's worth adding one.
- **A leave request that straddles a month or year boundary** is counted whole, in the month it starts.
