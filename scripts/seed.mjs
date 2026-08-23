#!/usr/bin/env node
/**
 * Seed the Sysora Stack database with a believable team so you can click
 * around before a real contractor ever logs in.
 *
 *   npm run seed          # create / refresh the demo data
 *   npm run seed:reset    # delete the demo users and org, then stop
 *
 * Reads .env.local via `node --env-file`. Uses the service role key, so it
 * bypasses RLS — this is a local development tool, not something to run in CI
 * against production.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (serviceKey.startsWith("REPLACE_WITH")) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY is still the placeholder. Rotate the key in the Supabase\n" +
      "dashboard and put the new one in .env.local before seeding.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RESET = process.argv.includes("--reset");

const ORG = { name: "Sysora", slug: "sysora", timezone: "Asia/Kolkata" };

// Not hardcoded: these are real logins against a real Supabase project, and this
// file is committed. RESET is declared above.
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!DEMO_PASSWORD && !RESET) {
  console.error("Set SEED_DEMO_PASSWORD in .env.local before seeding.");
  process.exit(1);
}

const PEOPLE = [
  {
    key: "owner",
    full_name: "Nikhil Kumar",
    email: process.env.SEED_OWNER_EMAIL || "owner@sysorastack.com",
    password: process.env.SEED_OWNER_PASSWORD || DEMO_PASSWORD,
    role: "owner",
    timezone: "Asia/Kolkata",
    joined_on: "2025-01-06",
    monthly_amount: null,
  },
  {
    key: "manager",
    full_name: "Priya Nair",
    email: "priya@sysorastack.com",
    password: DEMO_PASSWORD,
    role: "manager",
    timezone: "Asia/Kolkata",
    joined_on: "2026-03-02",
    monthly_amount: 95000,
  },
  {
    key: "arjun",
    full_name: "Arjun Mehta",
    email: "arjun@sysorastack.com",
    password: DEMO_PASSWORD,
    role: "employee",
    timezone: "Asia/Kolkata",
    joined_on: "2026-06-15",
    monthly_amount: 62000,
  },
  {
    key: "sara",
    full_name: "Sara Lopez",
    email: "sara@sysorastack.com",
    password: DEMO_PASSWORD,
    role: "employee",
    timezone: "America/Toronto",
    joined_on: "2026-07-20",
    monthly_amount: 71000,
  },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Deterministic PRNG so repeated seeds produce the same-looking history. */
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return isoDate(d);
}

async function findUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureUser(person) {
  const existing = await findUserByEmail(person.email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password: person.password });
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: person.email,
    password: person.password,
    email_confirm: true,
    user_metadata: { full_name: person.full_name },
  });
  if (error) throw error;
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

