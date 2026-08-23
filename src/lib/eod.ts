import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * n8n EOD form integration.
 *
 * The n8n Form Trigger prefills a field by matching a query parameter to that
 * field's LABEL. Labels are yours, not ours, so every parameter name is an env
 * var rather than a hardcoded string — change a label in n8n, change the env
 * var, no deploy of this app required.
 */
export const EOD_PARAMS = {
  userId: process.env.N8N_EOD_PARAM_USER_ID || "user_id",
  name: process.env.N8N_EOD_PARAM_NAME || "name",
  email: process.env.N8N_EOD_PARAM_EMAIL || "email",
  date: process.env.N8N_EOD_PARAM_DATE || "date",
  token: process.env.N8N_EOD_PARAM_TOKEN || "token",
} as const;

// The EOD form is now native (src/components/eod-form.tsx) and writes straight
// to public.eod_reports, so there is no embedded form URL and nothing to
// prefill. What remains here supports the inbound webhook only, which is kept
// as an optional way to pipe reports in from elsewhere.

/**
 * Ties a submission to a person for a given day.
 *
 * Without this, anyone could edit the user_id in the form URL and file an EOD
 * as a colleague. The webhook verifies the token when the form echoes it back,
 * and falls back to plain id/email matching when it doesn't — so the
 * integration works on day one and gets stricter the moment you add the field.
 */
export function eodToken(profileId: string, reportDate: string): string | null {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret)
    .update(`${profileId}:${reportDate}`)
    .digest("base64url")
    .slice(0, 32);
}

export function verifyEodToken(
  token: string,
  profileId: string,
  reportDate: string,
): boolean {
  const expected = eodToken(profileId, reportDate);
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** First non-empty string value among the given keys, case-insensitively. */
export function pickField(
  payload: Record<string, unknown>,
  keys: string[],
): string | null {
  const lower = new Map(
    Object.entries(payload).map(([key, value]) => [key.toLowerCase().trim(), value]),
  );
  for (const key of keys) {
    const value = lower.get(key.toLowerCase().trim());
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

/** Flattens one level of nesting, which is how n8n often wraps form data. */
export function normalisePayload(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;

  for (const wrapper of ["data", "body", "formData", "form_data", "json"]) {
    const inner = record[wrapper];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return { ...(inner as Record<string, unknown>), ...record };
    }
  }
  return record;
}
