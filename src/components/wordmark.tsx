"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Drop your logo at public/logo.svg and it replaces the navy lettermark
 * automatically. No other change needed.
 *
 * The lettermark is what renders by default and the image is swapped in only
 * once it has genuinely decoded, so a missing file shows the mark rather than a
 * broken-image glyph. The useEffect matters: an <img> that finishes (or fails)
 * before React hydrates never fires onLoad/onError, so the handlers alone would
 * miss it on a cold page load — `complete` + `naturalWidth` catches that case.
 *
 * If your logo is a full lockup that already contains the word "Sysora", pass
 * showText={false} so the name isn't printed twice.
 */
const LOGO_SRC = "/logo.svg";

export function Wordmark({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  const [logoOk, setLogoOk] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) setLogoOk(true);
  }, []);

  return (
    <span className={cn("flex items-center gap-2 select-none", className)}>
      {/* Hidden until proven good. display:none still triggers loading. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={LOGO_SRC}
        alt="Sysora"
        onLoad={(e) => setLogoOk(e.currentTarget.naturalWidth > 0)}
        onError={() => setLogoOk(false)}
        className={cn("h-7 w-auto max-w-32 object-contain", logoOk ? "block" : "hidden")}
      />

      {logoOk ? null : (
        <span
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-[7px] bg-navy text-[13px] font-bold text-mint"
        >
          S
        </span>
      )}

      {showText ? (
        <span className="text-[15px] font-semibold tracking-tight text-navy">
          Sysora<span className="text-mint">.</span>
        </span>
      ) : null}
    </span>
  );
}
