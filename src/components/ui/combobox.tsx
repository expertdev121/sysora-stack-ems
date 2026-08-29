"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Secondary text, shown dimmed beside the label and matched by search. */
  hint?: string;
};

/**
 * A select you can type into.
 *
 * The native <select> is fine at six options and useless at sixty — which is
 * what the client list became. This keeps the parts that make a native select
 * worth using (it posts a value with the form, it is a single tab stop, the
 * keyboard works) and adds the part it lacks.
 *
 * The value is carried by a hidden input rather than component state alone, so
 * every existing server action that reads FormData keeps working untouched.
 *
 * Filtering is per-word rather than substring: "brandy ghl" matches "Brandy GHL
 * account" and also "GHL — Brandy", because people remember the words in a name
 * but not their order.
 */
export function Combobox({
  name,
  options,
  defaultValue = "",
  value: controlledValue,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Type to filter…",
  emptyText = "Nothing matches.",
  id,
  disabled,
  required,
  allowClear = false,
  clearLabel = "Any",
  allowCustom = false,
  className,
}: {
  name?: string;
  options: ComboboxOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  /** Adds a leading option that clears the selection. */
  allowClear?: boolean;
  clearLabel?: string;
  /**
   * Let the typed text be the answer when it matches nothing. Needed wherever
   * the list is a record of what has been used rather than a fixed set — a new
   * client should not require a code change to add.
   */
  allowCustom?: boolean;
  className?: string;
}) {
  const isControlled = controlledValue !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const value = isControlled ? controlledValue : uncontrolled;

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [dropUp, setDropUp] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const reactId = React.useId();
  const listboxId = `${reactId}-listbox`;

  const shown = React.useMemo(() => {
    const base: ComboboxOption[] = allowClear
      ? [{ value: "", label: clearLabel }, ...options]
      : options;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return base;

    const hits = base.filter((option) => {
      const haystack = `${option.label} ${option.hint ?? ""} ${option.value}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });

    // Offer the typed text itself unless an option already says exactly that,
    // in which case picking the existing one is what the person meant.
    const typed = query.trim();
    const exists = base.some((o) => o.label.toLowerCase() === typed.toLowerCase());
    if (allowCustom && typed && !exists) {
      return [...hits, { value: typed, label: typed, hint: "add new" }];
    }
    return hits;
  }, [options, query, allowClear, clearLabel, allowCustom]);

  const selected =
    options.find((option) => option.value === value) ??
    (allowCustom && value ? { value, label: value } : null);

  function commit(next: string) {
    if (!isControlled) setUncontrolled(next);
    onChange?.(next);
    setOpen(false);
    setQuery("");
  }

  // Close when focus or a click leaves the whole control.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    // Inside a scrolling dialog, a panel opening downward from a field near
    // the bottom is clipped by the container. Measure once on open and flip
    // upward when there is more room there.
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setDropUp(below < 280 && rect.top > below);
    }
  }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  React.useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[active] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  React.useEffect(() => setActive(0), [query]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((current) => {
        if (shown.length === 0) return 0;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        return (current + delta + shown.length) % shown.length;
      });
      return;
    }

    if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = shown[active];
      if (option) commit(option.value);
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      return;
    }

    if (event.key === "Tab") setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}

      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-haspopup="listbox"
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm",
          "transition-colors hover:border-line-strong focus:border-mint focus:outline-none",
          "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-faint",
          open && "border-mint",
        )}
      >
        <span className={cn("flex-1 truncate", selected ? "text-ink" : "text-ink-faint")}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.hint ? (
          <span className="hidden shrink-0 text-xs text-ink-faint sm:inline">{selected.hint}</span>
        ) : null}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-ink-faint transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          className={cn(
            "absolute z-50 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg",
            dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          <div className="relative border-b border-line-soft">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-autocomplete="list"
              aria-controls={listboxId}
              className="h-10 w-full bg-transparent pr-8 pl-9 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear filter"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-faint hover:text-navy"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          {shown.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink-muted">{emptyText}</p>
          ) : (
            <ul ref={listRef} id={listboxId} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {shown.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value || "__clear__"}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => commit(option.value)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                      index === active ? "bg-mint-50 text-navy" : "text-ink",
                    )}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0 text-mint-deep",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="shrink-0 text-xs text-ink-faint">{option.hint}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
