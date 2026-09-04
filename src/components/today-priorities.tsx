"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * What's urgent today.
 *
 * Deliberately not in the database. This is a scratchpad — the two lines you
 * write at 9am so you remember what today was supposed to be about — and the
 * moment it is stored on a server it becomes something a manager can read,
 * which changes what people are willing to write on it. Keeping it in the
 * browser keeps it honest.
 *
 * The consequences of that are real and worth stating: it lives on one
 * machine, in one browser, and clearing site data clears it. That is the
 * trade, and for a daily scratchpad it is the right one.
 *
 * Unfinished items carry over to the next day and finished ones do not. A
 * list that wiped itself at midnight would quietly lose the thing you did not
 * get to, which is exactly the item most worth keeping.
 */

type Item = { id: string; text: string; done: boolean; carried: boolean };
type Stored = { day: string; items: Item[] };

const MAX_ITEMS = 12;
const MAX_LEN = 160;

function keyFor(userId: string) {
  return `sysora_priorities_${userId}`;
}

export function TodayPriorities({ userId, today }: { userId: string; today: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");
  // Nothing is rendered from storage until after mount: the server has no
  // localStorage, and painting a different list on the client is a hydration
  // mismatch.
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(userId));
      if (raw) {
        const saved = JSON.parse(raw) as Stored;
        if (Array.isArray(saved.items)) {
          setItems(
            saved.day === today
              ? saved.items
              : // A new day: keep what is still outstanding, drop what is done.
                saved.items.filter((i) => !i.done).map((i) => ({ ...i, carried: true })),
          );
        }
      }
    } catch {
      // Private windows and blocked site data both throw. A scratchpad is not
      // worth breaking the dashboard over.
    }
    setReady(true);
  }, [userId, today]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(keyFor(userId), JSON.stringify({ day: today, items }));
    } catch {
      /* Nothing to do — the list still works for this session. */
    }
  }, [ready, items, userId, today]);

  function add() {
    const text = draft.trim().slice(0, MAX_LEN);
    if (!text || items.length >= MAX_ITEMS) return;
    setItems((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, done: false, carried: false },
    ]);
    setDraft("");
    inputRef.current?.focus();
  }

  const outstanding = items.filter((i) => !i.done).length;
  const carried = items.filter((i) => i.carried && !i.done).length;

  return (
    <section className="mb-8 rounded-xl border border-line bg-surface p-5 shadow-xs">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[15px] font-bold tracking-[-0.2px] text-navy">
          Today&rsquo;s priorities
        </h2>
        <p className="m-0 text-xs text-ink-muted">
          {!ready
            ? " "
            : outstanding === 0
              ? items.length === 0
                ? "Just this browser — never saved to the server"
                : "All clear"
              : `${outstanding} to go${carried > 0 ? ` · ${carried} from before` : ""}`}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex items-center gap-2"
      >
        <Input
          ref={inputRef}
          value={draft}
          maxLength={MAX_LEN}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What has to happen today?"
          aria-label="Add a priority"
          disabled={!ready || items.length >= MAX_ITEMS}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={!ready || !draft.trim() || items.length >= MAX_ITEMS}
          aria-label="Add"
        >
          <Plus />
        </Button>
      </form>

      {ready && items.length >= MAX_ITEMS ? (
        <p className="mt-2 mb-0 text-xs text-ink-muted">
          That&rsquo;s {MAX_ITEMS} — a list this long is not a list of priorities. Finish or drop
          something first.
        </p>
      ) : null}

      {ready && items.length > 0 ? (
        <ul className="mt-3 flex flex-col divide-y divide-line-soft">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <button
                type="button"
                aria-label={item.done ? `Mark ${item.text} unfinished` : `Mark ${item.text} done`}
                aria-pressed={item.done}
                onClick={() =>
                  setItems((prev) =>
                    prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
                  )
                }
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-md border transition-colors [&_svg]:size-3",
                  item.done
                    ? "border-mint bg-mint text-white"
                    : "border-line-strong bg-surface text-transparent hover:border-mint",
                )}
              >
                <Check />
              </button>

              <span
                className={cn(
                  "min-w-0 flex-1 text-[13px] leading-[1.5]",
                  item.done ? "text-ink-faint line-through" : "text-ink",
                )}
              >
                {item.text}
                {item.carried && !item.done ? (
                  <span className="ml-2 rounded-full border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                    carried over
                  </span>
                ) : null}
              </span>

              <Button
                type="button"
                size="sm"
                variant="quiet"
                aria-label={`Remove ${item.text}`}
                onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
