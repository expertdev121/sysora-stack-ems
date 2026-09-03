"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRESETS = [15, 25, 45, 60] as const;
const STORE_KEY = "sysora_bid_timer";

/**
 * A focus timer for a bidding session.
 *
 * Nothing here is reported to anyone. It is a clock to work against, not a
 * measurement of the person — a BDE sets a length, runs it, and that is the
 * whole of it. Deliberately no server call, no row, no "time spent" that
 * turns up in somebody else's dashboard later.
 *
 * The state is an absolute end timestamp rather than a decrementing counter.
 * A counter loses time whenever the browser throttles a background tab, so a
 * 25-minute timer in a tab you switched away from would finish late and
 * quietly under-report. Reading the clock each tick cannot drift.
 *
 * It survives a reload for the same reason it survives a tab switch: the
 * end time is in localStorage, so navigating to log a bid mid-session does
 * not reset the timer you are working against.
 */

type Saved = {
  /** Epoch ms when the timer finishes. Only meaningful while running. */
  endsAt: number | null;
  /** Milliseconds left, held while paused (or before starting). */
  remaining: number;
  running: boolean;
  minutes: number;
};

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    if (typeof parsed.remaining !== "number" || typeof parsed.minutes !== "number") return null;
    return parsed;
  } catch {
    // Private windows and blocked site data both throw here. A timer is not
    // worth breaking the page over.
    return null;
  }
}

function save(state: Saved) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* Nothing to do — the timer still works, it just won't survive a reload. */
  }
}

function format(ms: number): string {
  const total = Math.max(Math.ceil(ms / 1000), 0);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function BidTimer() {
  const [minutes, setMinutes] = useState<number>(25);
  const [remaining, setRemaining] = useState<number>(25 * 60_000);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const endsAt = useRef<number | null>(null);

  // Restore on mount only. Rendering the stored value on the server is
  // impossible — localStorage does not exist there — so the first paint is
  // the default and this corrects it.
  useEffect(() => {
    const saved = load();
    if (saved) {
      setMinutes(saved.minutes);
      if (saved.running && saved.endsAt) {
        endsAt.current = saved.endsAt;
        setRemaining(Math.max(saved.endsAt - Date.now(), 0));
        setRunning(saved.endsAt > Date.now());
      } else {
        setRemaining(saved.remaining);
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!running) return;

    const tick = () => {
      const left = Math.max((endsAt.current ?? 0) - Date.now(), 0);
      setRemaining(left);
      if (left === 0) {
        setRunning(false);
        endsAt.current = null;
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [running]);

  // Persist whenever anything settles.
  useEffect(() => {
    if (!ready) return;
    save({ endsAt: endsAt.current, remaining, running, minutes });
  }, [ready, remaining, running, minutes]);

  const start = useCallback(() => {
    const from = remaining > 0 ? remaining : minutes * 60_000;
    endsAt.current = Date.now() + from;
    setRemaining(from);
    setRunning(true);
  }, [remaining, minutes]);

  const pause = useCallback(() => {
    setRemaining(Math.max((endsAt.current ?? 0) - Date.now(), 0));
    endsAt.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback(
    (mins: number) => {
      endsAt.current = null;
      setRunning(false);
      setMinutes(mins);
      setRemaining(mins * 60_000);
    },
    [],
  );

  const done = ready && remaining === 0 && !running;
  const total = minutes * 60_000;
  const progress = total > 0 ? 1 - Math.min(remaining / total, 1) : 0;

  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4 shadow-xs">
      {/* The left block truncates rather than growing, so the longer "time is
          up" line cannot push the controls onto a second row and shove the bid
          form down the page. The controls still wrap on a narrow phone, which
          is the one place the extra row is worth having. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4",
              done ? "bg-mint text-white" : "bg-mint-50 text-mint-deep",
            )}
          >
            <Timer />
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "font-display text-[30px] leading-none font-extrabold tracking-[-1px] tabular",
                done ? "text-mint-deep" : "text-navy",
              )}
              // A screen reader should not have every quarter-second announced.
              aria-live="off"
            >
              {/* Placeholder width until the stored value is read, so the
                  number does not jump on hydration. */}
              {ready ? format(remaining) : "--:--"}
            </p>
            <p className="mt-1 truncate text-xs text-ink-muted">
              {done
                ? `${minutes} minutes up — log what you bid on.`
                : running
                  ? `${minutes}-minute session running`
                  : remaining < total
                    ? "Paused"
                    : "Set a length and start bidding"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={m === minutes ? "secondary" : "quiet"}
              aria-pressed={m === minutes}
              onClick={() => reset(m)}
            >
              {m}m
            </Button>
          ))}

          <Button
            type="button"
            size="sm"
            variant="primary"
            className="ml-1"
            disabled={!ready}
            onClick={running ? pause : start}
          >
            {running ? (
              <>
                <Pause /> Pause
              </>
            ) : (
              <>
                <Play /> {remaining < total && remaining > 0 ? "Resume" : "Start"}
              </>
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Reset the timer"
            disabled={!ready || (!running && remaining === total)}
            onClick={() => reset(minutes)}
          >
            <RotateCcw />
          </Button>
        </div>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-mint-50">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            done ? "bg-mint-deep" : "bg-mint",
          )}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
