import { cn } from "@/lib/utils";

/**
 * Deep Navy wordmark with a single mint accent — the one saturated mark on the
 * page furniture.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 select-none", className)}>
      <span
        aria-hidden
        className="grid h-7 w-7 place-items-center rounded-[7px] bg-navy text-[13px] font-bold text-mint"
      >
        S
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-navy">
        Sysora<span className="text-mint">.</span>
      </span>
    </span>
  );
}