async function reset() {
  console.log("Resetting demo data…");

  for (const person of PEOPLE) {
    const user = await findUserByEmail(person.email);
    if (!user) continue;
    // Deleting the auth user cascades to profiles, and from there to
    // attendance, leave_requests and eod_reports.
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) console.warn(`  could not delete ${person.email}: ${error.message}`);
    else console.log(`  deleted ${person.email}`);
  }

  const { error } = await admin.from("orgs").delete().eq("slug", ORG.slug);
  if (error) console.warn(`  could not delete org: ${error.message}`);
  else console.log(`  deleted org "${ORG.slug}"`);

  console.log("Done.");
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  console.log("Seeding Sysora Stack…\n");

  // --- org ---------------------------------------------------------------
  let { data: org } = await admin.from("orgs").select("*").eq("slug", ORG.slug).maybeSingle();

  if (!org) {
    const { data, error } = await admin
      .from("orgs")
      .insert({ ...ORG, salary_day: 5, annual_paid_leave: 12 })
      .select()
      .single();
    if (error) throw error;
    org = data;
    console.log(`  org "${org.name}" created`);
  } else {
    console.log(`  org "${org.name}" already there`);
  }

  // --- people ------------------------------------------------------------
  const ids = {};

  for (const person of PEOPLE) {
    const id = await ensureUser(person);
    ids[person.key] = id;

    const { error } = await admin.from("profiles").upsert(
      {
        id,
        org_id: org.id,
        full_name: person.full_name,
        email: person.email,
        role: person.role,
        timezone: person.timezone,
        joined_on: person.joined_on,
        is_active: true,
        // Demo accounts skip the forced password change so you can sign
        // straight in and look around. Real accounts created through the UI
        // always start with must_change_password = true.
        must_change_password: false,
      },
      { onConflict: "id" },
    );
    if (error) throw error;

    console.log(`  ${person.role.padEnd(8)} ${person.full_name} <${person.email}>`);
  }

  // Reporting line, so the manager_id column has something in it from day one.
  await admin
    .from("profiles")
    .update({ manager_id: ids.manager })
    .in("id", [ids.arjun, ids.sara]);

  // --- compensation (Owner-only table) ------------------------------------
  for (const person of PEOPLE) {
    if (person.monthly_amount == null) continue;
    const { data: existing } = await admin
      .from("compensation")
      .select("id")
      .eq("profile_id", ids[person.key])
      .maybeSingle();

    if (existing) continue;

    const { error } = await admin.from("compensation").insert({
      org_id: org.id,
      profile_id: ids[person.key],
      monthly_amount: person.monthly_amount,
      currency: "INR",
      effective_from: person.joined_on,
    });
    if (error) throw error;
  }
  console.log("  compensation rows written (visible to the Owner only)");

  // --- attendance ---------------------------------------------------------
  const random = makeRandom(20260823);
  const rows = [];

  for (const person of PEOPLE) {
    for (let back = 0; back < 40; back += 1) {
      const day = daysAgo(back);
      if (day < person.joined_on) continue;

      const roll = random();
      // A few days are deliberately left with no row at all, so the grid shows
      // what "Not marked" looks like next to a real Absent.
      if (roll > 0.94) continue;

      const status = roll > 0.88 ? "absent" : roll > 0.8 ? "half_day" : "present";

      rows.push({
        org_id: org.id,
        profile_id: ids[person.key],
        work_date: day,
        status,
        marked_by: ids[person.key],
      });
    }
  }

  const { error: attendanceError } = await admin
    .from("attendance")
    .upsert(rows, { onConflict: "profile_id,work_date" });
  if (attendanceError) throw attendanceError;
  console.log(`  ${rows.length} attendance days across 40 days`);

  // --- leave --------------------------------------------------------------
  const leave = [
    {
      profile_id: ids.arjun,
      leave_type: "paid",
      start_date: daysAgo(18),
      end_date: daysAgo(16),
      reason: "Family wedding in Jaipur.",
      status: "approved",
      decided_by: ids.manager,
      decided_at: new Date().toISOString(),
    },
    {
      profile_id: ids.sara,
      leave_type: "paid",
      start_date: daysAgo(9),
      end_date: daysAgo(9),
      reason: "Dentist, back online after 2pm ET.",
      status: "approved",
      decided_by: ids.manager,
      decided_at: new Date().toISOString(),
    },
    {
      profile_id: ids.arjun,
      leave_type: "paid",
      start_date: daysAgo(-5),
      end_date: daysAgo(-7),
      reason: "Short trip — cover arranged with Priya.",
      status: "pending",
    },
    {
      profile_id: ids.manager,
      leave_type: "unpaid",
      start_date: daysAgo(-14),
      end_date: daysAgo(-15),
      reason: "Extending a long weekend.",
      status: "pending",
    },
  ];

  for (const request of leave) {
    // Insert pending first, then transition: the balance and decision guards
    // are triggers, and this exercises the same path the UI takes.
    const { data: inserted, error } = await admin
      .from("leave_requests")
      .insert({
        org_id: org.id,
        profile_id: request.profile_id,
        leave_type: request.leave_type,
        start_date: request.start_date,
        end_date: request.end_date,
        reason: request.reason,
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.message.includes("overlapping")) continue; // already seeded
      throw error;
    }

    if (request.status === "approved" && inserted) {
      const { error: decideError } = await admin
        .from("leave_requests")
        .update({
          status: "approved",
          decided_by: request.decided_by,
          decided_at: request.decided_at,
        })
        .eq("id", inserted.id);
      if (decideError) throw decideError;
    }
  }
  console.log("  leave requests written (approved, pending, paid and unpaid)");

  // --- EOD reports --------------------------------------------------------
  const summaries = [
    "Shipped the retry queue for the agent runner; 2 client tickets closed.",
    "Rebuilt the onboarding flow, waiting on copy from the client.",
    "Debugged the webhook timeouts — root cause was a cold start, fixed.",
    "Three discovery calls, notes in Notion. Two look like real deals.",
    "Refactored the prompt chain, cut token spend roughly in half.",
  ];

  const eodRows = [];
  for (const person of PEOPLE) {
    if (person.key === "owner") continue;
    for (let back = 1; back <= 8; back += 1) {
      const day = daysAgo(back);
      if (day < person.joined_on) continue;
      if (random() > 0.82) continue; // some days genuinely missing

      eodRows.push({
        org_id: org.id,
        profile_id: ids[person.key],
        report_date: day,
        submission_id: `seed-${person.key}-${day}`,
        summary: summaries[Math.floor(random() * summaries.length)],
        payload: {
          name: person.full_name,
          email: person.email,
          date: day,
          summary: summaries[Math.floor(random() * summaries.length)],
          blockers: random() > 0.7 ? "Waiting on client credentials." : "None",
          hours_focus: String(4 + Math.floor(random() * 5)),
        },
        source: "seed",
      });
    }
  }

  const { error: eodError } = await admin
    .from("eod_reports")
    .upsert(eodRows, { onConflict: "profile_id,report_date" });
  if (eodError) throw eodError;
  console.log(`  ${eodRows.length} EOD reports`);

  // --- done ---------------------------------------------------------------
  console.log("\nSign in at http://localhost:3000/login\n");
  for (const person of PEOPLE) {
    console.log(`  ${person.role.padEnd(8)} ${person.email}  /  ${person.password}`);
  }
  console.log("\nThese demo accounts skip the forced password change on purpose.");
  console.log("Anyone you add through the Team page will be forced to set their own.\n");
}

try {
  if (RESET) await reset();
  else await seed();
} catch (error) {
  console.error("\nSeed failed:", error.message ?? error);
  process.exitCode = 1;
}
