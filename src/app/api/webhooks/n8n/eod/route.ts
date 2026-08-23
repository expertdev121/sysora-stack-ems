import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EOD_PARAMS, normalisePayload, pickField, verifyEodToken } from "@/lib/eod";
import { localDateISO } from "@/lib/dates";

/**
 * POST /api/webhooks/n8n/eod
 *
 * Where n8n posts a submitted EOD form. Runs on the service role because there
 * is no signed-in user on this request, which is exactly why the shared secret
 * is checked before anything touches the database.
 *
 * Two accepted auth schemes, in order of preference:
 *
 *   1. x-sysora-signature: sha256=<hex>
 *      HMAC-SHA256 of the RAW request body, keyed on N8N_WEBHOOK_SECRET.
 *      Proves the body wasn't altered in flight, not just that the caller knows
 *      a password.
 *
 *   2. x-sysora-secret: <N8N_WEBHOOK_SECRET>
 *      Plain shared secret, compared in constant time. Simpler to wire up in
 *      n8n; weaker. Use it to get running, then move to (1).
 *
 * Idempotent: n8n retries a failed node, and a retry must update the existing
 * row rather than create a second EOD for the same person and day.
 */

export const dynamic = "force-dynamic";

const ID_KEYS = [EOD_PARAMS.userId, "user_id", "userId", "profile_id", "profileId", "id"];
const EMAIL_KEYS = [EOD_PARAMS.email, "email", "Email", "email_address", "work_email"];
const DATE_KEYS = [EOD_PARAMS.date, "date", "report_date", "reportDate", "Date"];
const TOKEN_KEYS = [EOD_PARAMS.token, "token", "signature"];
const SUBMISSION_KEYS = [
  "submission_id",
  "submissionId",
  "formSubmissionId",
  "executionId",
  "execution_id",
];
const SUMMARY_KEYS = [
  "summary",
  "Summary",
  "what_did_you_do_today",
  "What did you do today",
  "work_done",
  "Work done",
  "notes",
  "Notes",
  "update",
];

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function isAuthorised(request: NextRequest, rawBody: string, secret: string): boolean {
  const signature = request.headers.get("x-sysora-signature");
  if (signature) {
    const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    return constantTimeEquals(provided.toLowerCase(), expected);
  }

  const plain = request.headers.get("x-sysora-secret");
  if (plain) return constantTimeEquals(plain, secret);

  return false;
}

async function log(entry: {
  orgId?: string | null;
  ok: boolean;
  statusCode: number;
  error?: string | null;
  matchedProfileId?: string | null;
  rawBody?: unknown;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("webhook_deliveries").insert({
      org_id: entry.orgId ?? null,
      endpoint: "/api/webhooks/n8n/eod",
      ok: entry.ok,
      status_code: entry.statusCode,
      error: entry.error ?? null,
      matched_profile_id: entry.matchedProfileId ?? null,
      raw_body: entry.rawBody ?? null,
    });
  } catch {
    // Logging must never turn a good delivery into a failed one.
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();

  if (!isAuthorised(request, rawBody, secret)) {
    await log({ ok: false, statusCode: 401, error: "Bad or missing secret" });
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody || "{}");
  } catch {
    await log({ ok: false, statusCode: 400, error: "Body was not JSON" });
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const payload = normalisePayload(parsed);
  const admin = createAdminClient();

  // ---- Identify the person -------------------------------------------------
  const claimedId = pickField(payload, ID_KEYS);
  const claimedEmail = pickField(payload, EMAIL_KEYS)?.toLowerCase() ?? null;

  let profile:
    | { id: string; org_id: string; timezone: string; full_name: string }
    | null = null;

  if (claimedId && /^[0-9a-f-]{36}$/i.test(claimedId)) {
    const { data } = await admin
      .from("profiles")
      .select("id, org_id, timezone, full_name")
      .eq("id", claimedId)
      .maybeSingle();
    profile = data ?? null;
  }

  if (!profile && claimedEmail) {
    const { data } = await admin
      .from("profiles")
      .select("id, org_id, timezone, full_name")
      .eq("email", claimedEmail)
      .maybeSingle();
    profile = data ?? null;
  }

  if (!profile) {
    await log({
      ok: false,
      statusCode: 422,
      error: `No profile matched (id=${claimedId ?? "none"}, email=${claimedEmail ?? "none"})`,
      rawBody: payload,
    });
    return NextResponse.json(
      { error: "Could not match this submission to a person" },
      { status: 422 },
    );
  }

  // ---- Which day is this? --------------------------------------------------
  const rawDate = pickField(payload, DATE_KEYS);
  const reportDate =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.slice(0, 10))
      ? rawDate.slice(0, 10)
      : localDateISO(profile.timezone);

  // ---- Attribution token (optional but preferred) --------------------------
  const token = pickField(payload, TOKEN_KEYS);
  if (token && !verifyEodToken(token, profile.id, reportDate)) {
    await log({
      orgId: profile.org_id,
      ok: false,
      statusCode: 403,
      error: "Attribution token did not verify",
      matchedProfileId: profile.id,
      rawBody: payload,
    });
    return NextResponse.json({ error: "Bad attribution token" }, { status: 403 });
  }

  const submissionId = pickField(payload, SUBMISSION_KEYS);
  const summary = pickField(payload, SUMMARY_KEYS);

  const { error } = await admin.from("eod_reports").upsert(
    {
      profile_id: profile.id,
      org_id: profile.org_id,
      report_date: reportDate,
      submission_id: submissionId,
      summary: summary?.slice(0, 500) ?? null,
      payload,
      submitted_at: new Date().toISOString(),
      source: "n8n",
    },
    { onConflict: "profile_id,report_date" },
  );

  if (error) {
    // A retry carrying the same submission_id for a different date trips the
    // partial unique index. That is a duplicate, not a failure.
    const duplicate = error.message.includes("eod_submission_uidx");
    await log({
      orgId: profile.org_id,
      ok: duplicate,
      statusCode: duplicate ? 200 : 500,
      error: error.message,
      matchedProfileId: profile.id,
      rawBody: payload,
    });

    return duplicate
      ? NextResponse.json({ ok: true, duplicate: true })
      : NextResponse.json({ error: "Could not store the report" }, { status: 500 });
  }

  await log({
    orgId: profile.org_id,
    ok: true,
    statusCode: 200,
    matchedProfileId: profile.id,
    rawBody: payload,
  });

  return NextResponse.json({
    ok: true,
    person: profile.full_name,
    report_date: reportDate,
    verified: Boolean(token),
  });
}

export async function GET() {
  return NextResponse.json({ error: "POST only" }, { status: 405 });
}
