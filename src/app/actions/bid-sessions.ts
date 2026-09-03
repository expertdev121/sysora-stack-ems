"use server";

import { revalidatePath } from "next/cache";
import { createSalesClient } from "@/lib/supabase/sales";
import { getSession } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

/**
 * Starting and stopping the bidding clock.
 *
 * Written through the anon-key client on purpose: the RLS policies are the
 * real gate. bid_sessions_insert_own insists user_id is your own, so nobody
 * can open or close a clock against somebody else's name however this is
 * called.
 *
 * Both timestamps come from the database (now()), never from the browser.
 * A client-supplied time would let anyone log an eight-hour session by
 * editing one number, and would be wrong by however far their laptop clock
 * has drifted even when nobody is trying.
 */

/** A stretch of bidding. `ended_at` null means it is still running. */
export type BidSession = {
  id: string;
  started_at: string;
  ended_at: string | null;
};

export async function startBidSession(): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again." };

  const supabase = await createSalesClient();

  const { error } = await supabase
    .from("bid_sessions")
    .insert({ user_id: session.userId });

  if (error) {
    // The partial unique index on (user_id) where ended_at is null. Somebody
    // double-clicked, or left a clock running in another tab.
    if (error.code === "23505") {
      return { ok: false, error: "A timer is already running." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/bids");
  return { ok: true, message: "Timer started." };
}

export async function stopBidSession(): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again." };

  const supabase = await createSalesClient();

  // Closed by matching the open row rather than by id, so a stale tab holding
  // an old id cannot close a session that has already been stopped and
  // reopened.
  const { data, error } = await supabase
    .from("bid_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("user_id", session.userId)
    .is("ended_at", null)
    .select("id, started_at, ended_at");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "No timer was running." };

  const row = data[0] as BidSession;
  const seconds = Math.max(
    Math.round(
      (new Date(row.ended_at ?? Date.now()).getTime() - new Date(row.started_at).getTime()) / 1000,
    ),
    0,
  );

  revalidatePath("/bids");
  return { ok: true, message: `Logged ${humanSpan(seconds)} of bidding.` };
}

/**
 * Throw a session away.
 *
 * The escape hatch for a clock left running overnight. Without it one
 * forgotten timer sits in every total from then on and there is no honest way
 * to correct it — which is how people stop trusting the number and stop using
 * the feature.
 */
export async function discardBidSession(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in again." };

  const supabase = await createSalesClient();

  const { error } = await supabase.from("bid_sessions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/bids");
  return { ok: true, message: "Discarded." };
}

function humanSpan(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0 && m === 0) return "under a minute";
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
