"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Play, Square, Timer, Trash2 } from "lucide-react";

import {
  discardBidSession,
  startBidSession,
  stopBidSession,
  type BidSession,
} from "@/app/actions/bid-sessions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The bidding clock.
 *
 * Counts up from zero: you start it when you sit down to bid and stop it when
 * you are done, and stopping writes the stretch to the database. The question
 * it answers is "how long did I spend bidding", which a countdown cannot
 * answer — a countdown tells you how long is left of a length you guessed in
 * advance.
 *
 * The running clock lives in the database, not here. `startedAt` comes from
 * the server, so closing the laptop, reloading, or picking the work up on
 * another machine all leave the session intact — and the elapsed figure is
 * derived from a timestamp nobody can edit from the console.
 *
 * This component only renders the difference between that timestamp and now.
 */
export function BidTimer({
  open,
  todaySeconds,
  weekSeconds,
  recent,
}: {
  /** The session still running, if there is one. */
  open: BidSession | null;
  todaySeconds: number;
  weekSeconds: number;
  recent: BidSession[];
}) {
  const [pending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(() => since(open?.started_at));

  // Recomputed from the timestamp each tick rather than incremented, so a
  // throttled background tab catches up the moment it is looked at again
  // instead of silently under-counting the session.
  useEffect(() => {
    if (!open) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(since(open.started_at));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open]);

  const running = Boolean(open);

  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4",
              running ? "bg-mint text-white" : "bg-mint-50 text-mint-deep",
            )}
          >
            <Timer />
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "font-display text-[30px] leading-none font-extrabold tracking-[-1px] tabular",
                running ? "text-mint-deep" : "text-navy",
              )}
            >
              {clock(running ? elapsed : todaySeconds)}
            </p>
            <p className="mt-1 truncate text-xs text-ink-muted">
              {running
                ? `Running since ${timeOf(open!.started_at)} — stop it to log the time`
                : todaySeconds > 0
                  ? "Bidding logged today"
                  : "Start the clock when you begin bidding"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={running ? "secondary" : "primary"}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = running ? await stopBidSession() : await startBidSession();
                if (result.ok) toast.success(result.message ?? "Done.");
                else toast.error(result.error);
              })
            }
          >
            {running ? (
              <>
                <Square /> Stop and log
              </>
            ) : (
              <>
                <Play /> Start bidding
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line-soft pt-3">
        <Total label="Today" seconds={todaySeconds + (running ? elapsed : 0)} />
        <Total label="This week" seconds={weekSeconds + (running ? elapsed : 0)} />
        {recent.length > 0 ? <RecentSessions sessions={recent} /> : null}
      </div>
    </div>
  );
}

function Total({ label, seconds }: { label: string; seconds: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-ink-faint">
        {label}
      </span>
      <span className="text-[13px] font-bold text-navy tabular">{span(seconds)}</span>
    </div>
  );
}

/**
 * The last few stretches, each throwable-away.
 *
 * A clock left running overnight would otherwise sit in every total from then
 * on with no honest way to correct it, and one wrong number is enough to stop
 * anybody trusting the rest.
 */
function RecentSessions({ sessions }: { sessions: BidSession[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <details className="group ml-auto">
      <summary className="cursor-pointer list-none text-xs font-medium text-mint-deep hover:underline [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Recent sessions</span>
        <span className="hidden group-open:inline">Hide sessions</span>
      </summary>
      <ul className="mt-2 w-full divide-y divide-line-soft">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 py-1.5">
            <span className="text-xs text-ink-muted">
              {dayOf(s.started_at)} · {timeOf(s.started_at)}
              {s.ended_at ? `–${timeOf(s.ended_at)}` : ""}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs font-semibold text-navy tabular">
                {span(seconds(s))}
              </span>
              <Button
                type="button"
                size="sm"
                variant="quiet"
                disabled={pending}
                aria-label="Discard this session"
                onClick={() =>
                  startTransition(async () => {
                    const result = await discardBidSession(s.id);
                    if (result.ok) toast.success(result.message ?? "Discarded.");
                    else toast.error(result.error);
                  })
                }
              >
                <Trash2 className="size-3" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ---- formatting ------------------------------------------------ */

function since(startedAt?: string): number {
  if (!startedAt) return 0;
  return Math.max(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000), 0);
}

function seconds(s: BidSession): number {
  const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
  return Math.max(Math.floor((end - new Date(s.started_at).getTime()) / 1000), 0);
}

/** hh:mm:ss for the big readout, so a long session does not wrap. */
function clock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "1h 20m" for totals, where seconds are noise. */
function span(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (h === 0 && m === 0) return total > 0 ? "<1m" : "—";
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
